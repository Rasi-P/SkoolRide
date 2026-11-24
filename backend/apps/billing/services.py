from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import F, Sum
from django.utils import timezone

from apps.core.audit import record_audit
from apps.core.exceptions import ConflictError, DomainError, StateTransitionError

from .gateways import GatewayError, get_gateway
from .models import (
    ZERO,
    FeePlan,
    Invoice,
    InvoiceLineItem,
    NumberSequence,
    Payment,
    PaymentAdjustment,
    PaymentAllocation,
    Receipt,
    StudentFeeAssignment,
)


def _lock_school(school):
    """Serialize financial mutations per tenant, with a consistent lock order."""
    from apps.schools.models import School

    School.objects.select_for_update().only("id").get(pk=school.pk)


def next_number(school, key: str, prefix: str) -> str:
    """Atomic per-school counter. Must be called inside a transaction."""
    seq, _ = NumberSequence.objects.select_for_update().get_or_create(school=school, key=key)
    seq.value = F("value") + 1
    seq.save(update_fields=["value"])
    seq.refresh_from_db()
    return f"{prefix}-{school.code}-{seq.value:05d}"


@transaction.atomic
def assign_fee_plan(
    *, school, student, fee_plan: FeePlan, start_date=None, discount_amount=ZERO, discount_reason="", notes="", request=None
) -> StudentFeeAssignment:
    if fee_plan.school_id != school.id or student.school_id != school.id:
        raise DomainError("Fee plan and student must belong to this school.")
    StudentFeeAssignment.objects.filter(student=student, is_active=True).update(is_active=False, end_date=timezone.localdate())
    fa = StudentFeeAssignment.objects.create(
        school=school,
        student=student,
        fee_plan=fee_plan,
        start_date=start_date or timezone.localdate(),
        discount_amount=discount_amount or ZERO,
        discount_reason=discount_reason,
        notes=notes,
    )
    record_audit(
        action="billing.fee_plan_assigned",
        request=request,
        target=fa,
        changes={"student": student.full_name, "plan": fee_plan.code, "discount": str(discount_amount)},
    )
    return fa


def _primary_parent(student):
    link = student.guardian_links.select_related("parent").filter(is_primary=True).first() or student.guardian_links.select_related("parent").first()
    return link.parent if link else None


@transaction.atomic
def create_invoice(
    *,
    school,
    student,
    fee_plan,
    period_label,
    period_start,
    period_end,
    due_date,
    amount=None,
    discount=ZERO,
    description=None,
    actor=None,
    request=None,
    late_fee=ZERO,
) -> Invoice:
    _lock_school(school)
    if student.school_id != school.id or fee_plan.school_id != school.id:
        raise DomainError("Student and fee plan must belong to this school.")
    if (
        Invoice.objects.filter(student=student, period_start=period_start, period_end=period_end, fee_plan=fee_plan)
        .exclude(status=Invoice.Status.CANCELLED)
        .exists()
    ):
        raise ConflictError(f"An invoice for {student.full_name} for {period_label} already exists.")
    amount = Decimal(amount if amount is not None else fee_plan.amount)
    invoice = Invoice.objects.create(
        school=school,
        invoice_number=next_number(school, "invoice", "INV"),
        student=student,
        billed_to=_primary_parent(student),
        fee_plan=fee_plan,
        period_label=period_label,
        period_start=period_start,
        period_end=period_end,
        due_date=due_date,
        currency=school.currency,
        discount=Decimal(discount or ZERO),
        late_fee=Decimal(late_fee or ZERO),
    )
    InvoiceLineItem.objects.create(
        school=school,
        invoice=invoice,
        description=description or f"{fee_plan.name} - {period_label}",
        quantity=1,
        unit_amount=amount,
    )
    invoice.recompute()
    invoice.save()
    record_audit(
        action="billing.invoice_created",
        request=request,
        actor=actor,
        target=invoice,
        changes={"student": student.full_name, "total": str(invoice.total)},
    )
    return invoice


def _period_for(cycle: str, anchor: date) -> tuple[date, date, str]:
    if cycle == FeePlan.Cycle.MONTHLY:
        start = anchor.replace(day=1)
        nxt = (start + timedelta(days=32)).replace(day=1)
        return start, nxt - timedelta(days=1), start.strftime("%B %Y")
    if cycle == FeePlan.Cycle.TERM:
        # 3 terms: Apr-Jul, Aug-Nov, Dec-Mar (Indian academic calendar default)
        m = anchor.month
        if 4 <= m <= 7:
            return date(anchor.year, 4, 1), date(anchor.year, 7, 31), f"Term 1 {anchor.year}"
        if 8 <= m <= 11:
            return date(anchor.year, 8, 1), date(anchor.year, 11, 30), f"Term 2 {anchor.year}"
        y = anchor.year if m == 12 else anchor.year - 1
        return date(y, 12, 1), date(y + 1, 3, 31), f"Term 3 {y}-{str(y + 1)[-2:]}"
    y = anchor.year if anchor.month >= 4 else anchor.year - 1
    return date(y, 4, 1), date(y + 1, 3, 31), f"Academic year {y}-{str(y + 1)[-2:]}"


@transaction.atomic
def generate_invoices(*, school, anchor_date: date, due_date: date | None = None, students=None, actor=None, request=None) -> dict:
    """Create one invoice per active fee assignment for the billing period containing `anchor_date`."""
    qs = StudentFeeAssignment.objects.filter(school=school, is_active=True, student__status="ACTIVE").select_related("student", "fee_plan")
    if students:
        qs = qs.filter(student__in=students)
    created, skipped = [], 0
    for fa in qs:
        start, end, label = _period_for(fa.fee_plan.billing_cycle, anchor_date)
        if fa.start_date > end or (fa.end_date and fa.end_date < start):
            skipped += 1
            continue
        due = due_date or min(end, start + timedelta(days=max(1, school.fee_due_day - 1)))
        if due_date is None and due < timezone.localdate():
            due = timezone.localdate() + timedelta(days=7)  # generated after the usual due day: give a week
        try:
            created.append(
                create_invoice(
                    school=school,
                    student=fa.student,
                    fee_plan=fa.fee_plan,
                    period_label=label,
                    period_start=start,
                    period_end=end,
                    due_date=due,
                    discount=fa.discount_amount,
                    actor=actor,
                )
            )
        except ConflictError:
            skipped += 1
    record_audit(
        action="billing.invoices_generated",
        request=request,
        actor=actor,
        school=school,
        changes={"anchor": str(anchor_date), "created": len(created), "skipped": skipped},
    )
    from apps.notifications.services import notify_student_guardians

    for inv in created:
        notify_student_guardians(
            student=inv.student,
            category="FEE_DUE",
            title="Transport fee invoice issued",
            body=f"Invoice {inv.invoice_number} for {inv.period_label} ({inv.currency} {inv.total}) is due on {inv.due_date:%d %b %Y}.",
            dedupe_key=f"invoice:{inv.id}:issued",
            data={"invoice_id": str(inv.id)},
        )
    return {"created": created, "skipped": skipped}


def _allocate(payment: Payment, invoices=None) -> list[PaymentAllocation]:
    """Allocate a verified payment to the student's open invoices (oldest due first)."""
    remaining = payment.amount
    allocations = []
    if invoices is None:
        invoices = (
            Invoice.objects.select_for_update()
            .filter(school=payment.school, student=payment.student, status__in=Invoice.OPEN_STATUSES)
            .order_by("due_date", "created_at")
        )
    for inv in invoices:
        if remaining <= ZERO:
            break
        bal = inv.balance
        if bal <= ZERO:
            continue
        amt = min(bal, remaining)
        allocations.append(PaymentAllocation.objects.create(school=payment.school, payment=payment, invoice=inv, amount=amt))
        remaining -= amt
        inv.recompute()
        inv.save()
    if remaining > ZERO:
        payment.notes = (payment.notes + f"\nUnallocated credit: {remaining}").strip()
        payment.save(update_fields=["notes"])
    return allocations


def _issue_receipt(payment: Payment, actor=None) -> Receipt:
    return Receipt.objects.create(
        school=payment.school, receipt_number=next_number(payment.school, "receipt", "RCT"), payment=payment, issued_by=actor
    )


@transaction.atomic
def record_offline_payment(
    *, school, student, amount, method, transaction_reference="", paid_at=None, received_by, notes="", invoice=None, idempotency_key="", request=None
) -> Payment:
    _lock_school(school)
    if student.school_id != school.id or (invoice and invoice.school_id != school.id):
        raise DomainError("Student and invoice must belong to this school.")
    transaction_reference = transaction_reference.strip()
    amount = Decimal(amount)
    if amount <= ZERO:
        raise DomainError("Amount must be positive.")
    if method == Payment.Method.ONLINE:
        raise DomainError("Online payments must be verified through the gateway, not recorded manually.")
    if idempotency_key:
        existing = Payment.objects.filter(school=school, idempotency_key=idempotency_key).first()
        if existing:
            if existing.student_id != student.id or existing.amount != amount or existing.method != method:
                raise ConflictError("This idempotency key was used for a different payment.")
            return existing
    if transaction_reference and Payment.objects.filter(school=school, transaction_reference=transaction_reference).exists():
        raise ConflictError(f"Transaction reference '{transaction_reference}' has already been recorded.")
    if invoice is not None and invoice.student_id != student.id:
        raise DomainError("Invoice does not belong to this student.")
    if invoice is not None:
        invoice = Invoice.objects.select_for_update().get(pk=invoice.pk)
        if invoice.status not in Invoice.OPEN_STATUSES or amount > invoice.balance:
            raise DomainError("Payment exceeds this invoice's current outstanding balance.")
    payment = Payment.objects.create(
        school=school,
        payment_number=next_number(school, "payment", "PAY"),
        student=student,
        paid_by=_primary_parent(student),
        amount=amount,
        currency=school.currency,
        method=method,
        status=Payment.Status.VERIFIED,
        transaction_reference=transaction_reference.strip(),
        paid_at=paid_at or timezone.now(),
        verified_at=timezone.now(),
        received_by=received_by,
        notes=notes,
        idempotency_key=idempotency_key,
    )
    invoices = [Invoice.objects.select_for_update().get(pk=invoice.pk)] if invoice else None
    _allocate(payment, invoices)
    _issue_receipt(payment, actor=received_by)
    record_audit(
        action="billing.payment_recorded",
        request=request,
        actor=received_by,
        target=payment,
        changes={"amount": str(amount), "method": method, "reference": transaction_reference},
    )
    from apps.notifications.services import notify_student_guardians

    notify_student_guardians(
        student=student,
        category="PAYMENT_RECEIVED",
        title="Payment received",
        body=f"We received {school.currency} {amount} ({method.replace('_', ' ').title()}). Receipt {payment.receipt.receipt_number}.",
        dedupe_key=f"payment:{payment.id}",
        data={"payment_id": str(payment.id)},
    )
    return payment


@transaction.atomic
def create_online_payment(*, school, student, parent_profile, invoice: Invoice, user) -> tuple[Payment, dict]:
    _lock_school(school)
    invoice = Invoice.objects.select_for_update().get(pk=invoice.pk)
    if invoice.student_id != student.id or invoice.school_id != school.id:
        raise DomainError("Invoice does not belong to this student.")
    if invoice.status not in Invoice.OPEN_STATUSES or invoice.balance <= ZERO:
        raise DomainError("Invoice has no outstanding balance.")
    gateway = get_gateway()
    amount = invoice.balance
    # Supersede earlier pending attempts for this invoice so only one order can settle it.
    Payment.objects.filter(status=Payment.Status.PENDING, method=Payment.Method.ONLINE, allocations__invoice=invoice).update(
        status=Payment.Status.FAILED, notes="Superseded by a newer payment attempt"
    )
    order = gateway.create_order(
        amount=amount, currency=invoice.currency, reference=invoice.invoice_number, customer={"name": user.full_name, "email": user.email}
    )
    payment = Payment.objects.create(
        school=school,
        payment_number=next_number(school, "payment", "PAY"),
        student=student,
        paid_by=parent_profile,
        amount=amount,
        currency=invoice.currency,
        method=Payment.Method.ONLINE,
        status=Payment.Status.PENDING,
        gateway=gateway.name,
        gateway_order_id=order["order_id"],
        is_simulated=gateway.is_simulated,
        notes=f"Online payment for {invoice.invoice_number}",
    )
    PaymentAllocation.objects.create(school=school, payment=payment, invoice=invoice, amount=amount)
    return payment, order


def verify_online_payment(*, payload: dict, user=None, request=None) -> Payment:
    """Server-side verification. A payment is only VERIFIED when the gateway signature checks out."""
    gateway = get_gateway()
    try:
        verified = gateway.verify_payment(payload)
    except GatewayError as exc:
        # A forged/invalid callback must not be able to fail a legitimate pending payment: leave it PENDING, audit the attempt.
        pending = Payment.objects.filter(gateway=gateway.name, gateway_order_id=payload.get("order_id", "")).first()
        record_audit(
            action="billing.online_payment_verification_failed",
            request=request,
            actor=user,
            target=pending,
            school=pending.school if pending else None,
            changes={"reason": str(exc)},
        )
        raise DomainError(f"Payment verification failed: {exc}") from exc
    with transaction.atomic():
        return _settle_verified_payment(gateway, verified, user=user, request=request)


def _settle_verified_payment(gateway, verified, *, user=None, request=None) -> Payment:
    payment = Payment.objects.filter(gateway=gateway.name, gateway_order_id=verified.order_id).first()
    if payment is None:
        raise DomainError("Unknown payment order.")
    _lock_school(payment.school)
    payment = Payment.objects.select_for_update().get(pk=payment.pk)
    if payment.status == Payment.Status.VERIFIED:
        return payment  # idempotent replay
    if payment.status != Payment.Status.PENDING:
        raise StateTransitionError(f"Payment is {payment.status.lower()}.")
    if verified.currency != payment.currency:
        raise DomainError("Payment currency mismatch.")
    if verified.amount != payment.amount:
        payment.status = Payment.Status.FAILED
        payment.notes += f"\nAmount mismatch: expected {payment.amount}, gateway reported {verified.amount}"
        payment.save()
        raise DomainError("Payment amount mismatch.")
    if verified.status == "failed":
        payment.status = Payment.Status.FAILED
        payment.save(update_fields=["status", "updated_at"])
        record_audit(action="billing.online_payment_declined", actor=user, request=request, target=payment)
        return payment
    for alloc in payment.allocations.select_related("invoice"):
        inv = Invoice.objects.select_for_update().get(pk=alloc.invoice_id)
        if inv.status not in Invoice.OPEN_STATUSES or alloc.amount > inv.balance:
            raise DomainError("Invoice balance changed. Start a new payment for the current balance.")
    if Payment.objects.filter(gateway=gateway.name, gateway_payment_id=verified.payment_id).exclude(pk=payment.pk).exists():
        raise ConflictError("This gateway payment id has already been used.")
    payment.status = Payment.Status.VERIFIED
    payment.gateway_payment_id = verified.payment_id
    payment.transaction_reference = verified.payment_id
    payment.verified_at = timezone.now()
    payment.is_simulated = verified.is_simulated
    payment.save()
    for alloc in payment.allocations.select_related("invoice"):
        inv = Invoice.objects.select_for_update().get(pk=alloc.invoice_id)
        inv.recompute()
        inv.save()
    _issue_receipt(payment, actor=user)
    record_audit(
        action="billing.online_payment_verified",
        request=request,
        actor=user,
        target=payment,
        changes={"amount": str(payment.amount), "gateway": gateway.name, "simulated": payment.is_simulated},
    )
    from apps.notifications.services import notify_student_guardians

    notify_student_guardians(
        student=payment.student,
        category="PAYMENT_RECEIVED",
        title="Payment received" + (" (simulated)" if payment.is_simulated else ""),
        body=f"Your online payment of {payment.currency} {payment.amount} was verified. Receipt {payment.receipt.receipt_number}.",
        dedupe_key=f"payment:{payment.id}",
        data={"payment_id": str(payment.id)},
    )
    return payment


@transaction.atomic
def reverse_payment(*, payment: Payment, reason: str, actor, request=None) -> Payment:
    _lock_school(payment.school)
    payment = Payment.objects.select_for_update().get(pk=payment.pk)
    if payment.status != Payment.Status.VERIFIED:
        raise StateTransitionError("Only verified payments can be reversed.")
    before = {
        "status": payment.status,
        "amount": str(payment.amount),
        "allocations": [{"invoice": a.invoice.invoice_number, "amount": str(a.amount)} for a in payment.allocations.select_related("invoice")],
    }
    payment.status = Payment.Status.REVERSED
    payment.reversed_at = timezone.now()
    payment.reversal_reason = reason
    payment.save()
    for alloc in payment.allocations.select_related("invoice"):
        inv = Invoice.objects.select_for_update().get(pk=alloc.invoice_id)
        inv.recompute()
        inv.save()
    if hasattr(payment, "receipt"):
        payment.receipt.is_void = True
        payment.receipt.save(update_fields=["is_void"])
    PaymentAdjustment.objects.create(
        school=payment.school,
        payment=payment,
        kind=PaymentAdjustment.Kind.REVERSAL,
        amount=payment.amount,
        reason=reason,
        before=before,
        after={"status": payment.status},
        created_by=actor,
    )
    record_audit(action="billing.payment_reversed", request=request, actor=actor, target=payment, changes={"reason": reason})
    return payment


@transaction.atomic
def cancel_invoice(*, invoice: Invoice, reason: str, actor, request=None) -> Invoice:
    _lock_school(invoice.school)
    invoice = Invoice.objects.select_for_update().get(pk=invoice.pk)
    if invoice.amount_paid > ZERO:
        raise DomainError("Invoice has payments allocated; reverse them first.")
    if invoice.status == Invoice.Status.CANCELLED:
        raise StateTransitionError("Invoice already cancelled.")
    invoice.status = Invoice.Status.CANCELLED
    invoice.notes = (invoice.notes + f"\nCancelled: {reason}").strip()
    invoice.save()
    PaymentAdjustment.objects.create(
        school=invoice.school, invoice=invoice, kind=PaymentAdjustment.Kind.WAIVER, amount=invoice.total, reason=reason, created_by=actor
    )
    record_audit(action="billing.invoice_cancelled", request=request, actor=actor, target=invoice, changes={"reason": reason})
    return invoice


@transaction.atomic
def apply_late_fee(*, invoice: Invoice, amount, reason: str, actor, request=None) -> Invoice:
    amount = Decimal(amount)
    before = str(invoice.total)
    invoice.late_fee += amount
    invoice.recompute()
    invoice.save()
    PaymentAdjustment.objects.create(
        school=invoice.school,
        invoice=invoice,
        kind=PaymentAdjustment.Kind.LATE_FEE,
        amount=amount,
        reason=reason,
        before={"total": before},
        after={"total": str(invoice.total)},
        created_by=actor,
    )
    record_audit(action="billing.late_fee_applied", request=request, actor=actor, target=invoice, changes={"amount": str(amount)})
    return invoice


def mark_overdue_invoices(school=None) -> int:
    qs = Invoice.objects.filter(status__in=("ISSUED", "PARTIALLY_PAID"), due_date__lt=timezone.localdate())
    if school:
        qs = qs.filter(school=school)
    return qs.update(status=Invoice.Status.OVERDUE)


def financial_summary(school, date_from=None, date_to=None) -> dict:
    invoices = Invoice.objects.filter(school=school).exclude(status=Invoice.Status.CANCELLED)
    payments = Payment.objects.filter(school=school, status=Payment.Status.VERIFIED)
    if date_from:
        invoices = invoices.filter(issue_date__gte=date_from)
        payments = payments.filter(paid_at__date__gte=date_from)
    if date_to:
        invoices = invoices.filter(issue_date__lte=date_to)
        payments = payments.filter(paid_at__date__lte=date_to)
    billed = invoices.aggregate(s=Sum("total"))["s"] or ZERO
    collected = payments.aggregate(s=Sum("amount"))["s"] or ZERO
    outstanding = sum((i.balance for i in invoices.filter(status__in=Invoice.OPEN_STATUSES)), ZERO)
    overdue = sum((i.balance for i in invoices.filter(status=Invoice.Status.OVERDUE)), ZERO)
    by_method = list(payments.values("method").annotate(total=Sum("amount")).order_by("-total"))
    by_status = list(invoices.values("status").annotate(count=Sum(1), total=Sum("total")))
    from django.db.models.functions import TruncMonth

    monthly = (
        Payment.objects.filter(school=school, status=Payment.Status.VERIFIED, paid_at__gte=timezone.now() - timedelta(days=180))
        .annotate(month=TruncMonth("paid_at"))
        .values("month")
        .annotate(total=Sum("amount"))
        .order_by("month")
    )
    monthly_billed = (
        Invoice.objects.filter(school=school, issue_date__gte=timezone.localdate() - timedelta(days=180))
        .exclude(status="CANCELLED")
        .annotate(month=TruncMonth("issue_date"))
        .values("month")
        .annotate(total=Sum("total"))
        .order_by("month")
    )
    simulated = payments.filter(is_simulated=True).aggregate(s=Sum("amount"))["s"] or ZERO
    return {
        "billed": str(billed),
        "collected": str(collected),
        "outstanding": str(outstanding),
        "overdue": str(overdue),
        "simulated_collected": str(simulated),
        "invoice_count": invoices.count(),
        "payment_count": payments.count(),
        "overdue_count": invoices.filter(status=Invoice.Status.OVERDUE).count(),
        "by_method": [{"method": r["method"], "total": str(r["total"])} for r in by_method],
        "by_status": [{"status": r["status"], "count": r["count"], "total": str(r["total"] or 0)} for r in by_status],
        "monthly_collections": [{"month": r["month"].strftime("%Y-%m"), "total": str(r["total"])} for r in monthly],
        "monthly_billed": [{"month": r["month"].strftime("%Y-%m"), "total": str(r["total"])} for r in monthly_billed],
        "currency": school.currency,
    }
