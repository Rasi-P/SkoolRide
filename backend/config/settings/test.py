from .base import *  # noqa: F401,F403
from .base import env

DEBUG = False
DEMO_MODE = True
SECRET_KEY = "test-secret-key-that-is-long-enough-for-hmac-sha256-0123456789"
REFRESH_COOKIE_SECURE = False
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
CHANNEL_LAYERS = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}
REST_FRAMEWORK = {**REST_FRAMEWORK, "DEFAULT_THROTTLE_CLASSES": ()}  # noqa: F405
DATABASES = {
    "default": env.db(
        "TEST_DATABASE_URL",
        default=env("DATABASE_URL", default="postgres://schoolbus:schoolbus@localhost:5432/schoolbus"),
    )
}
