from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularRedocView, SpectacularSwaggerView

from apps.core.media import ProtectedMediaView
from apps.core.views import HealthView

urlpatterns = [
    path("media/<path:name>", ProtectedMediaView.as_view(), name="protected-media"),
    path("admin/", admin.site.urls),
    path("api/health/", HealthView.as_view(), name="health"),
    path("api/auth/", include("apps.accounts.urls")),
    path("api/platform/", include("apps.schools.platform_urls")),
    path("api/public/", include("apps.schools.public_urls")),
    path("api/school/", include("apps.schools.school_urls")),
    path("api/people/", include("apps.people.urls")),
    path("api/fleet/", include("apps.fleet.urls")),
    path("api/routing/", include("apps.routing.urls")),
    path("api/trips/", include("apps.trips.urls")),
    path("api/notifications/", include("apps.notifications.urls")),
    path("api/billing/", include("apps.billing.urls")),
    path("api/engagement/", include("apps.engagement.urls")),
    path("api/reports/", include("apps.reports.urls")),
    path("api/parent/", include("apps.people.parent_urls")),
    path("api/driver/", include("apps.trips.driver_urls")),
    path("api/demo/", include("apps.demo.urls")),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    path("api/redoc/", SpectacularRedocView.as_view(url_name="schema"), name="redoc"),
]

