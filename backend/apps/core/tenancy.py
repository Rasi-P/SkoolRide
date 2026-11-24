"""Resolve the school scope of a request from server-side membership, never from client input alone."""

from __future__ import annotations

from dataclasses import dataclass

from rest_framework import exceptions

from .roles import permissions_for_role


@dataclass
class TenantContext:
    school: object | None
    membership: object | None
    is_platform_admin: bool

    @property
    def role(self) -> str | None:
        return self.membership.role if self.membership else None

    @property
    def permissions(self) -> set[str]:
        if self.is_platform_admin:
            from .roles import ALL_SCHOOL_PERMS

            return set(ALL_SCHOOL_PERMS)
        if self.membership is None:
            return set()
        return permissions_for_role(self.membership.role)

    def has_perm(self, perm: str) -> bool:
        return perm in self.permissions


def _requested_school_id(request) -> str | None:
    value = request.headers.get("X-School-Id") or request.query_params.get("school_id")
    return value or None


def resolve_tenant(request) -> TenantContext:
    """Determine which school (if any) this request operates on.

    * Platform admins may target any school by sending the X-School-Id header.
    * Everyone else can only target schools where they hold an active membership.
      If they hold several, X-School-Id selects one of *their* memberships.
    The result is cached on the request.
    """
    cached = getattr(request, "_tenant_context", None)
    if cached is not None:
        return cached

    from apps.schools.models import School, SchoolMembership

    user = request.user
    ctx = TenantContext(school=None, membership=None, is_platform_admin=False)
    if not user or not user.is_authenticated:
        request._tenant_context = ctx
        return ctx

    requested = _requested_school_id(request)
    requested_membership = request.headers.get("X-Membership-Id")

    if user.is_platform_admin:
        ctx.is_platform_admin = True
        if requested:
            ctx.school = School.objects.filter(pk=requested).first()
            if ctx.school is None:
                raise exceptions.NotFound("School not found.")
        request._tenant_context = ctx
        return ctx

    memberships = list(SchoolMembership.objects.select_related("school").filter(user=user, is_active=True).order_by("created_at"))
    membership = None
    if requested_membership:
        membership = next((m for m in memberships if str(m.id) == requested_membership), None)
        if membership is None or (requested and str(membership.school_id) != requested):
            raise exceptions.PermissionDenied("You do not have access to this membership.")
    elif requested:
        membership = next((m for m in memberships if str(m.school_id) == str(requested)), None)
        if membership is None:
            # Never reveal whether the school exists.
            raise exceptions.PermissionDenied("You do not have access to this school.")
    elif memberships:
        membership = next((m for m in memberships if m.is_primary), memberships[0])

    if membership is not None:
        ctx.membership = membership
        ctx.school = membership.school
    request._tenant_context = ctx
    return ctx
