from __future__ import annotations

from django.db.models import Count, Q
from django.shortcuts import render
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from drf_spectacular.utils import extend_schema as _extend_schema
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.audit import record_audit
from apps.core.permissions import HasSchoolPerm
from apps.core.roles import Perm
from apps.core.tenancy import resolve_tenant
from apps.core.utils import csv_response
from apps.core.views import TenantModelViewSet, TenantReadOnlyViewSet

from . import services
from .gateways import MockGateway
from .models import FeePlan, Invoice, Payment, PaymentAdjustment, Receipt, StudentFeeAssignment
from .serializers import (
    FeePlanSerializer,
    GenerateInvoicesSerializer,
    InvoiceCreateSerializer,
    InvoiceListSerializer,
    InvoiceSerializer,
    LateFeeSerializer,
    PaymentAdjustmentSerializer,
    PaymentSerializer,
    ReasonSerializer,
    ReceiptSerializer,
    RecordPaymentSerializer,
    StudentFeeAssignmentSerializer,
)


class FeePlanViewSet(TenantModelViewSet):
    required_perms = {"GET": Perm.BILLING_VIEW, "POST": Perm.BILLING_MANAGE}
    serializer_class = FeePlanSerializer
    queryset = FeePlan.objects.select_related("route")
    filterset_fields = ["basis", "billing_cycle", "is_active", "route"]
    search_fields = ["name", "code"]

    def get_queryset(self):
        return super().get_queryset().annotate(assigned_count=Count("assignments", filter=Q(assignments__is_active=True))).order_by("name")

    def perform_create(self, serializer):
        obj = serializer.save(school=self.school)
        record_audit(action="billing.fee_plan_created", request=self.request, target=obj)

    def perform_update(self, serializer):
        obj = serializer.save()
        record_audit(
            action="billing.fee_plan_updated", request=self.request, target=obj, changes={k: str(v) for k, v in serializer.validated_data.items()}
        )

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save(update_fields=["is_active"])


class StudentFeeAssignmentViewSet(TenantModelViewSet):
    required_perms = {"GET": Perm.BILLING_VIEW, "POST": Perm.BILLING_MANAGE}
    serializer_class = StudentFeeAssignmentSerializer
    queryset = StudentFeeAssignment.objects.select_related("student", "fee_plan")
    filterset_fields = ["student", "fee_plan", "is_active"]
    search_fields = ["student__first_name", "student__last_name", "student__admission_number"]
    http_method_names = ["get", "post", "head", "options"]

    def create(self, request, *args, **kwargs):
        ser = self.get_serializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        fa = services.assign_fee_plan(
            school=self.school,
            student=d["student"],
            fee_plan=d["fee_plan"],
            start_date=d.get("start_date"),
            discount_amount=d.get("discount_amount", 0),
            discount_reason=d.get("discount_reason", ""),
            notes=d.get("notes", ""),
            request=request,
        )
        return Response(self.get_serializer(fa).data, status=201)


class InvoiceViewSet(TenantModelViewSet):
    required_perms = {"GET": Perm.BILLING_VIEW, "POST": Perm.BILLING_MANAGE}
    queryset = Invoice.objects.select_related("student", "billed_to", "fee_plan").prefetch_related("line_items", "allocations__payment__receipt")
    filterset_fields = ["status", "student", "fee_plan", "student__grade", "period_start"]
    search_fields = ["invoice_number", "student__first_name", "student__last_name", "student__admission_number"]
    ordering_fields = ["issue_date", "due_date", "total", "status"]
    http_method_names = ["get", "post", "head", "options"]

    def get_serializer_class(self):
        if self.action == "create":
            return InvoiceCreateSerializer
        return InvoiceListSerializer if self.action == "list" else InvoiceSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.query_params.get("overdue") == "true":
            qs = qs.filter(status="OVERDUE")
        df, dt = self.request.query_params.get("date_from"), self.request.query_params.get("date_to")
        if df:
            qs = qs.filter(issue_date__gte=df)
        if dt:
            qs = qs.filter(issue_date__lte=dt)
        return qs

    def create(self, request, *args, **kwargs):
        ser = InvoiceCreateSerializer(data=request.data, context=self.get_serializer_context())
        ser.is_valid(raise_exception=True)
        inv = services.create_invoice(school=self.school, actor=request.user, request=request, **ser.validated_data)
        return Response(InvoiceSerializer(inv).data, status=201)

    @extend_schema(request=GenerateInvoicesSerializer)
    @action(detail=False, methods=["post"])
    def generate(self, request):
        ser = GenerateInvoicesSerializer(data=request.data, context=self.get_serializer_context())
        ser.is_valid(raise_exception=True)
        result = services.generate_invoices(school=self.school, actor=request.user, request=request, **ser.validated_data)
        return Response(
            {"created": len(result["created"]), "skipped": result["skipped"], "invoices": InvoiceListSerializer(result["created"], many=True).data},
            status=201,
        )

    @extend_schema(request=ReasonSerializer)
    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        ser = ReasonSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        inv = services.cancel_invoice(invoice=self.get_object(), reason=ser.validated_data["reason"], actor=request.user, request=request)
        return Response(InvoiceSerializer(inv).data)

    @extend_schema(request=LateFeeSerializer)
    @action(detail=True, methods=["post"], url_path="late-fee")
    def late_fee(self, request, pk=None):
        ser = LateFeeSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        inv = services.apply_late_fee(invoice=self.get_object(), actor=request.user, request=request, **ser.validated_data)
        return Response(InvoiceSerializer(inv).data)

    @action(detail=True, methods=["get"], url_path="print")
    def print_view(self, request, pk=None):
        inv = self.get_object()
        return render(request, "billing/invoice.html", {"invoice": inv, "school": inv.school})

    @action(detail=False, methods=["get"])
    def export(self, request):
        qs = self.filter_queryset(self.get_queryset())[:10000]
        return csv_response(
            "invoices.csv",
            ["invoice_number", "student", "admission_number", "class", "period", "issue_date", "due_date", "total", "paid", "balance", "status"],
            (
                (
                    i.invoice_number,
                    i.student.full_name,
                    i.student.admission_number,
                    i.student.class_label,
                    i.period_label,
                    i.issue_date,
                    i.due_date,
                    i.total,
                    i.amount_paid,
                    i.balance,
                    i.status,
                )
                for i in qs
            ),
        )


class PaymentViewSet(TenantReadOnlyViewSet):
    required_perms = {"GET": Perm.BILLING_VIEW, "POST": Perm.BILLING_RECORD_PAYMENT}
    serializer_class = PaymentSerializer
    queryset = Payment.objects.select_related("student", "paid_by", "received_by", "receipt").prefetch_related("allocations__invoice")
    filterset_fields = ["status", "method", "student", "is_simulated"]
    search_fields = ["payment_number", "transaction_reference", "student__first_name", "student__last_name", "gateway_payment_id"]
    ordering_fields = ["paid_at", "amount"]

    def get_queryset(self):
        qs = super().get_queryset()
        df, dt = self.request.query_params.get("date_from"), self.request.query_params.get("date_to")
        if df:
            qs = qs.filter(paid_at__date__gte=df)
        if dt:
            qs = qs.filter(paid_at__date__lte=dt)
        return qs

    @extend_schema(request=RecordPaymentSerializer, responses=PaymentSerializer)
    @action(detail=False, methods=["post"])
    def record(self, request):
        if not resolve_tenant(request).has_perm(Perm.BILLING_RECORD_PAYMENT):
            return Response({"detail": "Permission denied.", "code": "permission_denied"}, status=403)
        ser = RecordPaymentSerializer(data=request.data, context=self.get_serializer_context())
        ser.is_valid(raise_exception=True)
        key = ser.validated_data.get("idempotency_key") or request.headers.get("Idempotency-Key", "")
        payment = services.record_offline_payment(
            school=self.school,
            received_by=request.user,
            request=request,
            **{**ser.validated_data, "idempotency_key": key},
        )
        return Response(PaymentSerializer(payment).data, status=status.HTTP_201_CREATED)

    @extend_schema(request=ReasonSerializer)
    @action(detail=True, methods=["post"])
    def reverse(self, request, pk=None):
        if not resolve_tenant(request).has_perm(Perm.BILLING_MANAGE):
            return Response({"detail": "Permission denied.", "code": "permission_denied"}, status=403)
        ser = ReasonSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        payment = services.reverse_payment(payment=self.get_object(), reason=ser.validated_data["reason"], actor=request.user, request=request)
        return Response(PaymentSerializer(payment).data)

    @action(detail=False, methods=["get"])
    def export(self, request):
        qs = self.filter_queryset(self.get_queryset())[:10000]
        return csv_response(
            "payments.csv",
            ["payment_number", "student", "amount", "method", "status", "reference", "paid_at", "receipt", "simulated"],
            (
                (
                    p.payment_number,
                    p.student.full_name,
                    p.amount,
                    p.method,
                    p.status,
                    p.transaction_reference,
                    p.paid_at,
                    getattr(getattr(p, "receipt", None), "receipt_number", ""),
                    p.is_simulated,
                )
                for p in qs
            ),
        )


class ReceiptViewSet(TenantReadOnlyViewSet):
    required_perms = Perm.BILLING_VIEW
    serializer_class = ReceiptSerializer
    queryset = Receipt.objects.select_related("payment__student", "payment__receipt", "school", "issued_by")
    filterset_fields = ["payment__student", "is_void"]
    search_fields = ["receipt_number", "payment__payment_number"]

    @action(detail=True, methods=["get"], url_path="print")
    def print_view(self, request, pk=None):
        receipt = self.get_object()
        return render(request, "billing/receipt.html", {"receipt": receipt, "payment": receipt.payment, "school": receipt.school})


class PaymentAdjustmentViewSet(TenantReadOnlyViewSet):
    required_perms = Perm.BILLING_VIEW
    serializer_class = PaymentAdjustmentSerializer
    queryset = PaymentAdjustment.objects.select_related("payment", "invoice", "created_by")
    filterset_fields = ["kind", "payment", "invoice"]


@_extend_schema(responses={200: OpenApiTypes.OBJECT})
class FinancialSummaryView(APIView):
    permission_classes = [HasSchoolPerm]
    required_perms = Perm.BILLING_VIEW

    def get(self, request):
        school = resolve_tenant(request).school
        return Response(services.financial_summary(school, request.query_params.get("date_from"), request.query_params.get("date_to")))


@_extend_schema(request=OpenApiTypes.OBJECT, responses={200: OpenApiTypes.OBJECT})
class MockGatewayCheckoutView(APIView):
    """Simulates a hosted gateway checkout page for local demos. Clearly labelled; never collects money."""

    permission_classes = [HasSchoolPerm]
    required_perms = Perm.PARENT_SELF

    def post(self, request):
        from django.conf import settings

        if settings.PAYMENT_GATEWAY != "mock":
            return Response({"detail": "Mock gateway is disabled.", "code": "disabled"}, status=404)
        order_id = request.data.get("order_id")
        amount = str(request.data.get("amount"))
        outcome = request.data.get("outcome", "success")
        ctx = resolve_tenant(request)
        parent = getattr(ctx.membership, "parent_profile", None)
        if parent is None or parent.status == "SUSPENDED":
            return Response({"detail": "Parent access required.", "code": "permission_denied"}, status=403)
        payment = Payment.objects.filter(
            school=ctx.school, student__guardian_links__parent=parent,
            gateway="mock", gateway_order_id=order_id, status="PENDING"
        ).first()
        if payment is None or str(payment.amount) != amount:
            return Response({"detail": "Unknown or mismatched order.", "code": "bad_order"}, status=400)
        return Response({"simulated": True, **MockGateway().simulate_checkout(
            order_id=order_id, amount=amount, currency=payment.currency, outcome=outcome
        )})
