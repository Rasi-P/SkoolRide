# SchoolBus Pro

Multi-tenant school transport management platform: live bus tracking, ETA-based parent alerts, attendance, fleet/route/staff management, transport fees with receipts, incidents and announcements. One platform operator (Super Admin) manages many schools; each school has admins, transport managers, drivers, attendants and parents.

- **Backend**: Django 5.2 LTS, Django REST Framework, PostgreSQL, SimpleJWT (rotating refresh tokens in an httpOnly cookie), Django Channels + Redis (WebSockets), Celery + Redis (ETA/notification processing, scheduled jobs), drf-spectacular (OpenAPI).
- **Frontend**: React 19 + TypeScript + Vite 7, Ant Design 5, React Router 7, TanStack Query, react-hook-form + zod, Recharts, Leaflet/OpenStreetMap, installable PWA (manifest, Workbox service worker, offline fallback, web push).
- **Infra**: Docker Compose (dev and production-style), `.env.example` files, nginx for the built PWA.

> Everything in the demo is fictional. Simulated GPS and mock payments are labelled as such everywhere and never represent real vehicles or money.

## Quick start (Docker)
```bash
# From this repository's root, in one terminal:
docker compose up --build            # postgres, redis, backend, worker + beat, frontend
# In a second terminal, once the backend is ready (empty demo database only):
docker compose exec backend python manage.py seed_demo_data
```
Open http://localhost:5173 (API: http://localhost:8001, Swagger: http://localhost:8001/api/docs/).
The checked-in `backend/.env.docker` contains **insecure local development defaults only**. Use `BACKEND_PORT=8002 docker compose up --build` if port 8001 is occupied; the frontend's internal Docker proxy does not need changing. PostgreSQL and Redis bind only to localhost. Do not run the Docker app and local app simultaneously on the same ports.

## Quick start (local, no Docker for the app)
```bash
# databases
docker compose up -d postgres redis

# backend (Python 3.12-3.14)
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp -n .env.example .env                    # preserves an existing local configuration
# .env.example uses CELERY_TASK_ALWAYS_EAGER=True (no worker needed for event-triggered tasks)
python manage.py migrate
python manage.py seed_demo_data
python manage.py runserver 8001            # HTTP + WebSockets (daphne is used automatically by runserver)
# optional, in another shell: python manage.py run_simulator   (advances demo GPS simulations when Celery beat is not running)

# frontend, in another terminal from the repository root (Node 22.12+ recommended)
cd frontend
npm ci                                    # exact versions from package-lock.json
cp -n .env.example .env                    # VITE_DEV_PROXY_TARGET=http://localhost:8001
npm run dev                                # http://localhost:5173
```
With a real Celery setup instead of eager mode, run from `backend/` with the virtual environment active: `celery -A config worker -l info` and `celery -A config beat -l info` (set `CELERY_TASK_ALWAYS_EAGER=False`). Eager mode does not schedule periodic reminders or automatic trip generation; those need beat. Live GPS submissions still calculate ETAs and trigger arrival alerts inline.

## Demo accounts (development only, insecure)
All passwords: `Demo@12345`. The login page also lists them when `DEMO_MODE=True`.

| Role | Email | Notes |
|------|-------|-------|
| Super Admin | superadmin@schoolbuspro.demo | platform console |
| School Admin | admin@greenfield.demo | Greenfield International School (active, fully seeded: 5 buses, 4 routes, 28 students, trips/GPS history, invoices) |
| Transport Manager | transport@greenfield.demo | operations without school settings / billing config |
| Driver | driver1@greenfield.demo … driver5 | Bus 1-4 drivers on routes R1-R4 |
| Attendant | attendant1@greenfield.demo … attendant3 | |
| Parent | parent@greenfield.demo | Priya Sharma, two children (routes R1 and R3). Other parents: see `python manage.py seed_demo_data` output / Parents page |
| School Admin | admin@sunrise.demo | Sunrise Public School: trial subscription, onboarding incomplete |
| School Admin | admin@riverside.demo | Riverside Academy: **SUSPENDED** (operational APIs return 403) |

Pending/under-review/rejected school applications are seeded for the approval demo. Seeding requires `DEMO_MODE=True` and refuses a populated database. To deliberately replace **all** data in a disposable local/demo database, run `python manage.py seed_demo_data --reset --yes`. `python manage.py reset_demo_data` is a separate cleanup command with an interactive confirmation. Neither command has a production bypass flag.

## The 17-step demo
See [docs/DEMO_WORKFLOW.md](docs/DEMO_WORKFLOW.md) for the full scripted walkthrough (approve a school, provision the admin, add fleet/route/student/parent, schedule a trip, start it as the driver, simulate GPS, watch the parent map + ETA, receive the 10-minute alert, board, finish, invoice, pay, verify receipts and reports, attempt cross-school access).

## Architecture
```
backend/
  config/            settings (base/development/production/test), asgi (Channels), celery, urls
  apps/core          tenancy resolution (school and membership selectors constrained to the caller), role matrix, permissions,
                     audit log, geo/ETA helpers, consistent API errors, WebSocket JWT auth
  apps/accounts      custom User (email login), invitations, login/refresh/logout, password reset
  apps/schools       School, SchoolApplication, SchoolMembership, SubscriptionPlan/SchoolSubscription,
                     platform settings, notification templates; platform / public / school APIs
  apps/people        StaffProfile (+documents, leave, attendance), ParentProfile, Student, GuardianStudent, CSV import,
                     parent-facing API (/api/parent/)
  apps/fleet         Vehicle (+documents, maintenance), StaffVehicleAssignment (history)
  apps/routing       Route, RouteStop (ordered, geocoded), RouteSchedule (weekdays), StudentTransportAssignment
  apps/trips         Trip, TripStop, TripStudent, GPSLocation (history) + VehicleLocation (current), BoardingEvent,
                     TripEvent, Incident; ETA engine; lifecycle services; driver API (/api/driver/); WebSocket consumers
  apps/notifications Notification (+dedupe key), NotificationDelivery per channel (retry), PushSubscription, preferences,
                     providers (email / web push / console SMS+WhatsApp)
  apps/billing       FeePlan, StudentFeeAssignment, Invoice(+line items), Payment, PaymentAllocation, Receipt,
                     PaymentAdjustment (immutable), gateway interface + MockGateway, printable invoice/receipt
  apps/engagement    AbsenceRequest, PickupChangeRequest, Complaint(+comments), Announcement
  apps/reports       dashboard + attendance/trips/fleet/students/finance reports
  apps/demo          seed_demo_data / reset_demo_data / run_simulator, GPS simulator (DEMO_MODE only)
  tests/             pytest suite
frontend/src/
  app/               providers, auth context, router, theme tokens, guards
  api/               axios client (in-memory access token, silent refresh), auth API
  components/        design system (PageHeader, StatCard, DataTable, StatusBadge, forms, BusMap, layouts ...)
  features/          public, auth, account, platform, school, parent, driver (each exports its routes)
  pwa/               service worker (Workbox injectManifest), registration, push + install helpers
frontend/e2e/        Playwright tests against the real backend
scripts/            reproducible 17-step API demonstration
.github/workflows/  continuous integration with PostgreSQL, Redis and Chromium
```

### Tenant isolation
Every school-owned model carries `school`. `apps/core/tenancy.py` resolves scope from the authenticated user's **server-side membership**. `X-School-Id` and `X-Membership-Id` select only the caller's own active memberships (platform administrators may target schools). The membership selector supports multiple explicit roles in one school. Viewsets, related fields, exports, reports, background jobs and WebSockets enforce access. Drivers and attendants use assigned-trip APIs; parents receive only their linked children's trip information. Suspended schools lose operational access. Uploaded files use authenticated `/media/` delivery with the same scope checks; never expose `MEDIA_ROOT` as a public static directory.

Cookie-authentication endpoints require CSRF: first call `GET /api/auth/csrf/` with a cookie jar, then send its `csrfToken` in `X-CSRFToken` on login, refresh, logout and invitation acceptance. The React client and demo script handle this. Access tokens stay in memory; refresh tokens use a rotating httpOnly cookie. Password changes revoke existing JWTs. An invitation to an existing email requires the existing account's password and cannot replace that password.

### Roles & permissions
`apps/core/roles.py` is the single permission matrix (School Admin, Transport Manager, Attendant, Driver, Parent + platform admin flag). Views declare `required_perms`; the frontend only hides buttons.

### Ten-minute arrival alerts
GPS sample → `record_location` (validation) → Celery `process_location_update` → `eta.estimate` (projection onto the route polyline, recent speed, dwell) → `notify_student_guardians` with dedupe key `arrival:<trip>:<student>:<stop>` (unique per recipient) → in-app + push/email/SMS deliveries → WebSocket broadcast. Threshold: school `arrival_alert_minutes` (default 10). Also: significant ETA change, delay vs planned time, boarding/drop-off/no-show, school arrival, trip start/cancel, stale GPS. Cancelled/finished trips and absent students never trigger alerts.

## Testing, linting, builds
```bash
# Each subshell starts from the repository root. The test role needs CREATEDB.
(cd backend && .venv/bin/python manage.py collectstatic --noinput && .venv/bin/pytest)
(cd backend && .venv/bin/ruff check . && .venv/bin/python manage.py makemigrations --check --dry-run)
(cd frontend && npm run typecheck && npm run lint && npm test && npm run build)
(cd frontend && npx playwright install chromium && npm run test:e2e -- --workers=1)
```
Browser tests need a seeded API on port 8001 and frontend on 5173. Use `DJANGO_SETTINGS_MODULE=config.settings.e2e .venv/bin/python manage.py runserver 8001 --noreload` for the API during bulk browser testing: this development-only setting avoids authentication throttling during repeated logins. Never deploy it. Browser tests add fictional records to the demo database.

Production PWA verification, exact commands, results and remaining warnings are in [docs/TEST_RESULTS.md](docs/TEST_RESULTS.md). The [17-step workflow](docs/DEMO_WORKFLOW.md) also runs independently with `python3 scripts/demo_workflow.py --base http://localhost:8001`.

## Configuration
See `backend/.env.example` (all variables documented) and `frontend/.env.example`. Key switches: `DEMO_MODE`, `PAYMENT_GATEWAY` (`mock` by default), `EMAIL_BACKEND`, `SMS_PROVIDER`/`WHATSAPP_PROVIDER`, `VAPID_*` (web push), `ARRIVAL_ALERT_MINUTES`, `GPS_STALE_SECONDS`, `GPS_MAX_ACCURACY_METERS`, `DRIVER_LOCATION_INTERVAL_SECONDS`, `CELERY_TASK_ALWAYS_EAGER`.

## Documentation
- [docs/DEMO_WORKFLOW.md](docs/DEMO_WORKFLOW.md) – scripted end-to-end demo
- [docs/GPS_TRACKING.md](docs/GPS_TRACKING.md) – GPS pipeline, ETA, PWA background limitations, native/device paths
- [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) – replacing the mock gateway, email, SMS, push, maps
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) – production stack, HTTPS, settings, retention
- [docs/FEATURES.md](docs/FEATURES.md) – implemented features and known limitations
- API docs: `/api/docs/` (Swagger UI), `/api/redoc/`, `/api/schema/`
