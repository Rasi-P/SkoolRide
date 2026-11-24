# Switching simulated/mock integrations to real providers

## Payments (`PAYMENT_GATEWAY`)
Default `mock`: `apps/billing/gateways.py::MockGateway` signs its own checkout result with HMAC so the full verify path runs, but **no money moves** and every payment is stored with `is_simulated=True` (shown as "SIMULATED" in every UI and on receipts).

To integrate Razorpay / Stripe / PayU / Paytm:
1. Implement `BaseGateway` in `apps/billing/gateways.py`:
   - `create_order(amount, currency, reference, customer)` -> call the provider API, return `{order_id, amount, currency, checkout: {...provider specific client config}}`, set `is_simulated = False`.
   - `verify_payment(payload)` -> verify the provider signature **server-side** (e.g. Razorpay `order_id|payment_id` HMAC with the key secret) and return `VerifiedPayment`.
   - `verify_webhook(raw_body, headers)` -> verify the webhook signature and return the settled payments.
2. Register it in `GATEWAYS` and set `PAYMENT_GATEWAY=<name>`, `PAYMENT_GATEWAY_KEY_ID`, `PAYMENT_GATEWAY_KEY_SECRET`, `PAYMENT_GATEWAY_WEBHOOK_SECRET`.
3. In the parent app replace the mock checkout modal (`frontend/src/features/parent/...`) with the provider's checkout SDK, then post the result to `POST /api/parent/payments/verify/` exactly as the mock flow does. The backend never marks a payment verified from the client payload alone.
4. Add a webhook URL view that calls `gateway.verify_webhook` and `verify_online_payment` for each settled event (idempotent by `gateway_payment_id`).

Verification must establish the provider's final success/capture status, merchant, currency, amount and order association. A signed failure is still a failure. The local mock signature covers the outcome and currency; settlement also locks and rechecks the current invoice balance to reject stale or excessive settlements. Add provider-specific sandbox tests before enabling real collection.

## Email (`EMAIL_BACKEND`)
Development prints emails to the console. Set `EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend` and `EMAIL_HOST/PORT/USER/PASSWORD/USE_TLS` (SES, SendGrid SMTP, Postmark...).

## Web push
`python manage.py generate_vapid_keys` -> put `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_ADMIN_EMAIL` in `.env`. The frontend reads the public key from `GET /api/public/config/`. Requires HTTPS; iOS requires the app to be installed to the home screen.

## SMS / WhatsApp (`SMS_PROVIDER`, `WHATSAPP_PROVIDER`)
Default `console` logs messages. Implement a class with `send(notification, delivery) -> provider_ref` (see `apps/notifications/providers.py`), raise `ProviderError` for permanent failures, and set the env var to its dotted path, e.g. `SMS_PROVIDER=myproject.sms.MSG91Provider`. Delivery attempts, status and errors are recorded in `NotificationDelivery` with automatic retries (`retry_failed_deliveries`).

## GPS
See `docs/GPS_TRACKING.md` for native-app and GPS-device integration paths.

## Maps
Leaflet + OpenStreetMap tiles by default (`frontend/src/components/map/BusMap.tsx`). Point `TILE_URL` at Mapbox/MapTiler/Google tile endpoints for production traffic (OSM's public tile servers have a usage policy).
