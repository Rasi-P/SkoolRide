# Verification report

Verified locally on **November 2, 2026**, using the existing application with the continuation fixes. Backend tests used PostgreSQL, not SQLite. Browser tests used the real Django APIs, PostgreSQL and Redis; frontend unit tests used MSW fixtures.

| Check | Result |
| --- | --- |
| Django migrations | Applied to an initially empty local PostgreSQL database; `migrate --check` succeeds |
| Model/migration consistency | `makemigrations --check --dry-run`: no changes detected |
| Django system check | No issues |
| Backend pytest suite | 92 passed |
| Python Ruff | No remaining errors |
| Frontend TypeScript | Pass |
| Frontend ESLint | No errors; 24 Fast Refresh export warnings |
| Frontend Vitest | 35 passed across 16 files |
| Development browser workflows | 26 passed; production-only PWA test intentionally skipped |
| Production browser workflows | 27 passed in 43.6 seconds, including the actual PWA/offline test |
| Full 17-step API demonstration | All 17 steps completed successfully |
| Production frontend build | Successful; manifest, icons and `sw.js` emitted; 126 public assets precached |
| OpenAPI generation/validation | 0 errors; 69 distinct inference/naming warnings |
| Docker Compose configuration | Development and production definitions validate |
| Docker image builds | Backend image and production frontend/nginx image build successfully |
| Container smoke checks | Backend system/migration checks pass; `nginx -t` passes |
| Responsive visual spot checks | Admin at 1440px and parent at 390px; no horizontal page overflow |

The browser suite covers registration/status, login and role navigation, school approval/invitations, school fleet/routes/billing screens, parent tracking/notifications/mock payment receipt, driver start/boarding/stops/completion, emergency confirmation cancellation and unauthorized navigation. Required-date validation is covered for parent absence requests; that browser test does not submit a complete absence workflow.

The production-only PWA test verifies manifest metadata/icons, actual service-worker control, private API/media/token URLs absent from Cache Storage, and the offline fallback during a real browser network disconnect. It caught and verified the fix for revisioned offline-page lookup.

Added backend regressions cover cross-school access, assigned-driver/attendant permissions, live socket recipient privacy and revocation, withdrawn assignments, invalid/stale GPS, drop-off ETA alert deduplication, CSRF, password-change token invalidation, existing-account invitation ownership, protected file downloads, explicit multi-role membership selection, safe seeding, and payment ownership/signature/outcome/balance/idempotency checks.

## Reproduce

Use a **disposable demo database**: browser and API demonstration tests add fictional records. `seed_demo_data` does not overwrite existing data. Tests assume the demo accounts from the README. `pytest` creates its own test database and does not use the demo records.

From the repository root, with PostgreSQL/Redis running:

```bash
(cd backend && .venv/bin/python manage.py collectstatic --noinput && .venv/bin/pytest)
(cd backend && .venv/bin/ruff check . && .venv/bin/python manage.py makemigrations --check --dry-run)
(cd backend && .venv/bin/python manage.py spectacular --file /tmp/schoolbus-openapi.yaml --validate)
(cd frontend && npm run typecheck && npm run lint && npm test && npm run build)
```

For production browser testing, stop any existing API process on port 8001. In one terminal:

```bash
cd backend
DJANGO_SETTINGS_MODULE=config.settings.e2e \
CSRF_TRUSTED_ORIGINS=http://localhost:5173,http://localhost:4173 \
.venv/bin/python manage.py runserver 8001 --noreload
```

In another terminal:

```bash
cd frontend
npm run build
npm run preview                          # http://localhost:4173
```

Then from the repository root:

```bash
(cd frontend && npx playwright install chromium)
(cd frontend && E2E_BASE_URL=http://localhost:4173 E2E_PRODUCTION=1 npm run test:e2e -- --workers=1)
python3 scripts/demo_workflow.py --base http://localhost:8001
```

The committed GitHub Actions workflow repeats backend/frontend checks and runs the built PWA browser suite plus the API demonstration. The workflow was added locally; a hosted GitHub Actions run has not been observed.

After verification, the disposable local database created for this task was restored to clean seed data: 3 schools, 8 vehicles, 36 students, 31 parent profiles, 96 trips, 3,965 GPS samples and 69 invoices. The local API was returned to normal development settings; the Vite frontend and built PWA preview remain available on ports 5173 and 4173 respectively while their processes run.

## Limits of this verification

- Production TLS ingress, real-device background GPS and push delivery, real payment providers, external email/SMS, multi-worker production operation, load, penetration and assistive-technology testing were not verified.
- OpenAPI has valid output but generic custom-response schemas and naming warnings; ESLint warnings concern mixed component/helper exports during development Fast Refresh.
- Vitest emits jsdom pseudo-element/chart-size warnings and the local Node 26 runtime's experimental storage warning. Local Python 3.14/Daphne also logs cancelled-request tracebacks when browser navigation aborts requests; no failed API assertion was attributed to those cancellations.
- GPS predictions follow route polylines and recent speed; no road-routing or field-accuracy validation was performed. All seeded GPS/payment records and the local simulator/mock gateway are demonstrations.
- These checks establish a working local demonstration, not production readiness.
