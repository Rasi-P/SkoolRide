"""Consistent API error envelope: {"detail": "...", "code": "...", "errors": {...}}."""

from __future__ import annotations

import logging

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError
from django.http import Http404
from rest_framework import exceptions, status
from rest_framework.response import Response
from rest_framework.views import exception_handler

logger = logging.getLogger(__name__)


class DomainError(exceptions.APIException):
    """Raised by service layers for business-rule violations."""

    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = "Operation not allowed."
    default_code = "domain_error"


class ConflictError(DomainError):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "Conflict."
    default_code = "conflict"


class StateTransitionError(DomainError):
    default_detail = "Invalid state transition."
    default_code = "invalid_transition"


def api_exception_handler(exc, context):
    if isinstance(exc, DjangoValidationError):
        exc = exceptions.ValidationError(detail=exc.message_dict if hasattr(exc, "message_dict") else exc.messages)
    elif isinstance(exc, DjangoPermissionDenied):
        exc = exceptions.PermissionDenied()
    elif isinstance(exc, Http404):
        exc = exceptions.NotFound()
    elif isinstance(exc, IntegrityError):
        logger.warning("Integrity error: %s", exc)
        exc = ConflictError("The request conflicts with existing data.")

    response = exception_handler(exc, context)
    if response is None:
        logger.exception("Unhandled API exception", exc_info=exc)
        return Response(
            {"detail": "Internal server error.", "code": "server_error"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    data = response.data
    code = getattr(exc, "default_code", "error")
    if isinstance(exc, exceptions.ValidationError):
        if isinstance(data, dict):
            detail = data.get("detail") or data.get("non_field_errors") or "Validation failed."
            if isinstance(detail, list):
                detail = detail[0]
            errors = {k: v for k, v in data.items() if k != "detail"}
            response.data = {"detail": str(detail), "code": "validation_error", "errors": errors}
        else:
            response.data = {"detail": "Validation failed.", "code": "validation_error", "errors": data}
    elif isinstance(data, dict) and "detail" in data:
        detail = data["detail"]
        response.data = {"detail": str(detail), "code": getattr(detail, "code", code)}
    else:
        response.data = {"detail": str(data), "code": code}
    return response
