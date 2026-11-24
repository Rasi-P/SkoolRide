# Deployment

## Requirements
- The Compose stacks use PostgreSQL 16 and Redis 7. Python 3.12-3.14; Node 22.12+ recommended (build only).
- **HTTPS is mandatory**: PWA installation, service worker, geolocation and web push only work in secure contexts.

## Production stack (Docker)
```bash
cp backend/.env.prod.example backend/.env.prod   # fill SECRET_KEY, DATABASE_URL, ALLOWED_HOSTS, CORS/CSRF origins, FRONTEND_URL, VAPID keys...
docker compose -f docker-compose.prod.yml --env-file backend/.env.prod up --build -d
docker compose -f docker-compose.prod.yml --env-file backend/.env.prod exec backend python manage.py createsuperuser
```
Services: `postgres`, `redis`, `backend` (daphne ASGI: HTTP + WebSockets), `worker` (Celery), `beat` (Celery beat: stale GPS detection, trip generation, reminders, delivery retries), `web` (nginx serving the built PWA, proxying `/api`, `/ws`, `/media`, `/admin`). Put a TLS terminator (Caddy, Traefik, cloud LB) in front of `web` on 443 and forward `X-Forwarded-Proto`.

The web container binds to `127.0.0.1:8080` by default (`WEB_PORT` overrides the port). The TLS ingress must overwrite forwarded headers, not pass arbitrary client values through. Nginx preserves the trusted HTTPS scheme to avoid Django redirect loops. PostgreSQL and Redis are not publicly published in the production stack. Set `POSTGRES_PASSWORD` and the matching URL-encoded password in `DATABASE_URL`. Environment files are excluded from Docker image build contexts.

The frontend image pins nginx 1.30.6, the stable release listed in the [official nginx release notes](https://nginx.org/news.html) when checked on November 2, 2026. Recheck dependencies and image patches before deployment. `HEALTHCHECK_HOST` must be an entry in `ALLOWED_HOSTS`.

## Settings that matter
- `DJANGO_SETTINGS_MODULE=config.settings.production` (secure cookies, HSTS, SSL redirect).
- `DEMO_MODE=False` disables the GPS simulator, demo endpoints and seed/reset commands.
- `CELERY_TASK_ALWAYS_EAGER=False` (a worker + beat must run).
- `CORS_ALLOWED_ORIGINS` / `CSRF_TRUSTED_ORIGINS` / `FRONTEND_URL` = your public origin.
- `REFRESH_COOKIE_SECURE` is forced on in production; the refresh token is an httpOnly, SameSite=Lax cookie scoped to `/api/auth/`.
- `/media/` is authenticated by Django; do not add a public nginx alias or public storage bucket. For multiple instances, use private object storage with authorized short-lived downloads or stream through the existing permission checks.
- `config.settings.e2e` exists only for disposable browser tests; its relaxed throttle limits must never be deployed.
- Nginx disables WebSocket access logs because the handshake carries a short-lived token. Also redact token query strings and invitation/reset URLs at the ingress, ASGI server and observability layers.

Before serving real schools, configure real notification/payment providers, test HTTPS and device behavior, verify backup restoration and retention rules, and run deployment-specific security/load/accessibility reviews. The local test results do not establish production readiness.

## Backups & retention
`GPSLocation` grows quickly (one row per sample). Partition or prune by `recorded_at` (e.g. keep 90 days); `VehicleLocation` keeps current positions, and trip summaries/boarding events remain.

## Health
`GET /api/health/` checks the database. Daphne, Celery worker and beat should be supervised; the compose files use `restart: unless-stopped`.
