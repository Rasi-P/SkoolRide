from django.contrib import admin

from .models import BoardingEvent, GPSLocation, Incident, Trip, TripEvent, TripStop, TripStudent, VehicleLocation

admin.site.register([Trip, TripStop, TripStudent, GPSLocation, VehicleLocation, BoardingEvent, TripEvent, Incident])
