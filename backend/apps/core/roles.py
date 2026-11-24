"""Central role and permission definitions.

Every protected API declares the permission code it needs; the backend resolves the
caller's school membership and checks the role matrix below. Frontend role checks are
only cosmetic.
"""

from __future__ import annotations

from django.db import models


class Role(models.TextChoices):
    SCHOOL_ADMIN = "SCHOOL_ADMIN", "School Admin"
    TRANSPORT_MANAGER = "TRANSPORT_MANAGER", "Transport Manager"
    ATTENDANT = "ATTENDANT", "Attendant"
    DRIVER = "DRIVER", "Driver"
    PARENT = "PARENT", "Parent"


STAFF_ROLES = {Role.SCHOOL_ADMIN, Role.TRANSPORT_MANAGER, Role.ATTENDANT, Role.DRIVER}
MANAGEMENT_ROLES = {Role.SCHOOL_ADMIN, Role.TRANSPORT_MANAGER}
OPERATIONAL_ROLES = {Role.DRIVER, Role.ATTENDANT}


class Perm:
    SCHOOL_VIEW = "school.view"
    SCHOOL_MANAGE = "school.manage"
    DASHBOARD_VIEW = "dashboard.view"
    VEHICLES_VIEW = "vehicles.view"
    VEHICLES_MANAGE = "vehicles.manage"
    STAFF_VIEW = "staff.view"
    STAFF_MANAGE = "staff.manage"
    STUDENTS_VIEW = "students.view"
    STUDENTS_MANAGE = "students.manage"
    PARENTS_VIEW = "parents.view"
    PARENTS_MANAGE = "parents.manage"
    ROUTES_VIEW = "routes.view"
    ROUTES_MANAGE = "routes.manage"
    TRIPS_VIEW = "trips.view"
    TRIPS_MANAGE = "trips.manage"
    TRIPS_EXECUTE = "trips.execute"
    GPS_SHARE = "gps.share"
    ATTENDANCE_VIEW = "attendance.view"
    ATTENDANCE_RECORD = "attendance.record"
    BILLING_VIEW = "billing.view"
    BILLING_MANAGE = "billing.manage"
    BILLING_RECORD_PAYMENT = "billing.record_payment"
    REPORTS_VIEW = "reports.view"
    ENGAGEMENT_VIEW = "engagement.view"
    ENGAGEMENT_MANAGE = "engagement.manage"
    INCIDENTS_REPORT = "incidents.report"
    ANNOUNCEMENTS_MANAGE = "announcements.manage"
    NOTIFICATIONS_MANAGE = "notifications.manage"
    PARENT_SELF = "parent.self"
    AUDIT_VIEW = "audit.view"


ALL_SCHOOL_PERMS = {v for k, v in vars(Perm).items() if not k.startswith("_") and k != "PARENT_SELF"}

ROLE_PERMISSIONS: dict[str, set[str]] = {
    Role.SCHOOL_ADMIN: set(ALL_SCHOOL_PERMS),
    Role.TRANSPORT_MANAGER: ALL_SCHOOL_PERMS - {Perm.SCHOOL_MANAGE, Perm.BILLING_MANAGE, Perm.AUDIT_VIEW, Perm.NOTIFICATIONS_MANAGE},
    Role.ATTENDANT: {
        Perm.TRIPS_EXECUTE,
        Perm.ATTENDANCE_RECORD,
        Perm.INCIDENTS_REPORT,
    },
    Role.DRIVER: {
        Perm.TRIPS_EXECUTE,
        Perm.GPS_SHARE,
        Perm.ATTENDANCE_RECORD,
        Perm.INCIDENTS_REPORT,
    },
    Role.PARENT: {Perm.PARENT_SELF},
}


def permissions_for_role(role: str) -> set[str]:
    return ROLE_PERMISSIONS.get(role, set())
