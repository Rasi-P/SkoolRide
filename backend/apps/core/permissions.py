from __future__ import annotations

from rest_framework import permissions

from .tenancy import resolve_tenant


class IsPlatformAdmin(permissions.BasePermission):
    message = "Platform administrator access required."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_platform_admin)


class SchoolScoped(permissions.BasePermission):
    """Requires an operational school in scope (active school, active subscription)."""

    message = "No active school in scope."

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        ctx = resolve_tenant(request)
        if ctx.school is None:
            return False
        if not ctx.school.is_operational and not getattr(view, "allow_non_operational", False):
            self.message = "This school is not active. Contact the platform administrator."
            return False
        return True


class HasSchoolPerm(SchoolScoped):
    """Checks a permission code against the membership role matrix.

    Views declare `required_perms = {"GET": Perm.X, "POST": Perm.Y, "*": Perm.Z}` or a single string.
    """

    def has_permission(self, request, view):
        if not super().has_permission(request, view):
            return False
        ctx = resolve_tenant(request)
        required = getattr(view, "required_perms", None)
        if required is None:
            return True
        if isinstance(required, str):
            needed = required
        else:
            method = request.method.upper()
            if method in ("HEAD", "OPTIONS"):
                method = "GET"
            needed = required.get(method) or required.get("*")
            if needed is None and method in ("PUT", "PATCH", "DELETE"):
                needed = required.get("POST")
        if needed is None:
            return True
        if not ctx.has_perm(needed):
            self.message = "You do not have permission to perform this action."
            return False
        return True


class IsParent(permissions.BasePermission):
    message = "Parent access required."

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        ctx = resolve_tenant(request)
        return ctx.membership is not None and ctx.membership.role == "PARENT" and ctx.school.is_operational


class IsDriverOrAttendant(permissions.BasePermission):
    message = "Driver or attendant access required."

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        ctx = resolve_tenant(request)
        return ctx.membership is not None and ctx.membership.role in ("DRIVER", "ATTENDANT") and ctx.school.is_operational


class ReadOnly(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.method in permissions.SAFE_METHODS
