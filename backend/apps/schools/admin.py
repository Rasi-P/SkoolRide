from django.contrib import admin

from .models import NotificationTemplate, PlatformSetting, School, SchoolApplication, SchoolMembership, SchoolSubscription, SubscriptionPlan

admin.site.register([School, SchoolApplication, SchoolMembership, SchoolSubscription, SubscriptionPlan, PlatformSetting, NotificationTemplate])
