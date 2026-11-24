from .base import *  # noqa: F401,F403
from .base import REST_FRAMEWORK, STORAGES, env

DEBUG = env("DEBUG", default=True)
DEMO_MODE = env("DEMO_MODE", default=True)
ALLOWED_HOSTS = ["*"]
CORS_ALLOWED_ORIGINS = env(
    "CORS_ALLOWED_ORIGINS",
    default=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:8080"],
)
CSRF_TRUSTED_ORIGINS = env(
    "CSRF_TRUSTED_ORIGINS",
    default=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:8080"],
)
SESSION_COOKIE_SECURE = False
CSRF_COOKIE_SECURE = False
REFRESH_COOKIE_SECURE = False
EMAIL_BACKEND = env("EMAIL_BACKEND", default="django.core.mail.backends.console.EmailBackend")
# Static files served directly by Django in development.
STORAGES["staticfiles"] = {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"}
# Relaxed auth throttling for local development / demo scripts (production keeps 10/min).
REST_FRAMEWORK = {
    **REST_FRAMEWORK,
    "DEFAULT_THROTTLE_RATES": {**REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"], "auth": "120/min", "registration": "60/hour"},
}  # noqa: F405
