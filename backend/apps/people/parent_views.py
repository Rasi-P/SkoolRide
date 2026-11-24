"""Parent-facing API (/api/parent/). Every query is scoped to the parent's own linked children."""

from __future__ import annotations

import zoneinfo
from datetime import timedelta

from django.conf import settings
from django.db.models import Q
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from drf_spectacular.utils import extend_schema as _extend_schema
from rest_framework import serializers, status
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.audit import record_audit
from apps.core.permissions import IsParent
from apps.core.tenancy import resolve_tenant
from apps.notifications.serializers import NotificationPreferenceSerializer
from apps.notifications.services import get_or_create_preference

from .models import ParentProfile, Student


class ParentBase(APIView):
    permission_classes = [IsParent]

    @property
    def tenant(self):
        return resolve_tenant(self.request)

    @property
    def school(self):
        return self.tenant.school

    @property
    def parent(self) -> ParentProfile:
        profile = getattr(self.tenant.membership, "parent_profile", None)
        if profile is None:
            raise PermissionDenied("No parent profile is linked to your account. Ask the school to re-send your invitation.")
        if profile.status == ParentProfile.Status.SUSPENDED:
            raise PermissionDenied("Your parent account has been suspended. Contact the school.")
        return profile

    def children(self):
        return (
            Student.objects.filter(school=self.school, guardian_links__parent=self.parent)
            .distinct()
            .prefetch_related(
                "transport_assignments__route__vehicle", "transport_assignments__pickup_stop", "transport_assignments__dropoff_stop", "guardian_links"
            )
        )

    def child(self, student_id) -> Student:
        student = self.children().filter(pk=student_id).first()
        if student is None:
            raise NotFound("Child not found.")
        return student

    def today(self):
        return timezone.now().astimezone(zoneinfo.ZoneInfo(self.school.timezone)).date()


def _assignment_payload(student: Student, school):
    a = next((x for x in student.transport_assignments.all() if x.is_active), None)
    if a is None:
        return None
    route = a.route
    vehicle = route.vehicle
    driver = route.driver
    from apps.fleet.models import StaffVehicleAssignment

    if driver is None and vehicle is not None:
        sva = StaffVehicleAssignment.objects.filter(vehicle=vehicle, role="DRIVER", is_active=True).select_related("staff").first()
        driver = sva.staff if sva else None
    return {
        "id": str(a.id),
        "route": {"id": str(route.id), "code": route.code, "name": route.name, "colour": route.colour},
        "pickup_stop": _stop(a.pickup_stop),
        "dropoff_stop": _stop(a.dropoff_stop),
        "uses_pickup": a.uses_pickup,
        "uses_dropoff": a.uses_dropoff,
        "vehicle": {
            "id": str(vehicle.id),
            "registration_number": vehicle.registration_number,
            "fleet_number": vehicle.fleet_number,
            "display_name": vehicle.display_name,
            "capacity": vehicle.capacity,
            "colour": vehicle.colour,
        }
        if vehicle
        else None,
        "driver": {"name": driver.full_name, "phone": driver.phone if school.show_driver_phone_to_parents else None} if driver else None,
        "attendant": {"name": route.attendant.full_name} if route.attendant else None,
        "start_date": a.start_date,
    }


def _stop(stop):
    if stop is None:
        return None
    return {
        "id": str(stop.id),
        "name": stop.name,
        "latitude": float(stop.latitude),
        "longitude": float(stop.longitude),
        "address": stop.address,
        "landmark": stop.landmark,
        "planned_pickup_time": stop.planned_pickup_time,
        "planned_dropoff_time": stop.planned_dropoff_time,
        "sequence": stop.sequence,
    }


def _child_summary(student: Student, school):
    return {
        "id": str(student.id),
        "name": student.full_name,
        "first_name": student.first_name,
        "admission_number": student.admission_number,
        "class_label": student.class_label,
        "grade": student.grade,
        "section": student.section,
        "photo": student.photo.url if student.photo else None,
        "status": student.status,
        "transport_status": student.transport_status,
        "transport": _assignment_payload(student, school),
    }


@_extend_schema(responses={200: OpenApiTypes.OBJECT})
class ParentChildrenView(ParentBase):
    def get(self, request):
        return Response([_child_summary(s, self.school) for s in self.children()])


@_extend_schema(responses={200: OpenApiTypes.OBJECT})
class ParentSchoolView(ParentBase):
    def get(self, request):
        s = self.school
        return Response(
            {
                "id": str(s.id),
                "name": s.name,
                "logo": s.logo.url if s.logo else None,
                "timezone": s.timezone,
                "currency": s.currency,
                "transport_office_phone": s.transport_office_phone or s.phone,
                "transport_office_email": s.transport_office_email or s.email,
                "emergency_contact_phone": s.emergency_contact_phone,
                "parent_help_text": s.parent_help_text,
                "address": s.full_address,
                "pickup_change_cutoff_hours": s.pickup_change_cutoff_hours,
                "absence_report_cutoff_minutes": s.absence_report_cutoff_minutes,
                "arrival_alert_minutes": s.arrival_alert_minutes,
                "accepted_payment_methods": s.accepted_payment_methods,
                "demo_mode": settings.DEMO_MODE,
            }
        )


def _trip_for_child(student: Student, school, date=None):
    """Trips the child is part of; today's active trip first."""
    from apps.trips.access import authorized_child_trips
    from apps.trips.models import TripStudent

    qs = TripStudent.objects.filter(student=student, trip__school=school).select_related(
        "trip__route", "trip__vehicle", "trip__driver", "trip_stop__route_stop"
    )
    if date:
        qs = qs.filter(trip__scheduled_date=date)
    return authorized_child_trips(qs).order_by("-trip__scheduled_date", "trip__scheduled_start_time")


def _eta_for(trip, trip_stop):
    if trip_stop is None or trip_stop.status != "PENDING" or trip.status != "IN_PROGRESS" or trip.gps_is_stale():
        return None
    if trip_stop.eta is None:
        return None
    secs = (trip_stop.eta - timezone.now()).total_seconds()
    return {"eta_at": trip_stop.eta, "seconds": max(0, int(secs)), "minutes": max(0, round(secs / 60)), "distance_m": trip_stop.distance_remaining_m}


def _live_payload(student: Student, school, ts=None):
    from apps.trips.models import VehicleLocation
    from apps.trips.serializers import TripStopSerializer

    today = timezone.now().astimezone(zoneinfo.ZoneInfo(school.timezone)).date()
    if ts is None:
        rows = list(_trip_for_child(student, school, today))
        ts = (
            next((r for r in rows if r.trip.is_active), None)
            or next((r for r in rows if r.trip.status == "SCHEDULED"), None)
            or (rows[0] if rows else None)
        )
    assignment = _assignment_payload(student, school)
    if ts is None:
        return {
            "student": _child_summary(student, school),
            "assignment": assignment,
            "trip": None,
            "trip_student": None,
            "location": None,
            "stale": None,
            "eta": None,
            "stops": [],
            "route_path": [],
            "server_time": timezone.now(),
        }
    trip = ts.trip
    loc = VehicleLocation.objects.filter(trip=trip).first() if trip.is_active else None
    stale = trip.gps_is_stale() if trip.is_active else None
    stops = trip.stops.select_related("route_stop").prefetch_related("trip_students").order_by("sequence")
    stop_rows = TripStopSerializer(stops, many=True).data
    for row in stop_rows:  # parents never see other students' counts
        row.pop("expected_count", None)
        row.pop("boarded_count", None)
    my_stop = ts.trip_stop
    driver = trip.driver
    return {
        "student": _child_summary(student, school),
        "assignment": assignment,
        "trip": {
            "id": str(trip.id),
            "status": trip.status,
            "direction": trip.direction,
            "scheduled_date": trip.scheduled_date,
            "scheduled_start_time": trip.scheduled_start_time,
            "started_at": trip.started_at,
            "ended_at": trip.ended_at,
            "delay_minutes": trip.delay_minutes,
            "is_simulated": trip.is_simulated,
            "cancelled_reason": trip.cancelled_reason,
            "route": {"id": str(trip.route_id), "code": trip.route.code, "name": trip.route.name, "colour": trip.route.colour},
            "vehicle": {
                "registration_number": trip.vehicle.registration_number,
                "fleet_number": trip.vehicle.fleet_number,
                "display_name": trip.vehicle.display_name,
            }
            if trip.vehicle
            else None,
            "driver": {"name": driver.full_name, "phone": driver.phone if school.show_driver_phone_to_parents else None} if driver else None,
            "next_stop": next(({"id": s["id"], "name": s["name"], "eta": s["eta"]} for s in stop_rows if s["status"] == "PENDING"), None),
        },
        "trip_student": {
            "id": str(ts.id),
            "status": ts.status,
            "boarded_at": ts.boarded_at,
            "dropped_at": ts.dropped_at,
            "stop": {
                "id": str(my_stop.id),
                "name": my_stop.route_stop.name,
                "sequence": my_stop.sequence,
                "latitude": float(my_stop.route_stop.latitude),
                "longitude": float(my_stop.route_stop.longitude),
                "planned_time": my_stop.planned_time,
                "status": my_stop.status,
                "eta": my_stop.eta,
            }
            if my_stop
            else None,
        },
        "location": {
            "latitude": loc.latitude,
            "longitude": loc.longitude,
            "speed_mps": loc.speed_mps,
            "heading": loc.heading,
            "accuracy_m": loc.accuracy_m,
            "recorded_at": loc.recorded_at,
            "is_simulated": loc.is_simulated,
        }
        if loc
        else None,
        "stale": stale,
        "last_location_at": trip.last_location_at,
        "stale_after_seconds": school.gps_stale_seconds,
        "eta": _eta_for(trip, my_stop),
        "stops": stop_rows,
        "route_path": [[lat, lng] for lat, lng in trip.route.polyline(trip.direction)],
        "server_time": timezone.now(),
    }


@_extend_schema(responses={200: OpenApiTypes.OBJECT})
class ParentHomeView(ParentBase):
    def get(self, request):
        from apps.billing.models import Invoice
        from apps.engagement.models import Announcement
        from apps.notifications.models import Notification

        children = list(self.children())
        if not children:
            return Response({"children": [], "selected": None})
        selected_id = request.query_params.get("student")
        student = next((c for c in children if str(c.id) == selected_id), children[0])
        today = self.today()
        today_rows = list(_trip_for_child(student, self.school, today))
        live = _live_payload(student, self.school)
        invoices = Invoice.objects.filter(student=student, status__in=Invoice.OPEN_STATUSES)
        outstanding = sum((i.balance for i in invoices), 0)
        announcements = (
            Announcement.objects.filter(school=self.school, publish_at__lte=timezone.now())
            .filter(Q(expires_at__isnull=True) | Q(expires_at__gt=timezone.now()))
            .filter(
                Q(audience__in=["ALL", "PARENTS"])
                | Q(audience="ROUTE", route__student_assignments__student=student, route__student_assignments__is_active=True)
            )
            .distinct()
            .order_by("-is_pinned", "-publish_at")[:5]
        )
        return Response(
            {
                "children": [_child_summary(c, self.school) for c in children],
                "selected": _child_summary(student, self.school),
                "today": today,
                "today_trips": [
                    {
                        "trip_id": str(r.trip_id),
                        "direction": r.trip.direction,
                        "status": r.trip.status,
                        "scheduled_start_time": r.trip.scheduled_start_time,
                        "student_status": r.status,
                        "stop": r.trip_stop.route_stop.name if r.trip_stop else None,
                        "planned_time": r.trip_stop.planned_time if r.trip_stop else None,
                        "eta": _eta_for(r.trip, r.trip_stop),
                        "vehicle": r.trip.vehicle.display_name if r.trip.vehicle else None,
                        "delay_minutes": r.trip.delay_minutes,
                        "is_simulated": r.trip.is_simulated,
                    }
                    for r in today_rows
                ],
                "live": live,
                "fees": {
                    "outstanding": str(outstanding),
                    "open_invoices": invoices.count(),
                    "overdue": invoices.filter(status="OVERDUE").count(),
                    "currency": self.school.currency,
                    "next_due": min((i.due_date for i in invoices), default=None),
                },
                "unread_notifications": Notification.objects.filter(recipient=request.user, school=self.school, is_read=False).count(),
                "announcements": [
                    {"id": str(a.id), "title": a.title, "body": a.body, "publish_at": a.publish_at, "is_pinned": a.is_pinned} for a in announcements
                ],
            }
        )


@_extend_schema(responses={200: OpenApiTypes.OBJECT})
class ParentLiveView(ParentBase):
    def get(self, request, student_id):
        student = self.child(student_id)
        trip_id = request.query_params.get("trip")
        ts = None
        if trip_id:
            ts = _trip_for_child(student, self.school).filter(trip_id=trip_id).first()
            if ts is None:
                raise NotFound("Trip not found for this child.")
        return Response(_live_payload(student, self.school, ts))


@_extend_schema(responses={200: OpenApiTypes.OBJECT})
class ParentTripHistoryView(ParentBase):
    def get(self, request, student_id):
        student = self.child(student_id)
        days = int(request.query_params.get("days", 30))
        rows = _trip_for_child(student, self.school).filter(trip__scheduled_date__gte=self.today() - timedelta(days=days))[:200]
        return Response(
            [
                {
                    "trip_id": str(r.trip_id),
                    "date": r.trip.scheduled_date,
                    "direction": r.trip.direction,
                    "trip_status": r.trip.status,
                    "student_status": r.status,
                    "boarded_at": r.boarded_at,
                    "dropped_at": r.dropped_at,
                    "route": r.trip.route.code,
                    "vehicle": r.trip.vehicle.registration_number if r.trip.vehicle else None,
                    "stop": r.trip_stop.route_stop.name if r.trip_stop else None,
                    "started_at": r.trip.started_at,
                    "ended_at": r.trip.ended_at,
                    "delay_minutes": r.trip.delay_minutes,
                    "absence_reason": r.absence_reason,
                }
                for r in rows
            ]
        )


@_extend_schema(responses={200: OpenApiTypes.OBJECT})
class ParentAttendanceView(ParentBase):
    def get(self, request, student_id):
        from apps.trips.models import BoardingEvent

        student = self.child(student_id)
        days = int(request.query_params.get("days", 30))
        events = BoardingEvent.objects.filter(student=student, occurred_at__gte=timezone.now() - timedelta(days=days)).select_related(
            "trip__route", "trip_stop__route_stop"
        )[:300]
        return Response(
            [
                {
                    "id": str(e.id),
                    "event_type": e.event_type,
                    "occurred_at": e.occurred_at,
                    "date": e.trip.scheduled_date,
                    "direction": e.trip.direction,
                    "stop": e.trip_stop.route_stop.name if e.trip_stop else None,
                    "route": e.trip.route.code,
                    "note": e.note,
                }
                for e in events
            ]
        )


@_extend_schema(responses={200: OpenApiTypes.OBJECT})
class ParentScheduleView(ParentBase):
    def get(self, request, student_id):
        student = self.child(student_id)
        a = next((x for x in student.transport_assignments.all() if x.is_active), None)
        if a is None:
            return Response({"assignment": None, "schedules": [], "stops": []})
        from apps.routing.serializers import RouteScheduleSerializer, RouteStopSerializer

        return Response(
            {
                "assignment": _assignment_payload(student, self.school),
                "schedules": RouteScheduleSerializer(a.route.schedules.filter(is_active=True), many=True).data,
                "stops": RouteStopSerializer(a.route.stops.order_by("sequence"), many=True).data,
                "route_path": [[lat, lng] for lat, lng in a.route.polyline()],
            }
        )


class ParentProfileSerializer(serializers.Serializer):
    first_name = serializers.CharField(max_length=80, required=False)
    last_name = serializers.CharField(max_length=80, required=False, allow_blank=True)
    phone = serializers.CharField(max_length=32, required=False)
    alt_phone = serializers.CharField(max_length=32, required=False, allow_blank=True)
    address = serializers.CharField(required=False, allow_blank=True)
    preferred_language = serializers.CharField(max_length=8, required=False)


@_extend_schema(responses={200: OpenApiTypes.OBJECT})
class ParentProfileView(ParentBase):
    def get(self, request):
        p = self.parent
        pref = get_or_create_preference(request.user)
        return Response(
            {
                "id": str(p.id),
                "first_name": p.first_name,
                "last_name": p.last_name,
                "email": p.email,
                "phone": p.phone,
                "alt_phone": p.alt_phone,
                "address": p.address,
                "preferred_language": p.preferred_language,
                "status": p.status,
                "children": [
                    {
                        "student_id": str(g.student_id),
                        "name": g.student.full_name,
                        "relationship": g.relationship,
                        "is_primary": g.is_primary,
                        "can_pickup": g.can_pickup,
                        "receives_notifications": g.receives_notifications,
                    }
                    for g in p.guardian_links.select_related("student")
                ],
                "notification_preferences": NotificationPreferenceSerializer(pref).data,
            }
        )

    @extend_schema(request=ParentProfileSerializer)
    def patch(self, request):
        p = self.parent
        ser = ParentProfileSerializer(data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        for k, v in ser.validated_data.items():
            setattr(p, k, v)
        p.save()
        user = request.user
        if "first_name" in ser.validated_data:
            user.first_name = ser.validated_data["first_name"]
        if "last_name" in ser.validated_data:
            user.last_name = ser.validated_data["last_name"]
        if "phone" in ser.validated_data:
            user.phone = ser.validated_data["phone"]
        user.save()
        record_audit(action="parent.profile_updated", request=request, target=p)
        return self.get(request)


@_extend_schema(responses={200: OpenApiTypes.OBJECT})
class ParentAnnouncementsView(ParentBase):
    def get(self, request):
        from apps.engagement.models import Announcement

        student_ids = [c.id for c in self.children()]
        qs = (
            Announcement.objects.filter(school=self.school, publish_at__lte=timezone.now())
            .filter(Q(expires_at__isnull=True) | Q(expires_at__gt=timezone.now()))
            .filter(
                Q(audience__in=["ALL", "PARENTS"])
                | Q(audience="ROUTE", route__student_assignments__student_id__in=student_ids, route__student_assignments__is_active=True)
            )
            .distinct()
            .order_by("-is_pinned", "-publish_at")[:50]
        )
        return Response(
            [
                {"id": str(a.id), "title": a.title, "body": a.body, "publish_at": a.publish_at, "is_pinned": a.is_pinned, "audience": a.audience}
                for a in qs
            ]
        )


# ---------------------------------------------------------------------------
# Billing (parent)
# ---------------------------------------------------------------------------
@_extend_schema(responses={200: OpenApiTypes.OBJECT})
class ParentInvoicesView(ParentBase):
    def get(self, request):
        from apps.billing.models import Invoice
        from apps.billing.serializers import InvoiceSerializer

        qs = (
            Invoice.objects.filter(student__in=self.children())
            .exclude(status="DRAFT")
            .select_related("student", "fee_plan")
            .prefetch_related("line_items", "allocations__payment__receipt")
            .order_by("-issue_date")
        )
        student_id = request.query_params.get("student")
        if student_id:
            qs = qs.filter(student_id=student_id)
        return Response(InvoiceSerializer(qs, many=True).data)


@_extend_schema(request=None, responses={200: OpenApiTypes.OBJECT})
class ParentInvoiceDetailView(ParentBase):
    def _invoice(self, invoice_id):
        from apps.billing.models import Invoice

        inv = Invoice.objects.filter(pk=invoice_id, student__in=self.children()).select_related("student", "fee_plan", "school").first()
        if inv is None:
            raise NotFound("Invoice not found.")
        return inv

    def get(self, request, invoice_id):
        from apps.billing.serializers import InvoiceSerializer

        return Response(InvoiceSerializer(self._invoice(invoice_id)).data)

    def post(self, request, invoice_id):
        """Initiate an online payment: creates a PENDING payment and returns the gateway order/checkout info."""
        from apps.billing import services as billing
        from apps.billing.serializers import PaymentSerializer

        inv = self._invoice(invoice_id)
        payment, order = billing.create_online_payment(
            school=self.school, student=inv.student, parent_profile=self.parent, invoice=inv, user=request.user
        )
        record_audit(action="billing.online_payment_initiated", request=request, target=payment, changes={"invoice": inv.invoice_number})
        return Response({"payment": PaymentSerializer(payment).data, "order": order}, status=status.HTTP_201_CREATED)


@_extend_schema(responses={200: OpenApiTypes.OBJECT})
class ParentPaymentsView(ParentBase):
    def get(self, request):
        from apps.billing.models import Payment
        from apps.billing.serializers import PaymentSerializer

        qs = (
            Payment.objects.filter(student__in=self.children())
            .select_related("student", "receipt")
            .prefetch_related("allocations__invoice")
            .order_by("-paid_at")
        )
        return Response(PaymentSerializer(qs, many=True).data)


@_extend_schema(request=OpenApiTypes.OBJECT, responses={200: OpenApiTypes.OBJECT})
class ParentVerifyPaymentView(ParentBase):
    def post(self, request):
        from apps.billing import services as billing
        from apps.billing.models import Payment
        from apps.billing.serializers import PaymentSerializer, VerifyPaymentSerializer

        ser = VerifyPaymentSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        pending = Payment.objects.filter(gateway_order_id=ser.validated_data["order_id"], student__in=self.children()).first()
        if pending is None:
            raise NotFound("Payment order not found.")
        payment = billing.verify_online_payment(payload=ser.validated_data, user=request.user, request=request)
        return Response(PaymentSerializer(payment).data)


@_extend_schema(responses={200: OpenApiTypes.OBJECT})
class ParentReceiptView(ParentBase):
    def get(self, request, receipt_id):
        from apps.billing.models import Receipt
        from apps.billing.serializers import ReceiptSerializer

        r = Receipt.objects.filter(pk=receipt_id, payment__student__in=self.children()).select_related("payment__student", "school").first()
        if r is None:
            raise NotFound("Receipt not found.")
        if request.query_params.get("print") in ("1", "true"):
            from django.shortcuts import render

            return render(request, "billing/receipt.html", {"receipt": r, "payment": r.payment, "school": r.school})
        return Response(ReceiptSerializer(r).data)


# ---------------------------------------------------------------------------
# Requests & complaints (parent)
# ---------------------------------------------------------------------------
@_extend_schema(request=OpenApiTypes.OBJECT, responses={200: OpenApiTypes.OBJECT})
class ParentAbsenceView(ParentBase):
    def get(self, request):
        from apps.engagement.models import AbsenceRequest
        from apps.engagement.serializers import AbsenceRequestSerializer

        qs = AbsenceRequest.objects.filter(student__in=self.children()).select_related("student", "requested_by")[:100]
        return Response(AbsenceRequestSerializer(qs, many=True).data)

    def post(self, request):
        from apps.engagement import services as eng
        from apps.engagement.serializers import AbsenceRequestSerializer

        ser = AbsenceRequestSerializer(data=request.data, context={"school": self.school})
        ser.is_valid(raise_exception=True)
        d = dict(ser.validated_data)
        student = self.child(d.pop("student").id)
        absence = eng.submit_absence(school=self.school, student=student, parent=self.parent, data=d, request=request)
        return Response(AbsenceRequestSerializer(absence).data, status=201)


@_extend_schema(request=None, responses={200: OpenApiTypes.OBJECT})
class ParentAbsenceCancelView(ParentBase):
    def post(self, request, absence_id):
        from apps.engagement import services as eng
        from apps.engagement.models import AbsenceRequest
        from apps.engagement.serializers import AbsenceRequestSerializer

        absence = AbsenceRequest.objects.filter(pk=absence_id, student__in=self.children()).first()
        if absence is None:
            raise NotFound()
        return Response(AbsenceRequestSerializer(eng.cancel_absence(absence=absence, request=request)).data)


@_extend_schema(request=OpenApiTypes.OBJECT, responses={200: OpenApiTypes.OBJECT})
class ParentPickupChangeView(ParentBase):
    def get(self, request):
        from apps.engagement.models import PickupChangeRequest
        from apps.engagement.serializers import PickupChangeRequestSerializer

        qs = PickupChangeRequest.objects.filter(student__in=self.children()).select_related(
            "student", "requested_route", "requested_pickup_stop", "requested_dropoff_stop", "decided_by"
        )[:100]
        return Response(PickupChangeRequestSerializer(qs, many=True).data)

    def post(self, request):
        from apps.engagement.models import PickupChangeRequest
        from apps.engagement.serializers import PickupChangeRequestSerializer
        from apps.notifications.services import notify_school_staff

        ser = PickupChangeRequestSerializer(data=request.data, context={"school": self.school})
        ser.is_valid(raise_exception=True)
        student = self.child(ser.validated_data["student"].id)
        cutoff = timezone.now() + timedelta(hours=self.school.pickup_change_cutoff_hours)
        if ser.validated_data["effective_date"] < cutoff.astimezone(zoneinfo.ZoneInfo(self.school.timezone)).date():
            raise serializers.ValidationError({"effective_date": f"Changes need at least {self.school.pickup_change_cutoff_hours} hours notice."})
        if PickupChangeRequest.objects.filter(student=student, status="PENDING").exists():
            raise serializers.ValidationError({"detail": "A pending request already exists for this child."})
        req = ser.save(school=self.school, requested_by=self.parent)
        record_audit(action="pickup_change.submitted", request=request, target=req)
        notify_school_staff(
            school=self.school,
            category="REQUEST_UPDATE",
            title=f"Pickup change request: {student.full_name}",
            body=f"{req.get_change_type_display()} from {req.effective_date:%d %b}: {req.details[:200]}",
            dedupe_key=f"pickupchange:{req.id}:new",
        )
        return Response(PickupChangeRequestSerializer(req).data, status=201)


@_extend_schema(request=None, responses={200: OpenApiTypes.OBJECT})
class ParentPickupChangeCancelView(ParentBase):
    def post(self, request, request_id):
        from apps.engagement.models import PickupChangeRequest
        from apps.engagement.serializers import PickupChangeRequestSerializer

        req = PickupChangeRequest.objects.filter(pk=request_id, student__in=self.children(), status="PENDING").first()
        if req is None:
            raise NotFound()
        req.status = PickupChangeRequest.Status.CANCELLED
        req.save(update_fields=["status"])
        return Response(PickupChangeRequestSerializer(req).data)


@_extend_schema(request=OpenApiTypes.OBJECT, responses={200: OpenApiTypes.OBJECT})
class ParentComplaintsView(ParentBase):
    def get(self, request):
        from apps.engagement.models import Complaint
        from apps.engagement.serializers import ComplaintSerializer

        qs = Complaint.objects.filter(school=self.school, raised_by=request.user).select_related("student").prefetch_related("comments__author")[:100]
        return Response(ComplaintSerializer(qs, many=True, context={"hide_internal": True}).data)

    def post(self, request):
        from apps.engagement import services as eng
        from apps.engagement.serializers import ComplaintSerializer

        ser = ComplaintSerializer(data=request.data, context={"school": self.school})
        ser.is_valid(raise_exception=True)
        data = dict(ser.validated_data)
        data.pop("assigned_to", None)
        data.pop("trip", None)
        if data.get("student") and data["student"].id not in [c.id for c in self.children()]:
            raise PermissionDenied("You can only raise complaints about your own children.")
        complaint = eng.submit_complaint(school=self.school, user=request.user, data=data, request=request)
        return Response(ComplaintSerializer(complaint, context={"hide_internal": True}).data, status=201)


@_extend_schema(request=OpenApiTypes.OBJECT, responses={200: OpenApiTypes.OBJECT})
class ParentComplaintCommentView(ParentBase):
    def post(self, request, complaint_id):
        from apps.engagement.models import Complaint, ComplaintComment
        from apps.engagement.serializers import ComplaintCommentSerializer
        from apps.notifications.services import notify_school_staff

        complaint = Complaint.objects.filter(pk=complaint_id, school=self.school, raised_by=request.user).first()
        if complaint is None:
            raise NotFound()
        body = (request.data.get("body") or "").strip()
        if not body:
            raise serializers.ValidationError({"body": "Comment cannot be empty."})
        comment = ComplaintComment.objects.create(school=self.school, complaint=complaint, author=request.user, body=body, is_internal=False)
        notify_school_staff(
            school=self.school,
            category="COMPLAINT",
            title=f"Reply on {complaint.ticket_number}",
            body=body[:300],
            dedupe_key=f"complaint_comment:{comment.id}",
        )
        return Response(ComplaintCommentSerializer(comment).data, status=201)
