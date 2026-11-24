from django.contrib import admin

from .models import StaffVehicleAssignment, Vehicle, VehicleDocument, VehicleMaintenance

admin.site.register([Vehicle, VehicleDocument, VehicleMaintenance, StaffVehicleAssignment])
