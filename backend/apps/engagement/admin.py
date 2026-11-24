from django.contrib import admin

from .models import AbsenceRequest, Announcement, Complaint, ComplaintComment, PickupChangeRequest

admin.site.register([AbsenceRequest, PickupChangeRequest, Complaint, ComplaintComment, Announcement])
