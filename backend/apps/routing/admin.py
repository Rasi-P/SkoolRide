from django.contrib import admin

from .models import Route, RouteSchedule, RouteStop, StudentTransportAssignment

admin.site.register([Route, RouteStop, RouteSchedule, StudentTransportAssignment])
