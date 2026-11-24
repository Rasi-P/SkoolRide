from decimal import Decimal

import pytest
from django.utils import timezone

from apps.billing import services
from apps.billing.models import Payment
from apps.core.exceptions import ConflictError, DomainError

pytestmark = pytest.mark.django_db


@pytest.fixture
def invoice(school_a):
    services.assign_fee_plan(school=school_a.school, student=school_a.students[0], fee_plan=school_a.fee_plan)
    return services.generate_invoices(school=school_a.school, anchor_date=timezone.localdate())["created"][0]


def test_mock_checkout_cannot_sign_another_schools_order(school_a, school_b, invoice, as_user):
    parent = as_user(school_a.parent)
    order = parent.post(f"/api/parent/invoices/{invoice.pk}/").data["order"]
    body = {"order_id": order["order_id"], "amount": order["amount"]}
    assert as_user(school_b.parent).post("/api/billing/mock-gateway/checkout/", body).status_code == 400
    assert as_user(school_a.driver).post("/api/billing/mock-gateway/checkout/", body).status_code == 403
    assert parent.post("/api/billing/mock-gateway/checkout/", body).status_code == 200


def test_signed_decline_is_persisted_without_receipt(school_a, invoice, as_user):
    parent = as_user(school_a.parent)
    order = parent.post(f"/api/parent/invoices/{invoice.pk}/").data["order"]
    result = parent.post("/api/billing/mock-gateway/checkout/", {
        "order_id": order["order_id"], "amount": order["amount"], "outcome": "failed"
    }).data
    forged = {**result, "status": "success"}
    assert parent.post("/api/parent/payments/verify/", forged).status_code == 400
    response = parent.post("/api/parent/payments/verify/", result)
    assert response.status_code == 200 and response.data["status"] == "FAILED"
    payment = Payment.objects.get(gateway_order_id=order["order_id"])
    assert not hasattr(payment, "receipt")
    invoice.refresh_from_db()
    assert invoice.amount_paid == Decimal("0")


def test_online_settlement_rechecks_balance_after_offline_payment(school_a, invoice, as_user):
    parent = as_user(school_a.parent)
    order = parent.post(f"/api/parent/invoices/{invoice.pk}/").data["order"]
    result = parent.post("/api/billing/mock-gateway/checkout/", {"order_id": order["order_id"], "amount": order["amount"]}).data
    services.record_offline_payment(school=school_a.school, student=invoice.student, invoice=invoice,
                                    amount="500", method="CASH", received_by=school_a.admin)
    response = parent.post("/api/parent/payments/verify/", result)
    assert response.status_code == 400
    invoice.refresh_from_db()
    assert invoice.amount_paid == Decimal("500")
    assert not Payment.objects.filter(method="ONLINE", status="VERIFIED").exists()


def test_cancelled_invoice_rejects_payments(school_a, invoice):
    services.cancel_invoice(invoice=invoice, reason="Duplicate", actor=school_a.admin)
    with pytest.raises(DomainError):
        services.record_offline_payment(school=school_a.school, student=invoice.student, invoice=invoice,
                                        amount="500", method="CASH", received_by=school_a.admin)


def test_idempotency_key_cannot_be_reused_for_a_different_payment(school_a, invoice):
    params = dict(school=school_a.school, student=invoice.student, invoice=invoice, method="CASH",
                  received_by=school_a.admin, idempotency_key="same-request")
    first = services.record_offline_payment(**params, amount="500")
    assert services.record_offline_payment(**params, amount="500").pk == first.pk
    with pytest.raises(ConflictError):
        services.record_offline_payment(**params, amount="1000")
