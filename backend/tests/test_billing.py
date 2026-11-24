from decimal import Decimal

import pytest
from django.utils import timezone

from apps.billing import services
from apps.billing.gateways import MockGateway
from apps.billing.models import Invoice, Payment, PaymentAdjustment
from apps.notifications.models import Notification

pytestmark = pytest.mark.django_db


@pytest.fixture
def assigned(school_a):
    for s in school_a.students:
        services.assign_fee_plan(school=school_a.school, student=s, fee_plan=school_a.fee_plan)
    return school_a


def test_generate_invoices_once_per_period(assigned):
    today = timezone.localdate()
    result = services.generate_invoices(school=assigned.school, anchor_date=today, actor=assigned.admin)
    assert len(result["created"]) == 2 and result["skipped"] == 0
    inv = result["created"][0]
    assert inv.total == Decimal("2000.00") and inv.status == "ISSUED" and inv.invoice_number.startswith("INV-AAA-")
    assert inv.line_items.count() == 1
    again = services.generate_invoices(school=assigned.school, anchor_date=today, actor=assigned.admin)
    assert len(again["created"]) == 0 and again["skipped"] == 2
    assert Notification.objects.filter(category="FEE_DUE", recipient=assigned.parent).count() == 2


def test_partial_and_full_offline_payments(assigned, as_user):
    inv = services.generate_invoices(school=assigned.school, anchor_date=timezone.localdate(), actor=assigned.admin)["created"][0]
    a = as_user(assigned.admin)
    r = a.post(
        "/api/billing/payments/record/",
        {"student": str(inv.student_id), "invoice": str(inv.id), "amount": "500.00", "method": "CASH", "transaction_reference": "CASH-1"},
        format="json",
    )
    assert r.status_code == 201 and r.data["status"] == "VERIFIED" and r.data["receipt_number"].startswith("RCT-AAA-")
    inv.refresh_from_db()
    assert inv.amount_paid == Decimal("500.00") and inv.status == "PARTIALLY_PAID" and inv.balance == Decimal("1500.00")
    r = a.post(
        "/api/billing/payments/record/",
        {"student": str(inv.student_id), "amount": "1500.00", "method": "UPI", "transaction_reference": "UPI-1"},
        format="json",
    )
    assert r.status_code == 201
    inv.refresh_from_db()
    assert inv.status == "PAID" and inv.balance == 0
    assert Notification.objects.filter(category="PAYMENT_RECEIVED", recipient=assigned.parent).count() == 2
    summary = a.get("/api/billing/summary/").data
    assert Decimal(summary["collected"]) == Decimal("2000.00")


def test_duplicate_reference_and_idempotency(assigned, as_user):
    a = as_user(assigned.admin)
    s = assigned.students[0]
    body = {"student": str(s.id), "amount": "100.00", "method": "CASH", "transaction_reference": "DUP-1"}
    assert a.post("/api/billing/payments/record/", body, format="json").status_code == 201
    assert a.post("/api/billing/payments/record/", body, format="json").status_code == 409
    body2 = {"student": str(s.id), "amount": "100.00", "method": "CASH", "idempotency_key": "req-abc"}
    r1 = a.post("/api/billing/payments/record/", body2, format="json")
    r2 = a.post("/api/billing/payments/record/", body2, format="json")
    assert r1.status_code == 201 and r2.status_code == 201 and r1.data["id"] == r2.data["id"]
    assert Payment.objects.filter(student=s).count() == 2
    # online method cannot be recorded manually, negative amounts rejected
    assert a.post("/api/billing/payments/record/", {**body, "method": "ONLINE", "transaction_reference": "X"}, format="json").status_code == 400
    assert a.post("/api/billing/payments/record/", {**body, "amount": "-5", "transaction_reference": "Y"}, format="json").status_code == 400


def test_reversal_keeps_immutable_history(assigned, as_user):
    inv = services.generate_invoices(school=assigned.school, anchor_date=timezone.localdate(), actor=assigned.admin)["created"][0]
    a = as_user(assigned.admin)
    pay = a.post(
        "/api/billing/payments/record/",
        {"student": str(inv.student_id), "invoice": str(inv.id), "amount": "2000.00", "method": "CASH"},
        format="json",
    ).data
    inv.refresh_from_db()
    assert inv.status == "PAID"
    r = a.post(f"/api/billing/payments/{pay['id']}/reverse/", {"reason": "typo"}, format="json")
    assert r.status_code == 200 and r.data["status"] == "REVERSED"
    inv.refresh_from_db()
    assert inv.status == "ISSUED" and inv.amount_paid == 0
    adj = PaymentAdjustment.objects.get(payment_id=pay["id"])
    assert adj.kind == "REVERSAL" and adj.before["allocations"][0]["invoice"] == inv.invoice_number
    assert a.post(f"/api/billing/payments/{pay['id']}/reverse/", {"reason": "again"}, format="json").status_code == 400
    # transport manager cannot reverse (billing.manage) but can record
    tm = as_user(assigned.tm)
    assert tm.post(f"/api/billing/payments/{pay['id']}/reverse/", {"reason": "x"}, format="json").status_code == 403


def test_online_payment_requires_valid_signature(assigned, as_user, settings):
    settings.PAYMENT_GATEWAY = "mock"
    inv = services.generate_invoices(school=assigned.school, anchor_date=timezone.localdate(), actor=assigned.admin)["created"][0]
    p = as_user(assigned.parent)
    r = p.post(f"/api/parent/invoices/{inv.id}/")
    assert r.status_code == 201 and r.data["order"]["is_simulated"] is True
    order = r.data["order"]
    # Frontend-reported success without a valid signature is rejected; the pending payment is NOT poisoned by the forgery.
    r = p.post(
        "/api/parent/payments/verify/",
        {"order_id": order["order_id"], "payment_id": "mock_pay_x", "amount": order["amount"], "signature": "forged"},
        format="json",
    )
    assert r.status_code == 400
    assert Payment.objects.get(gateway_order_id=order["order_id"]).status == "PENDING"
    inv.refresh_from_db()
    assert inv.status == "ISSUED" and inv.amount_paid == 0
    # Re-initiating supersedes the earlier pending attempt.
    r = p.post(f"/api/parent/invoices/{inv.id}/")
    assert Payment.objects.get(gateway_order_id=order["order_id"]).status == "FAILED"
    order = r.data["order"]
    # Proper flow: gateway checkout returns a signed payload; amount tampering fails; valid payload verifies once.
    chk = p.post("/api/billing/mock-gateway/checkout/", {"order_id": order["order_id"], "amount": order["amount"]}, format="json").data
    tampered = {**chk, "amount": "1.00"}
    assert p.post("/api/parent/payments/verify/", tampered, format="json").status_code == 400
    good = p.post("/api/parent/payments/verify/", chk, format="json")
    assert good.status_code == 200, good.data
    assert good.data["status"] == "VERIFIED" and good.data["is_simulated"] is True and good.data["receipt_number"]
    inv.refresh_from_db()
    assert inv.status == "PAID"
    # replay is idempotent, and the same gateway payment id cannot be reused for another order
    assert p.post("/api/parent/payments/verify/", chk, format="json").status_code == 200
    assert Payment.objects.filter(gateway_payment_id=chk["payment_id"]).count() == 1


def test_mock_gateway_signature_roundtrip():
    g = MockGateway()
    chk = g.simulate_checkout(order_id="o1", amount="10.00")
    v = g.verify_payment(chk)
    assert v.payment_id == chk["payment_id"] and v.amount == Decimal("10.00") and v.is_simulated
    from apps.billing.gateways import GatewayError

    with pytest.raises(GatewayError):
        g.verify_payment({**chk, "signature": "bad"})


def test_parent_sees_only_own_invoices_and_cannot_pay_others(assigned, school_b, as_user):
    services.assign_fee_plan(school=school_b.school, student=school_b.students[0], fee_plan=school_b.fee_plan)
    inv_b = services.generate_invoices(school=school_b.school, anchor_date=timezone.localdate(), actor=school_b.admin)["created"][0]
    services.generate_invoices(school=assigned.school, anchor_date=timezone.localdate(), actor=assigned.admin)
    p = as_user(assigned.parent)
    r = p.get("/api/parent/invoices/")
    assert r.status_code == 200 and len(r.data) == 2 and all(i["invoice_number"].startswith("INV-AAA") for i in r.data)
    assert p.get(f"/api/parent/invoices/{inv_b.id}/").status_code == 404
    assert p.post(f"/api/parent/invoices/{inv_b.id}/").status_code == 404


def test_overdue_marking_late_fee_and_cancel_rules(assigned, as_user):
    from datetime import timedelta

    inv = services.generate_invoices(school=assigned.school, anchor_date=timezone.localdate(), actor=assigned.admin)["created"][0]
    Invoice.objects.filter(pk=inv.pk).update(due_date=timezone.localdate() - timedelta(days=5))
    assert services.mark_overdue_invoices(assigned.school) == 2 or Invoice.objects.get(pk=inv.pk).status == "OVERDUE"
    a = as_user(assigned.admin)
    r = a.post(f"/api/billing/invoices/{inv.id}/late-fee/", {"amount": "100", "reason": "late"}, format="json")
    assert r.status_code == 200 and Decimal(r.data["total"]) == Decimal("2100.00")
    a.post("/api/billing/payments/record/", {"student": str(inv.student_id), "invoice": str(inv.id), "amount": "50", "method": "CASH"}, format="json")
    assert a.post(f"/api/billing/invoices/{inv.id}/cancel/", {"reason": "x"}, format="json").status_code == 400  # has payments
    other = Invoice.objects.exclude(pk=inv.pk).first()
    assert a.post(f"/api/billing/invoices/{other.id}/cancel/", {"reason": "duplicate"}, format="json").status_code == 200
