from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views as v

router = DefaultRouter()
router.register("mine", v.MyNotificationViewSet, basename="my-notifications")
router.register("history", v.SchoolNotificationHistoryViewSet, basename="school-notifications")

urlpatterns = [
    path("preferences/", v.PreferenceView.as_view(), name="notification-preferences"),
    path("push/subscriptions/", v.PushSubscribeView.as_view(), name="push-subscriptions"),
    *router.urls,
]
