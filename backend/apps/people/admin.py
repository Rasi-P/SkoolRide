from django.contrib import admin

from .models import GuardianStudent, ParentProfile, StaffAttendance, StaffDocument, StaffLeave, StaffProfile, Student

admin.site.register([StaffProfile, StaffDocument, StaffLeave, StaffAttendance, ParentProfile, Student, GuardianStudent])
