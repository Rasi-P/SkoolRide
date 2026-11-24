"""Payment gateway integration interface.

`PAYMENT_GATEWAY=mock` (default) uses MockGateway: a fully local sandbox that signs its own payloads with
HMAC so the verification path is exercised end-to-end, but **no money ever moves** and every resulting
payment is flagged `is_simulated=True`.

To integrate a real provider (Razorpay, Stripe, PayU, ...):
1. Implement `BaseGateway` (create_order / verify_payment / verify_webhook) in this module.
2. Register it in `GATEWAYS` and set PAYMENT_GATEWAY plus the key env vars.
3. Verify signatures server-side with the provider SDK; never trust the client payload alone.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
from dataclasses import dataclass
from decimal import Decimal

from django.conf import settings


class GatewayError(Exception):
    pass


@dataclass
class VerifiedPayment:
    order_id: str
    payment_id: str
    amount: Decimal
    currency: str
    is_simulated: bool
    status: str = "success"


class BaseGateway:
    name = "base"
    is_simulated = False

    def create_order(self, *, amount: Decimal, currency: str, reference: str, customer: dict) -> dict:
        raise NotImplementedError

    def verify_payment(self, payload: dict) -> VerifiedPayment:
        raise NotImplementedError

    def verify_webhook(self, raw_body: bytes, headers: dict) -> list[VerifiedPayment]:
        raise NotImplementedError


class MockGateway(BaseGateway):
    name = "mock"
    is_simulated = True

    @property
    def secret(self) -> str:
        return settings.PAYMENT_GATEWAY_KEY_SECRET or (settings.SECRET_KEY + ":mock-gateway")

    def _sign(self, order_id: str, payment_id: str, amount: str, currency: str, status: str) -> str:
        return hmac.new(self.secret.encode(), f"{order_id}|{payment_id}|{amount}|{currency}|{status}".encode(), hashlib.sha256).hexdigest()

    def create_order(self, *, amount, currency, reference, customer):
        order_id = f"mock_order_{secrets.token_hex(8)}"
        return {
            "gateway": self.name,
            "order_id": order_id,
            "amount": str(amount),
            "currency": currency,
            "is_simulated": True,
            "checkout": {
                "type": "mock",
                "message": "SIMULATED PAYMENT - no real money will be collected.",
                "checkout_url": f"/api/billing/mock-gateway/checkout/?order_id={order_id}&amount={amount}",
            },
        }

    def simulate_checkout(self, *, order_id: str, amount: str, currency: str = "INR", outcome: str = "success") -> dict:
        """Acts as the gateway's hosted checkout: returns a signed result the client must send back for verification."""
        payment_id = f"mock_pay_{secrets.token_hex(8)}"
        status = "success" if outcome == "success" else "failed"
        return {
            "order_id": order_id,
            "payment_id": payment_id,
            "amount": amount,
            "currency": currency,
            "status": status,
            "signature": self._sign(order_id, payment_id, amount, currency, status),
        }

    def verify_payment(self, payload: dict) -> VerifiedPayment:
        try:
            order_id, payment_id, amount, signature = (payload["order_id"], payload["payment_id"], str(payload["amount"]), payload["signature"])
        except KeyError as exc:
            raise GatewayError(f"Missing field {exc}") from exc
        currency, status = payload.get("currency", "INR"), payload.get("status", "success")
        if not hmac.compare_digest(self._sign(order_id, payment_id, amount, currency, status), signature or ""):
            raise GatewayError("Invalid payment signature")
        return VerifiedPayment(order_id=order_id, payment_id=payment_id, amount=Decimal(amount), currency=currency, is_simulated=True, status=status)

    def verify_webhook(self, raw_body, headers):
        import json

        sig = headers.get("X-Mock-Signature", "")
        expected = hmac.new(self.secret.encode(), raw_body, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            raise GatewayError("Invalid webhook signature")
        data = json.loads(raw_body)
        return [self.verify_payment(evt) for evt in data.get("events", [])]


GATEWAYS = {"mock": MockGateway}


def get_gateway() -> BaseGateway:
    name = settings.PAYMENT_GATEWAY
    cls = GATEWAYS.get(name)
    if cls is None:
        raise GatewayError(f"Payment gateway '{name}' is not configured. See apps/billing/gateways.py")
    return cls()
