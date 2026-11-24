from __future__ import annotations

from decimal import Decimal

from rest_framework import serializers

from apps.core.serializers import TenantPrimaryKeyRelatedField
from apps.people.models import Student
from apps.routing.models import Route

from .models import FeePlan, Invoice, InvoiceLineItem, Payment, PaymentAdjustment, PaymentAllocation, Receipt, StudentFeeAssignment


class FeePlanSerializer(serializers.ModelSerializer):
    route = TenantPrimaryKeyRelatedField(queryset=Route.objects.all(), required=False, allow_null=True)
    route_name = serializers.CharField(source="route.name", read_only=True, default=None)
    assigned_students = serializers.SerializerMethodField()

    class Meta:
        model = FeePlan
        fields = (
            "id",
            "name",
            "code",
            "basis",
            "billing_cycle",
            "amount",
            "currency",
            "route",
            "route_name",
            "distance_min_km",
            "distance_max_km",
            "grades",
            "description",
            "is_active",
            "assigned_students",
            "created_at",
        )

    def get_assigned_students(self, obj):
        return getattr(obj, "assigned_count", None)

    def validate_code(self, value):
        qs = FeePlan.objects.filter(school=self.context["school"], code=value.upper())
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Fee plan code already exists.")
        return value.upper()


class StudentFeeAssignmentSerializer(serializers.ModelSerializer):
    student = TenantPrimaryKeyRelatedField(queryset=Student.objects.all())
    fee_plan = TenantPrimaryKeyRelatedField(queryset=FeePlan.objects.filter(is_active=True))
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    student_class = serializers.CharField(source="student.class_label", read_only=True)
    admission_number = serializers.CharField(source="student.admission_number", read_only=True)
    fee_plan_name = serializers.CharField(source="fee_plan.name", read_only=True)
    fee_plan_amount = serializers.DecimalField(source="fee_plan.amount", max_digits=10, decimal_places=2, read_only=True)
    billing_cycle = serializers.CharField(source="fee_plan.billing_cycle", read_only=True)

    class Meta:
        model = StudentFeeAssignment
        fields = (
            "id",
            "student",
            "student_name",
            "student_class",
            "admission_number",
            "fee_plan",
            "fee_plan_name",
            "fee_plan_amount",
            "billing_cycle",
            "start_date",
            "end_date",
            "discount_amount",
            "discount_reason",
            "is_active",
            "notes",
            "created_at",
        )
        read_only_fields = ("end_date", "is_active")
        validators = []  # the service ends the previous active plan assignment


class InvoiceLineItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = InvoiceLineItem
        fields = ("id", "description", "quantity", "unit_amount", "amount")


class PaymentAllocationSerializer(serializers.ModelSerializer):
    invoice_number = serializers.CharField(source="invoice.invoice_number", read_only=True)
    invoice_id = serializers.UUIDField(source="invoice.id", read_only=True)
    period_label = serializers.CharField(source="invoice.period_label", read_only=True)

    class Meta:
        model = PaymentAllocation
        fields = ("invoice_id", "invoice_number", "period_label", "amount")


class PaymentSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    admission_number = serializers.CharField(source="student.admission_number", read_only=True)
    paid_by_name = serializers.CharField(source="paid_by.full_name", read_only=True, default=None)
    received_by_name = serializers.CharField(source="received_by.full_name", read_only=True, default=None)
    receipt_number = serializers.CharField(source="receipt.receipt_number", read_only=True, default=None)
    receipt_id = serializers.UUIDField(source="receipt.id", read_only=True, default=None)
    allocations = PaymentAllocationSerializer(many=True, read_only=True)

    class Meta:
        model = Payment
        fields = (
            "id",
            "payment_number",
            "student",
            "student_name",
            "admission_number",
            "paid_by_name",
            "amount",
            "currency",
            "method",
            "status",
            "transaction_reference",
            "gateway",
            "gateway_order_id",
            "gateway_payment_id",
            "is_simulated",
            "paid_at",
            "verified_at",
            "received_by_name",
            "reversed_at",
            "reversal_reason",
            "notes",
            "receipt_number",
            "receipt_id",
            "allocations",
            "created_at",
        )


class InvoiceSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    admission_number = serializers.CharField(source="student.admission_number", read_only=True)
    student_class = serializers.CharField(source="student.class_label", read_only=True)
    billed_to_name = serializers.CharField(source="billed_to.full_name", read_only=True, default=None)
    fee_plan_name = serializers.CharField(source="fee_plan.name", read_only=True, default=None)
    balance = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    is_overdue = serializers.BooleanField(read_only=True)
    line_items = InvoiceLineItemSerializer(many=True, read_only=True)
    payments = serializers.SerializerMethodField()

    class Meta:
        model = Invoice
        fields = (
            "id",
            "invoice_number",
            "student",
            "student_name",
            "admission_number",
            "student_class",
            "billed_to_name",
            "fee_plan",
            "fee_plan_name",
            "period_label",
            "period_start",
            "period_end",
            "issue_date",
            "due_date",
            "currency",
            "subtotal",
            "discount",
            "late_fee",
            "total",
            "amount_paid",
            "balance",
            "status",
            "is_overdue",
            "notes",
            "line_items",
            "payments",
            "created_at",
        )

    def get_payments(self, obj):
        return [
            {
                "payment_id": str(a.payment_id),
                "payment_number": a.payment.payment_number,
                "amount": str(a.amount),
                "method": a.payment.method,
                "status": a.payment.status,
                "paid_at": a.payment.paid_at,
                "is_simulated": a.payment.is_simulated,
                "receipt_number": getattr(getattr(a.payment, "receipt", None), "receipt_number", None),
                "receipt_id": str(a.payment.receipt.id) if hasattr(a.payment, "receipt") else None,
            }
            for a in obj.allocations.all()
        ]


class InvoiceListSerializer(InvoiceSerializer):
    class Meta(InvoiceSerializer.Meta):
        fields = tuple(f for f in InvoiceSerializer.Meta.fields if f not in ("line_items", "payments"))


class InvoiceCreateSerializer(serializers.Serializer):
    student = TenantPrimaryKeyRelatedField(queryset=Student.objects.all())
    fee_plan = TenantPrimaryKeyRelatedField(queryset=FeePlan.objects.all())
    period_label = serializers.CharField(max_length=60)
    period_start = serializers.DateField()
    period_end = serializers.DateField()
    due_date = serializers.DateField()
    amount = serializers.DecimalField(max_digits=10, decimal_places=2, required=False)
    discount = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, default=0)
    description = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        if attrs["period_end"] < attrs["period_start"]:
            raise serializers.ValidationError({"period_end": "Period end must be after start."})
        return attrs


class GenerateInvoicesSerializer(serializers.Serializer):
    anchor_date = serializers.DateField()
    due_date = serializers.DateField(required=False)
    students = TenantPrimaryKeyRelatedField(queryset=Student.objects.all(), many=True, required=False)


class RecordPaymentSerializer(serializers.Serializer):
    student = TenantPrimaryKeyRelatedField(queryset=Student.objects.all())
    invoice = TenantPrimaryKeyRelatedField(queryset=Invoice.objects.all(), required=False, allow_null=True)
    amount = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal("0.01"))
    method = serializers.ChoiceField(choices=[m for m in Payment.Method.values if m != "ONLINE"])
    transaction_reference = serializers.CharField(max_length=120, required=False, allow_blank=True, default="")
    paid_at = serializers.DateTimeField(required=False)
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    idempotency_key = serializers.CharField(max_length=80, required=False, allow_blank=True, default="")


class ReasonSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=255)


class LateFeeSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal("0.01"))
    reason = serializers.CharField(max_length=255)


class ReceiptSerializer(serializers.ModelSerializer):
    payment = PaymentSerializer(read_only=True)
    school = serializers.SerializerMethodField()
    student = serializers.SerializerMethodField()
    issued_by_name = serializers.CharField(source="issued_by.full_name", read_only=True, default=None)

    class Meta:
        model = Receipt
        fields = ("id", "receipt_number", "issued_at", "issued_by_name", "is_void", "payment", "school", "student")

    def get_school(self, obj):
        s = obj.school
        return {"name": s.name, "address": s.full_address, "phone": s.phone, "email": s.email, "logo": s.logo.url if s.logo else None}

    def get_student(self, obj):
        st = obj.payment.student
        return {"name": st.full_name, "admission_number": st.admission_number, "class_label": st.class_label}


class PaymentAdjustmentSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True, default=None)
    payment_number = serializers.CharField(source="payment.payment_number", read_only=True, default=None)
    invoice_number = serializers.CharField(source="invoice.invoice_number", read_only=True, default=None)

    class Meta:
        model = PaymentAdjustment
        fields = ("id", "kind", "amount", "reason", "before", "after", "payment_number", "invoice_number", "created_by_name", "created_at")


class VerifyPaymentSerializer(serializers.Serializer):
    order_id = serializers.CharField()
    payment_id = serializers.CharField()
    amount = serializers.CharField()
    signature = serializers.CharField(allow_blank=True)
    currency = serializers.CharField(default="INR", max_length=3)
    status = serializers.ChoiceField(choices=["success", "failed"], default="success")
