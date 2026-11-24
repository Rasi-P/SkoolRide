from __future__ import annotations

import zoneinfo
from datetime import timedelta

from django.db.models import Avg, Count, Q, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone


def school_today(school):
    return timezone.now().astimezone(zoneinfo.ZoneInfo(school.timezone)).date()


def school_dashboard(school) -> dict:
    from apps.billing.models import Invoice
    from apps.engagement.models import Announcement, Complaint, PickupChangeRequest
    from apps.fleet.models import Vehicle
    from apps.people.models import StaffProfile, Student
    from apps.trips.models import Incident, Trip

    today = school_today(school)
    vehicles = Vehicle.objects.filter(school=school).prefetch_related("documents")
    trips_today = (
        Trip.objects.filter(school=school, scheduled_date=today).select_related("route", "vehicle", "driver").order_by("scheduled_start_time")
    )
    running = [t for t in trips_today if t.is_active]
    upcoming = [t for t in trips_today if t.status == "SCHEDULED"]
    expected = sum(t.expected_students for t in trips_today)
    boarded = sum(t.boarded_count for t in trips_today)
    open_invoices = Invoice.objects.filter(school=school, status__in=Invoice.OPEN_STATUSES)
    pending_fees = sum((i.balance for i in open_invoices), 0)
    overdue_count = open_invoices.filter(status="OVERDUE").count()
    doc_alerts = []
    for v in vehicles.exclude(status="INACTIVE"):
        for a in v.document_alerts:
            doc_alerts.append({"vehicle": v.registration_number, "vehicle_id": str(v.id), **a})
    for s in StaffProfile.objects.filter(school=school, staff_type="DRIVER", status="ACTIVE", licence_expiry__lte=today + timedelta(days=30)):
        doc_alerts.append(
            {
                "vehicle": s.full_name,
                "vehicle_id": None,
                "document": "Driving licence",
                "expires_on": s.licence_expiry,
                "level": "expired" if s.licence_expired else "expiring",
            }
        )
    # 14-day attendance trend
    since = today - timedelta(days=13)
    trend_rows = (
        Trip.objects.filter(school=school, scheduled_date__gte=since, scheduled_date__lte=today, status="COMPLETED")
        .values("scheduled_date")
        .annotate(expected=Sum("expected_students"), boarded=Sum("boarded_count"), absent=Sum("absent_count"))
        .order_by("scheduled_date")
    )
    trend = [
        {"date": r["scheduled_date"].isoformat(), "expected": r["expected"] or 0, "boarded": r["boarded"] or 0, "absent": r["absent"] or 0}
        for r in trend_rows
    ]
    from apps.trips.serializers import TripSerializer

    return {
        "date": today,
        "students_using_transport": Student.objects.filter(school=school, status="ACTIVE", transport_status="ACTIVE").count(),
        "students_total": Student.objects.filter(school=school, status="ACTIVE").count(),
        "vehicles_total": vehicles.exclude(status="INACTIVE").count(),
        "vehicles_available": vehicles.filter(status="AVAILABLE").count(),
        "vehicles_in_service": vehicles.filter(status="IN_SERVICE").count(),
        "vehicles_maintenance": vehicles.filter(status="MAINTENANCE").count(),
        "drivers": StaffProfile.objects.filter(school=school, staff_type="DRIVER").exclude(status="INACTIVE").count(),
        "attendants": StaffProfile.objects.filter(school=school, staff_type="ATTENDANT").exclude(status="INACTIVE").count(),
        "trips_running": len(running),
        "trips_upcoming": len(upcoming),
        "trips_completed_today": sum(1 for t in trips_today if t.status == "COMPLETED"),
        "trips_today": TripSerializer(trips_today, many=True).data,
        "boarded_vs_expected": {"boarded": boarded, "expected": expected},
        "pending_fees": str(pending_fees),
        "pending_invoices": open_invoices.count(),
        "overdue_invoices": overdue_count,
        "currency": school.currency,
        "document_alerts": sorted(doc_alerts, key=lambda a: str(a["expires_on"]))[:20],
        "open_complaints": Complaint.objects.filter(school=school, status__in=["OPEN", "IN_PROGRESS"]).count(),
        "open_incidents": Incident.objects.filter(school=school, status__in=["OPEN", "INVESTIGATING"]).count(),
        "pending_requests": PickupChangeRequest.objects.filter(school=school, status="PENDING").count(),
        "recent_complaints": [
            {"id": str(c.id), "ticket": c.ticket_number, "subject": c.subject, "status": c.status, "priority": c.priority, "created_at": c.created_at}
            for c in Complaint.objects.filter(school=school).order_by("-created_at")[:5]
        ],
        "recent_incidents": [
            {"id": str(i.id), "title": i.title, "severity": i.severity, "status": i.status, "occurred_at": i.occurred_at, "category": i.category}
            for i in Incident.objects.filter(school=school).order_by("-occurred_at")[:5]
        ],
        "recent_announcements": [
            {"id": str(a.id), "title": a.title, "publish_at": a.publish_at, "audience": a.audience}
            for a in Announcement.objects.filter(school=school).order_by("-publish_at")[:5]
        ],
        "attendance_trend": trend,
    }


def attendance_report(school, date_from, date_to, route_id=None, grade=None) -> dict:
    from apps.trips.models import BoardingEvent, Trip, TripStudent

    trips = Trip.objects.filter(school=school, scheduled_date__range=(date_from, date_to)).exclude(status="CANCELLED")
    if route_id:
        trips = trips.filter(route_id=route_id)
    ts = TripStudent.objects.filter(trip__in=trips).select_related("student", "trip__route")
    if grade:
        ts = ts.filter(student__grade=grade)
    totals = ts.aggregate(
        expected=Count("id"),
        boarded=Count("id", filter=Q(status__in=["BOARDED", "DROPPED"])),
        absent=Count("id", filter=Q(status="ABSENT")),
        no_show=Count("id", filter=Q(status="NO_SHOW")),
    )
    by_day = (
        ts.values("trip__scheduled_date", "trip__direction")
        .annotate(
            expected=Count("id"),
            boarded=Count("id", filter=Q(status__in=["BOARDED", "DROPPED"])),
            absent=Count("id", filter=Q(status__in=["ABSENT", "NO_SHOW"])),
        )
        .order_by("trip__scheduled_date")
    )
    by_route = (
        ts.values("trip__route__code", "trip__route__name")
        .annotate(
            expected=Count("id"),
            boarded=Count("id", filter=Q(status__in=["BOARDED", "DROPPED"])),
            absent=Count("id", filter=Q(status__in=["ABSENT", "NO_SHOW"])),
        )
        .order_by("trip__route__code")
    )
    frequent_absentees = (
        ts.filter(status__in=["ABSENT", "NO_SHOW"])
        .values("student__id", "student__first_name", "student__last_name", "student__admission_number", "student__grade")
        .annotate(count=Count("id"))
        .order_by("-count")[:10]
    )
    unboarded = (
        ts.filter(status__in=["NO_SHOW", "EXPECTED"], trip__status="COMPLETED")
        .values(
            "student__id",
            "student__first_name",
            "student__last_name",
            "student__admission_number",
            "trip__scheduled_date",
            "trip__route__code",
            "status",
        )
        .order_by("-trip__scheduled_date")[:100]
    )
    events_by_type = list(BoardingEvent.objects.filter(trip__in=trips).values("event_type").annotate(count=Count("id")))
    return {
        "totals": totals,
        "by_day": [
            {
                "date": r["trip__scheduled_date"].isoformat(),
                "direction": r["trip__direction"],
                "expected": r["expected"],
                "boarded": r["boarded"],
                "absent": r["absent"],
            }
            for r in by_day
        ],
        "by_route": [
            {"route": f"{r['trip__route__code']} {r['trip__route__name']}", "expected": r["expected"], "boarded": r["boarded"], "absent": r["absent"]}
            for r in by_route
        ],
        "frequent_absentees": [
            {
                "student_id": str(r["student__id"]),
                "name": f"{r['student__first_name']} {r['student__last_name']}".strip(),
                "admission_number": r["student__admission_number"],
                "grade": r["student__grade"],
                "count": r["count"],
            }
            for r in frequent_absentees
        ],
        "unboarded": [
            {
                "student_id": str(r["student__id"]),
                "name": f"{r['student__first_name']} {r['student__last_name']}".strip(),
                "admission_number": r["student__admission_number"],
                "date": r["trip__scheduled_date"].isoformat(),
                "route": r["trip__route__code"],
                "status": r["status"],
            }
            for r in unboarded
        ],
        "events_by_type": events_by_type,
    }


def trips_report(school, date_from, date_to) -> dict:
    from apps.trips.models import Trip

    trips = Trip.objects.filter(school=school, scheduled_date__range=(date_from, date_to))
    by_status = list(trips.values("status").annotate(count=Count("id")))
    by_day = list(
        trips.annotate(day=TruncDate("scheduled_date"))
        .values("day")
        .annotate(
            total=Count("id"),
            completed=Count("id", filter=Q(status="COMPLETED")),
            cancelled=Count("id", filter=Q(status="CANCELLED")),
            avg_delay=Avg("delay_minutes", filter=Q(status="COMPLETED")),
        )
        .order_by("day")
    )
    on_time = trips.filter(status="COMPLETED", delay_minutes__lte=5).count()
    completed = trips.filter(status="COMPLETED").count()
    by_route = list(
        trips.values("route__code", "route__name")
        .annotate(
            total=Count("id"),
            completed=Count("id", filter=Q(status="COMPLETED")),
            avg_delay=Avg("delay_minutes", filter=Q(status="COMPLETED")),
            students=Sum("boarded_count"),
        )
        .order_by("route__code")
    )
    return {
        "total": trips.count(),
        "completed": completed,
        "cancelled": trips.filter(status="CANCELLED").count(),
        "on_time_rate": round(on_time / completed * 100, 1) if completed else None,
        "avg_delay_minutes": round(trips.filter(status="COMPLETED").aggregate(a=Avg("delay_minutes"))["a"] or 0, 1),
        "by_status": by_status,
        "by_day": [
            {
                "date": r["day"].isoformat(),
                "total": r["total"],
                "completed": r["completed"],
                "cancelled": r["cancelled"],
                "avg_delay": round(r["avg_delay"] or 0, 1),
            }
            for r in by_day
        ],
        "by_route": [
            {
                "route": f"{r['route__code']} {r['route__name']}",
                "total": r["total"],
                "completed": r["completed"],
                "avg_delay": round(r["avg_delay"] or 0, 1),
                "students": r["students"] or 0,
            }
            for r in by_route
        ],
    }


def fleet_report(school) -> dict:
    from apps.fleet.models import Vehicle, VehicleMaintenance
    from apps.trips.models import Incident, Trip

    vehicles = Vehicle.objects.filter(school=school).prefetch_related("documents")
    since = timezone.localdate() - timedelta(days=30)
    rows = []
    for v in vehicles:
        trips = Trip.objects.filter(vehicle=v, scheduled_date__gte=since)
        rows.append(
            {
                "id": str(v.id),
                "registration": v.registration_number,
                "fleet_number": v.fleet_number,
                "status": v.status,
                "capacity": v.capacity,
                "trips_30d": trips.count(),
                "completed_30d": trips.filter(status="COMPLETED").count(),
                "students_30d": trips.aggregate(s=Sum("boarded_count"))["s"] or 0,
                "incidents_30d": Incident.objects.filter(vehicle=v, occurred_at__date__gte=since).count(),
                "maintenance_cost_30d": str(VehicleMaintenance.objects.filter(vehicle=v, performed_on__gte=since).aggregate(s=Sum("cost"))["s"] or 0),
                "document_alerts": len(v.document_alerts),
                "odometer_km": v.odometer_km,
            }
        )
    return {"vehicles": rows, "by_status": list(vehicles.values("status").annotate(count=Count("id")))}


def students_report(school) -> dict:
    from apps.people.models import Student
    from apps.routing.models import StudentTransportAssignment

    students = Student.objects.filter(school=school)
    by_grade = list(
        students.filter(status="ACTIVE")
        .values("grade")
        .annotate(total=Count("id"), transport=Count("id", filter=Q(transport_status="ACTIVE")))
        .order_by("grade")
    )
    by_route = list(
        StudentTransportAssignment.objects.filter(school=school, is_active=True)
        .values("route__code", "route__name", "route__vehicle__capacity")
        .annotate(count=Count("id"))
        .order_by("route__code")
    )
    by_stop = list(
        StudentTransportAssignment.objects.filter(school=school, is_active=True)
        .values("pickup_stop__name", "route__code")
        .annotate(count=Count("id"))
        .order_by("-count")[:20]
    )
    return {
        "by_status": list(students.values("status").annotate(count=Count("id"))),
        "by_grade": by_grade,
        "by_route": [
            {"route": f"{r['route__code']} {r['route__name']}", "count": r["count"], "capacity": r["route__vehicle__capacity"]} for r in by_route
        ],
        "by_stop": [{"stop": r["pickup_stop__name"], "route": r["route__code"], "count": r["count"]} for r in by_stop],
    }
