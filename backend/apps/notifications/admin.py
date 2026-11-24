from django.contrib import admin

from .models import Notification, NotificationDelivery, NotificationPreference, PushSubscription

admin.site.register([Notification, NotificationDelivery, NotificationPreference, PushSubscription])
