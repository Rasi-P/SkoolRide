"""Generate a VAPID key pair for web push. Paste the output into backend/.env."""

import base64

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Generate VAPID public/private keys for web push notifications"

    def handle(self, *args, **options):
        private_key = ec.generate_private_key(ec.SECP256R1())
        private_bytes = private_key.private_numbers().private_value.to_bytes(32, "big")
        public_bytes = private_key.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
        b64 = lambda b: base64.urlsafe_b64encode(b).rstrip(b"=").decode()  # noqa: E731
        self.stdout.write(f"VAPID_PUBLIC_KEY={b64(public_bytes)}")
        self.stdout.write(f"VAPID_PRIVATE_KEY={b64(private_bytes)}")
