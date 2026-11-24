from __future__ import annotations

from decimal import Decimal

from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.core.models import TenantModel

ZERO = Decimal("0.00")


class NumberSequence(models.Model):
    """Per-school monotonically increasing counters for invoice/payment/receipt numbers."""

    school = models.ForeignKey("schools.School", on_delete=models.CASCADE, related_name="number_sequences")
    key = models.CharField(max_length=32)
    value = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["school", "key"], name="uniq_sequence_key")]

    def __str__(self) -> str:
        return f"{self.school_id}:{self.key}={self.value}"


class FeePlan(TenantModel):
    class Basis(models.TextChoices):
        ROUTE = "ROUTE", "Per route"
        DISTANCE = "DISTANCE", "Distance band"
        GRADE = "GRADE", "Per grade"
        CUSTOM = "CUSTOM", "Custom plan"

    class Cycle(models.TextChoices):
        MONTHLY = "MONTHLY", "Monthly"
        TERM = "TERM", "Per term"
        ANNUAL = "ANNUAL", "Annual"

    name = models.CharField(max_length=120)
    code = models.CharField(max_length=24)
    basis = models.CharField(max_length=10, choices=Basis.choices, default=Basis.CUSTOM)
    billing_cycle = models.CharField(max_length=8, choices=Cycle.choices, default=Cycle.MONTHLY)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    currency = models.CharField(max_length=3, default="INR")
    route = models.ForeignKey("routing.Route", null=True, blank=True, on_delete=models.SET_NULL, related_name="fee_plans")
    distance_min_km = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    distance_max_km = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    grades = models.JSONField(default=list, blank=True)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]
        constraints = [models.UniqueConstraint(fields=["school", "code"], name="uniq_fee_plan_code")]

    def __str__(self) -> str:
        return f"{self.name} ({self.amount} {self.currency}/{self.billing_cycle.lower()})"


class StudentFeeAssignment(TenantModel):
    student = models.ForeignKey("people.Student", on_delete=models.CASCADE, related_name="fee_assignments")
    fee_plan = models.ForeignKey(FeePlan, on_delete=models.PROTECT, related_name="assignments")
    start_date = models.DateField(default=timezone.localdate)
    end_date = models.DateField(null=True, blank=True)
    discount_amount = models.DecimalField(max_digits=10, decimal_places=2, default=ZERO)
    discount_reason = models.CharField(max_length=160, blank=True)
    is_active = models.BooleanField(default=True)
    notes = models.CharField(max_length=255, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["student"], condition=models.Q(is_active=True), name="uniq_active_fee_assignment")]
        indexes = [models.Index(fields=["school", "is_active"])]


class Invoice(TenantModel):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        ISSUED = "ISSUED", "Issued"
        PARTIALLY_PAID = "PARTIALLY_PAID", "Partially paid"
        PAID = "PAID", "Paid"
        OVERDUE = "OVERDUE", "Overdue"
        CANCELLED = "CANCELLED", "Cancelled"

    OPEN_STATUSES = ("ISSUED", "PARTIALLY_PAID", "OVERDUE")

    invoice_number = models.CharField(max_length=32)
    student = models.ForeignKey("people.Student", on_delete=models.PROTECT, related_name="invoices")
    billed_to = models.ForeignKey("people.ParentProfile", null=True, blank=True, on_delete=models.SET_NULL, related_name="invoices")
    fee_plan = models.ForeignKey(FeePlan, null=True, blank=True, on_delete=models.SET_NULL, related_name="invoices")
    period_label = models.CharField(max_length=60)
    period_start = models.DateField()
    period_end = models.DateField()
    issue_date = models.DateField(default=timezone.localdate)
    due_date = models.DateField(db_index=True)
    currency = models.CharField(max_length=3, default="INR")
    subtotal = models.DecimalField(max_digits=10, decimal_places=2, default=ZERO)
    discount = models.DecimalField(max_digits=10, decimal_places=2, default=ZERO)
    late_fee = models.DecimalField(max_digits=10, decimal_places=2, default=ZERO)
    total = models.DecimalField(max_digits=10, decimal_places=2, default=ZERO)
    amount_paid = models.DecimalField(max_digits=10, decimal_places=2, default=ZERO)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ISSUED, db_index=True)
    notes = models.TextField(blank=True)
    reminder_sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-issue_date", "-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["school", "invoice_number"], name="uniq_invoice_number"),
            models.UniqueConstraint(
                fields=["student", "period_start", "period_end", "fee_plan"], condition=~models.Q(status="CANCELLED"), name="uniq_invoice_period"
            ),
        ]
        indexes = [models.Index(fields=["school", "status", "due_date"]), models.Index(fields=["school", "student"])]

    def __str__(self) -> str:
        return self.invoice_number

    @property
    def balance(self) -> Decimal:
        return (self.total - self.amount_paid).quantize(Decimal("0.01"))

    @property
    def is_overdue(self) -> bool:
        return self.status in self.OPEN_STATUSES and self.due_date < timezone.localdate() and self.balance > 0

    def recompute(self) -> None:
        self.subtotal = sum((li.amount for li in self.line_items.all()), ZERO)
        self.total = max(ZERO, self.subtotal - self.discount + self.late_fee)
        paid = sum((a.amount for a in self.allocations.filter(payment__status="VERIFIED")), ZERO)
        self.amount_paid = paid
        if self.status != self.Status.CANCELLED:
            if paid >= self.total and self.total > 0:
                self.status = self.Status.PAID
            elif paid > 0:
                self.status = self.Status.PARTIALLY_PAID
            elif self.due_date < timezone.localdate():
                self.status = self.Status.OVERDUE
            else:
                self.status = self.Status.ISSUED
            if self.status == self.Status.PARTIALLY_PAID and self.due_date < timezone.localdate():
                self.status = self.Status.OVERDUE


class InvoiceLineItem(TenantModel):
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name="line_items")
    description = models.CharField(max_length=200)
    quantity = models.DecimalField(max_digits=6, decimal_places=2, default=Decimal("1.00"))
    unit_amount = models.DecimalField(max_digits=10, decimal_places=2)
    amount = models.DecimalField(max_digits=10, decimal_places=2)

    def save(self, *args, **kwargs):
        self.amount = (self.quantity * self.unit_amount).quantize(Decimal("0.01"))
        super().save(*args, **kwargs)


class Payment(TenantModel):
    class Method(models.TextChoices):
        CASH = "CASH", "Cash"
        BANK_TRANSFER = "BANK_TRANSFER", "Bank transfer"
        UPI = "UPI", "UPI"
        CHEQUE = "CHEQUE", "Cheque"
        ONLINE = "ONLINE", "Online (gateway)"

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending verification"
        VERIFIED = "VERIFIED", "Verified"
        FAILED = "FAILED", "Failed"
        REVERSED = "REVERSED", "Reversed"

    payment_number = models.CharField(max_length=32)
    student = models.ForeignKey("people.Student", on_delete=models.PROTECT, related_name="payments")
    paid_by = models.ForeignKey("people.ParentProfile", null=True, blank=True, on_delete=models.SET_NULL, related_name="payments")
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    currency = models.CharField(max_length=3, default="INR")
    method = models.CharField(max_length=14, choices=Method.choices)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING, db_index=True)
    transaction_reference = models.CharField(max_length=120, blank=True)
    gateway = models.CharField(max_length=32, blank=True)
    gateway_order_id = models.CharField(max_length=120, blank=True)
    gateway_payment_id = models.CharField(max_length=120, blank=True)
    is_simulated = models.BooleanField(default=False, help_text="Mock/sandbox gateway; no money moved")
    paid_at = models.DateTimeField(default=timezone.now)
    verified_at = models.DateTimeField(null=True, blank=True)
    received_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="received_payments")
    reversed_at = models.DateTimeField(null=True, blank=True)
    reversal_reason = models.CharField(max_length=255, blank=True)
    notes = models.TextField(blank=True)
    idempotency_key = models.CharField(max_length=80, blank=True)

    class Meta:
        ordering = ["-paid_at"]
        constraints = [
            models.UniqueConstraint(fields=["school", "payment_number"], name="uniq_payment_number"),
            models.UniqueConstraint(
                fields=["school", "transaction_reference"], condition=~models.Q(transaction_reference=""), name="uniq_payment_reference"
            ),
            models.UniqueConstraint(fields=["school", "idempotency_key"], condition=~models.Q(idempotency_key=""), name="uniq_payment_idempotency"),
            models.UniqueConstraint(
                fields=["gateway", "gateway_payment_id"], condition=~models.Q(gateway_payment_id=""), name="uniq_gateway_payment"
            ),
        ]
        indexes = [models.Index(fields=["school", "status", "-paid_at"]), models.Index(fields=["school", "student"])]

    def __str__(self) -> str:
        return self.payment_number


class PaymentAllocation(TenantModel):
    payment = models.ForeignKey(Payment, on_delete=models.CASCADE, related_name="allocations")
    invoice = models.ForeignKey(Invoice, on_delete=models.PROTECT, related_name="allocations")
    amount = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["payment", "invoice"], name="uniq_allocation")]


class Receipt(TenantModel):
    receipt_number = models.CharField(max_length=32)
    payment = models.OneToOneField(Payment, on_delete=models.PROTECT, related_name="receipt")
    issued_at = models.DateTimeField(default=timezone.now)
    issued_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    is_void = models.BooleanField(default=False)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["school", "receipt_number"], name="uniq_receipt_number")]


class PaymentAdjustment(TenantModel):
    """Immutable history of reversals / corrections. Never updated or deleted."""

    class Kind(models.TextChoices):
        REVERSAL = "REVERSAL", "Reversal"
        CORRECTION = "CORRECTION", "Correction"
        REFUND = "REFUND", "Refund"
        LATE_FEE = "LATE_FEE", "Late fee applied"
        WAIVER = "WAIVER", "Waiver"

    payment = models.ForeignKey(Payment, null=True, blank=True, on_delete=models.PROTECT, related_name="adjustments")
    invoice = models.ForeignKey(Invoice, null=True, blank=True, on_delete=models.PROTECT, related_name="adjustments")
    kind = models.CharField(max_length=12, choices=Kind.choices)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    reason = models.CharField(max_length=255)
    before = models.JSONField(default=dict, blank=True)
    after = models.JSONField(default=dict, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        ordering = ["-created_at"]
