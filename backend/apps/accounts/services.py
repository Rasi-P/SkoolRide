from __future__ import annotations

from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode

from apps.core.audit import record_audit
from apps.core.exceptions import DomainError

from .models import Invitation, User


def send_password_reset_email(email: str) -> None:
    user = User.objects.filter(email=email.lower(), is_active=True).first()
    if user is None:
        return  # never disclose whether the account exists
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    link = f"{settings.FRONTEND_URL}/reset-password?uid={uid}&token={token}"
    send_mail(
        "Reset your SchoolBus Pro password",
        f"Hello {user.first_name},\n\nUse the link below to reset your password:\n{link}\n\nIf you did not request this, you can ignore this email.",
        settings.DEFAULT_FROM_EMAIL,
        [user.email],
    )


def confirm_password_reset(uid: str, token: str, new_password: str) -> User:
    try:
        user = User.objects.get(pk=force_str(urlsafe_base64_decode(uid)))
    except (User.DoesNotExist, ValueError, TypeError):
        raise DomainError("Invalid or expired reset link.") from None
    if not default_token_generator.check_token(user, token):
        raise DomainError("Invalid or expired reset link.")
    user.set_password(new_password)
    user.must_change_password = False
    user.save(update_fields=["password", "must_change_password", "updated_at"])
    record_audit(action="auth.password_reset", actor=user, target=user)
    return user


def create_invitation(*, school, email: str, role: str, invited_by, first_name="", last_name="", metadata=None):
    """Create (or refresh) a pending invitation and email the acceptance link."""
    Invitation.objects.filter(school=school, email=email.lower(), status=Invitation.Status.PENDING).update(status=Invitation.Status.REVOKED)
    invitation = Invitation.objects.create(
        school=school,
        email=email,
        role=role,
        invited_by=invited_by,
        first_name=first_name,
        last_name=last_name,
        metadata=metadata or {},
    )
    link = f"{settings.FRONTEND_URL}/invite/{invitation.token}"
    send_mail(
        f"You're invited to {school.name} on SchoolBus Pro",
        f"Hello {first_name or ''},\n\nYou have been invited to join {school.name} as "
        f"{role.replace('_', ' ').title()}.\nAccept the invitation here: {link}\n\n"
        f"This link expires on {invitation.expires_at:%d %b %Y}.",
        settings.DEFAULT_FROM_EMAIL,
        [invitation.email],
    )
    record_audit(action="invitation.created", actor=invited_by, school=school, target=invitation)
    return invitation


@transaction.atomic
def accept_invitation(*, token: str, first_name="", last_name="", phone="", password="", current_password="", request=None) -> User:
    from apps.schools.models import SchoolMembership

    invitation = Invitation.objects.select_for_update().select_related("school").filter(token=token).first()
    if invitation is None or not invitation.is_valid:
        if invitation and invitation.status == Invitation.Status.PENDING:
            invitation.status = Invitation.Status.EXPIRED
            invitation.save(update_fields=["status"])
        raise DomainError("This invitation is invalid or has expired.")

    user = User.objects.filter(email=invitation.email).first()
    if user is None:
        if not password:
            raise DomainError("A password is required to create your account.")
        user = User.objects.create_user(
            email=invitation.email,
            password=password,
            first_name=first_name or invitation.first_name or invitation.email.split("@")[0],
            last_name=last_name or invitation.last_name,
            phone=phone,
        )
    else:
        # An invitation grants school membership, never ownership of an existing account.
        if not user.is_active or not user.check_password(current_password):
            raise DomainError("Enter your existing account password to accept this invitation.")

    membership, _ = SchoolMembership.objects.get_or_create(user=user, school=invitation.school, role=invitation.role, defaults={"is_active": True})
    if not membership.is_active:
        membership.is_active = True
        membership.save(update_fields=["is_active"])

    # Link pending profiles created by the school before the invite was accepted.
    from apps.people.models import ParentProfile, StaffProfile

    profile_id = invitation.metadata.get("staff_profile_id")
    if profile_id:
        StaffProfile.objects.filter(pk=profile_id, school=invitation.school).update(membership=membership)
    parent_id = invitation.metadata.get("parent_profile_id")
    if parent_id:
        ParentProfile.objects.filter(pk=parent_id, school=invitation.school).update(membership=membership)

    invitation.status = Invitation.Status.ACCEPTED
    invitation.accepted_at = timezone.now()
    invitation.accepted_user = user
    invitation.save(update_fields=["status", "accepted_at", "accepted_user"])

    if invitation.school.status == invitation.school.Status.APPROVED and invitation.role == "SCHOOL_ADMIN":
        invitation.school.status = invitation.school.Status.ACTIVE
        invitation.school.activated_at = timezone.now()
        invitation.school.save(update_fields=["status", "activated_at"])

    record_audit(action="invitation.accepted", request=request, actor=user, school=invitation.school, target=invitation)
    return user
