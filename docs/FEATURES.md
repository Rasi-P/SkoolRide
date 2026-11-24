# Implemented features and known limitations

## Implemented
### Platform (Super Admin)
- Overview dashboard (schools, applications, buses, students, active trips, growth chart, recent activity, system stats).
- School applications: review, approve (creates school + subscription + secure admin invitation), reject; CSV export.
- School directory: create school with initial admin invite, edit, suspend/reactivate (suspended schools lose operational API access), subscription plan/status/limits, onboarding progress, members and invitations, invite additional admins.
- Subscription plans CRUD with limits (vehicles/students/staff/routes enforced on create).
- Platform settings (key/value) and notification templates (per category/channel, school overrides).
- Audit logs (every approval, suspension, assignment, payment change, login...) with search/filter/export; platform users list with activate/deactivate.

### School Admin / Transport Manager
- Dashboard: transport KPIs, boarded vs expected, pending/overdue fees, document & maintenance alerts, today's trips, attendance trend, recent complaints/incidents/announcements, onboarding checklist.
- School profile & settings: contact, location, timezone (default Asia/Kolkata), academic year, pickup/drop-off rules, notification channels + thresholds (arrival alert minutes, delay threshold, GPS stale seconds), fee configuration, parent-facing contact, members & invitations.
- Vehicles: registration, type, capacity, documents with expiry alerts, maintenance history, driver/attendant assignment with history, status workflow, audit trail, CSV export, plan limit.
- Staff: drivers/attendants/managers with contact, emergency contact, employee id, licence expiry, documents, leave approval, daily attendance, invitation-based accounts, access activation/deactivation.
- Students: profiles, guardians (multiple, primary/can-pickup flags), transport assignment with history, transfer/withdrawal/reactivation, CSV import with preview/validation/duplicate detection, export.
- Parents: profiles, invitations, suspension/activation, password reset, children links, communication history, fee summary.
- Routes & stops: ordered geocoded stops with planned times, map-based editor (click to add, drag to move), weekday schedules per direction, vehicle/driver/attendant assignment, capacity warnings, versioned history.
- Trips: generation from schedules, ad-hoc creation, start/pause/resume/end/cancel, replacement vehicle on breakdown (boarding state carried over), live map (WebSocket + polling fallback), trip detail with GPS history, stop timeline, per-student boarding, events; export.
- Attendance & safety: boarding/drop-off/absent/no-show events (not presented as proof of location), reports, frequent absentees, incidents with severity/status workflow, emergency alerts, document expiry reminders, stale-GPS alerts.
- Billing: fee plans (route/distance/grade/custom; monthly/term/annual), student fee assignment with discounts, invoice generation per period (idempotent), line items, partial/full offline payments (cash/bank/UPI/cheque) with duplicate-reference and idempotency protection, receipts (printable HTML), late fees, cancellations, reversals with immutable adjustment history, financial summary and reports, exports. Online payments through a gateway interface with a signed **mock** provider; simulated payments are flagged everywhere.
- Engagement: absence requests (auto-mark trips), pickup-change requests with approval workflow (applies the assignment on approval), complaints with threads and internal notes, announcements (audience targeting, pinning, push).
- Notifications: in-app centre, web push (VAPID), email (console in dev), SMS/WhatsApp provider interface, per-user preferences, per-school channel policy, delivery records with retries, idempotent dedupe keys, broadcast to parents/routes/students/staff.
- Reports: attendance, trips (on-time rate, delays), fleet, students, finance; CSV exports.

### Parent PWA
- Home with child selector, today's trips, bus/driver, fee status, announcements, quick actions.
- The home map and tracking page suppress LIVE/ETA claims for stale or offline locations. Boarding labels describe a recorded attendance event, not proof of a child's present physical location.
- Live tracking: bus position, route and own stop, **ETA to the child's stop**, last GPS timestamp, stale/offline states, simulated-feed labelling, WebSocket + polling.
- Ten-minute arrival alert, boarding/drop-off/no-show confirmations, school-arrival, delays/cancellations, fee reminders, announcements.
- Schedule & stops, trip history, attendance history, invoices & payments & receipts, simulated online payment, absence and pickup-change requests, complaints, profile and notification settings, push subscription, install hint.

### Driver / Attendant PWA
- Today's trips, assigned vehicle, driver-only GPS sharing with permission/accuracy/offline/background handling, trip execution (stops, students per stop, board/drop/absent), delay/breakdown/notes, two-step emergency alert, incident reports, trip history, contact school, development-only GPS simulator. Attendants use assigned-trip attendance functions without permission to submit driver GPS. GPS collection stops after server authorization revocation.

### Platform engineering
- Multi-tenant isolation enforced server-side in every list/retrieve/write/export/report/WebSocket/background job; cross-school foreign keys rejected; tests that attempt to break out.
- Central role matrix; backend-enforced permissions; JWT access tokens in memory + rotating refresh token in an httpOnly cookie; rate limiting on auth/registration/GPS endpoints; argon2 password hashing; audit logging; consistent error envelope; timezone-aware UTC storage.
- PWA: manifest, icons, Workbox service worker (API/media/WebSocket never cached), offline fallback page, install prompt, update prompt, push handling.
- Docker Compose (dev + prod), `.env.example`, OpenAPI docs, seed/reset/simulator commands, pytest + vitest + Playwright suites.
- Seeded trip history, GPS points/current positions and payments are explicitly marked simulated; seeding refuses a nonempty database unless an explicit confirmed reset is requested.
- CSRF enforcement on refresh-cookie endpoints; password-change JWT revocation; existing-account invitation ownership checks; explicit membership selection for multiple roles; scoped private file downloads; live-channel reauthorization on messages and heartbeats.
- Financial updates serialize per school in database transactions; cancelled/overpaid invoices and mismatched idempotency keys are rejected; mock signatures include amount, currency and payment outcome, so a signed decline cannot be changed into a success.

## Known limitations (honest list)
- **GPS in a browser PWA stops when the tab is backgrounded** on most mobile platforms; production fleets need the native wrapper or a dedicated GPS device (see docs/GPS_TRACKING.md). Location is never fabricated: if no samples arrive the UI shows a stale state.
- **ETAs use straight-line polylines and recent speed**, not road routing. Their real-world accuracy has not been validated; integrate a road-routing provider and field-test predictions before operational reliance.
- **Payments are simulated** (`PAYMENT_GATEWAY=mock`). No money is collected. A real provider requires implementing `BaseGateway` and a webhook endpoint.
- **Email/SMS/WhatsApp** are console providers in development; web push needs VAPID keys and HTTPS (iOS requires home-screen installation).
- WebSocket auth passes the short-lived access token as a query parameter (browsers cannot set headers on the handshake); keep access tokens short and do not log query strings in production.
- Route "detailed path" (`Route.path`) can be stored but the editor draws straight lines between stops; there is no map-matching.
- Reports are computed on demand (no materialised views); for very large schools add caching or scheduled aggregation.
- The invitation link is exposed in API responses only when `DEMO_MODE=True` (to make demos reproducible); in production it is only emailed.
- OpenAPI validates, but some custom response bodies use generic object schemas and inferred enum names; a fully generated frontend client would need more precise response annotations.
- Not production-verified: load testing, penetration testing, accessibility audit with assistive technology, multi-region deployment, real-device push/GPS and real payment providers. See TEST_RESULTS.md for exactly what ran; this is a demonstrable local implementation, not a production certification.
