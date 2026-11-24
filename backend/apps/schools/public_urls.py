from django.urls import path

from . import public_views as v

urlpatterns = [
    path("config/", v.PublicConfigView.as_view(), name="public-config"),
    path("plans/", v.PublicPlansView.as_view(), name="public-plans"),
    path("register-school/", v.SchoolRegistrationView.as_view(), name="public-register-school"),
    path("applications/<str:tracking_code>/", v.ApplicationStatusView.as_view(), name="public-application-status"),
]
