"""Disposable local/CI browser-test environment. Never deploy with this settings module."""

from django.core.exceptions import ImproperlyConfigured

from .development import *  # noqa: F401,F403

if not DEBUG or not DEMO_MODE:  # noqa: F405
    raise ImproperlyConfigured("Browser-test settings require DEBUG=True and DEMO_MODE=True.")

REST_FRAMEWORK = {  # noqa: F405
    **REST_FRAMEWORK,  # noqa: F405
    "DEFAULT_THROTTLE_RATES": {
        **REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"],  # noqa: F405
        "auth": "1000/min", "registration": "1000/hour",
    },
}
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
