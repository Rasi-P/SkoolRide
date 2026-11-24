from django.urls import re_path

from . import consumers

websocket_urlpatterns = [
    re_path(r"^ws/trips/(?P<trip_id>[0-9a-f-]+)/$", consumers.TripConsumer.as_asgi()),
    re_path(r"^ws/schools/(?P<school_id>[0-9a-f-]+)/live/$", consumers.SchoolLiveConsumer.as_asgi()),
    re_path(r"^ws/notifications/$", consumers.UserNotificationConsumer.as_asgi()),
]
