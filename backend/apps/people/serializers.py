from __future__ import annotations

from rest_framework import serializers

from apps.core.serializers import TenantPrimaryKeyRelatedField

from .models import GuardianStudent, ParentProfile, StaffAttendance, StaffDocument, StaffLeave, StaffProfile, Student


class StaffDocumentSerializer(serializers.ModelSerializer):
    is_expired = serializers.BooleanField(read_only=True)

    class Meta:
        model = StaffDocument
        fields = ("id", "staff", "doc_type", "title", "number", "issued_on", "expires_on", "file", "notes", "is_expired", "created_at")
        read_only_fields = ("staff",)


class StaffLeaveSerializer(serializers.ModelSerializer):
    staff_name = serializers.CharField(source="staff.full_name", read_only=True)
    staff = TenantPrimaryKeyRelatedField(queryset=StaffProfile.objects.all())

    class Meta:
        model = StaffLeave
        fields = ("id", "staff", "staff_name", "leave_type", "start_date", "end_date", "reason", "status", "decided_by", "created_at")
        read_only_fields = ("status", "decided_by")

    def validate(self, attrs):
        if attrs["end_date"] < attrs["start_date"]:
            raise serializers.ValidationError({"end_date": "End date must be on or after start date."})
        return attrs


class StaffAttendanceSerializer(serializers.ModelSerializer):
    staff_name = serializers.CharField(source="staff.full_name", read_only=True)
    staff = TenantPrimaryKeyRelatedField(queryset=StaffProfile.objects.all())

    class Meta:
        model = StaffAttendance
        fields = ("id", "staff", "staff_name", "date", "status", "note")
        validators = []  # (staff, date) is upserted by the view


class StaffProfileSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    user_email = serializers.EmailField(source="membership.user.email", read_only=True, default=None)
    has_account = serializers.SerializerMethodField()
    account_active = serializers.SerializerMethodField()
    licence_expired = serializers.BooleanField(read_only=True)
    documents = StaffDocumentSerializer(many=True, read_only=True)
    current_vehicle = serializers.SerializerMethodField()
    expiring_documents = serializers.SerializerMethodField()

    class Meta:
        model = StaffProfile
        fields = (
            "id",
            "staff_type",
            "employee_id",
            "first_name",
            "last_name",
            "full_name",
            "email",
            "phone",
            "date_of_birth",
            "gender",
            "photo",
            "address",
            "emergency_contact_name",
            "emergency_contact_phone",
            "joining_date",
            "status",
            "licence_number",
            "licence_class",
            "licence_expiry",
            "licence_expired",
            "notes",
            "user_email",
            "has_account",
            "account_active",
            "documents",
            "current_vehicle",
            "expiring_documents",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("documents",)

    def get_has_account(self, obj):
        return obj.membership_id is not None

    def get_account_active(self, obj):
        return bool(obj.membership_id and obj.membership.is_active and obj.membership.user.is_active)

    def get_current_vehicle(self, obj):
        assignment = next((a for a in obj.vehicle_assignments.all() if a.is_active), None) if hasattr(obj, "vehicle_assignments") else None
        if assignment is None:
            return None
        return {"id": str(assignment.vehicle_id), "registration_number": assignment.vehicle.registration_number, "role": assignment.role}

    def get_expiring_documents(self, obj):
        from datetime import timedelta

        from django.utils import timezone

        soon = timezone.localdate() + timedelta(days=30)
        docs = [d for d in obj.documents.all() if d.expires_on and d.expires_on <= soon]
        out = [{"title": d.title, "expires_on": d.expires_on, "expired": d.is_expired} for d in docs]
        if obj.licence_expiry and obj.licence_expiry <= soon:
            out.append({"title": "Driving licence", "expires_on": obj.licence_expiry, "expired": obj.licence_expired})
        return out

    def validate_employee_id(self, value):
        school = self.context["school"]
        qs = StaffProfile.objects.filter(school=school, employee_id=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Employee ID already exists in this school.")
        return value


class StaffInviteSerializer(serializers.Serializer):
    email = serializers.EmailField(required=False)


class GuardianLinkSerializer(serializers.ModelSerializer):
    parent_name = serializers.CharField(source="parent.full_name", read_only=True)
    parent_phone = serializers.CharField(source="parent.phone", read_only=True)
    parent_email = serializers.CharField(source="parent.email", read_only=True)
    parent_status = serializers.CharField(source="parent.status", read_only=True)
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    student_admission_number = serializers.CharField(source="student.admission_number", read_only=True)
    student_class = serializers.CharField(source="student.class_label", read_only=True)
    parent = TenantPrimaryKeyRelatedField(queryset=ParentProfile.objects.all())
    student = TenantPrimaryKeyRelatedField(queryset=Student.objects.all())

    class Meta:
        model = GuardianStudent
        fields = (
            "id",
            "parent",
            "parent_name",
            "parent_phone",
            "parent_email",
            "parent_status",
            "student",
            "student_name",
            "student_admission_number",
            "student_class",
            "relationship",
            "is_primary",
            "can_pickup",
            "receives_notifications",
            "created_at",
        )


class StudentTransportSummarySerializer(serializers.Serializer):
    """Compact transport assignment summary embedded in student payloads."""

    id = serializers.UUIDField()
    route_id = serializers.UUIDField(source="route.id")
    route_name = serializers.CharField(source="route.name")
    route_code = serializers.CharField(source="route.code")
    pickup_stop_id = serializers.UUIDField(source="pickup_stop.id", default=None)
    pickup_stop_name = serializers.CharField(source="pickup_stop.name", default=None)
    dropoff_stop_id = serializers.UUIDField(source="dropoff_stop.id", default=None)
    dropoff_stop_name = serializers.CharField(source="dropoff_stop.name", default=None)
    vehicle_registration = serializers.CharField(source="route.vehicle.registration_number", default=None)
    start_date = serializers.DateField()
    end_date = serializers.DateField(allow_null=True)
    is_active = serializers.BooleanField()


class StudentSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    class_label = serializers.CharField(read_only=True)
    guardians = GuardianLinkSerializer(source="guardian_links", many=True, read_only=True)
    transport = serializers.SerializerMethodField()
    fee_plan = serializers.SerializerMethodField()

    class Meta:
        model = Student
        fields = (
            "id",
            "admission_number",
            "first_name",
            "last_name",
            "full_name",
            "grade",
            "section",
            "class_label",
            "date_of_birth",
            "gender",
            "photo",
            "blood_group",
            "medical_notes",
            "pickup_address",
            "emergency_contact_name",
            "emergency_contact_phone",
            "status",
            "transport_status",
            "status_changed_at",
            "status_reason",
            "notes",
            "guardians",
            "transport",
            "fee_plan",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("status", "transport_status", "status_changed_at", "status_reason")

    def get_transport(self, obj):
        active = next((a for a in obj.transport_assignments.all() if a.is_active), None)
        return StudentTransportSummarySerializer(active).data if active else None

    def get_fee_plan(self, obj):
        fa = next((f for f in obj.fee_assignments.all() if f.is_active), None)
        return {"id": str(fa.fee_plan_id), "name": fa.fee_plan.name, "amount": str(fa.fee_plan.amount)} if fa else None

    def validate_admission_number(self, value):
        qs = Student.objects.filter(school=self.context["school"], admission_number=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Admission number already exists in this school.")
        return value


class StudentStatusChangeSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True)


class StudentImportRowSerializer(serializers.Serializer):
    admission_number = serializers.CharField(max_length=32)
    first_name = serializers.CharField(max_length=80)
    last_name = serializers.CharField(max_length=80, required=False, allow_blank=True, default="")
    grade = serializers.CharField(max_length=16)
    section = serializers.CharField(max_length=16, required=False, allow_blank=True, default="")
    gender = serializers.CharField(max_length=16, required=False, allow_blank=True, default="")
    date_of_birth = serializers.DateField(required=False, allow_null=True, default=None)
    pickup_address = serializers.CharField(required=False, allow_blank=True, default="")
    parent_first_name = serializers.CharField(max_length=80, required=False, allow_blank=True, default="")
    parent_last_name = serializers.CharField(max_length=80, required=False, allow_blank=True, default="")
    parent_email = serializers.EmailField(required=False, allow_blank=True, default="")
    parent_phone = serializers.CharField(max_length=32, required=False, allow_blank=True, default="")
    parent_relationship = serializers.CharField(max_length=12, required=False, allow_blank=True, default="GUARDIAN")


class ParentProfileSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    has_account = serializers.SerializerMethodField()
    account_active = serializers.SerializerMethodField()
    last_login = serializers.DateTimeField(source="membership.user.last_login", read_only=True, default=None)
    children = serializers.SerializerMethodField()
    fee_summary = serializers.SerializerMethodField()

    class Meta:
        model = ParentProfile
        fields = (
            "id",
            "first_name",
            "last_name",
            "full_name",
            "email",
            "phone",
            "alt_phone",
            "address",
            "status",
            "phone_verified",
            "email_verified",
            "preferred_language",
            "notes",
            "has_account",
            "account_active",
            "last_login",
            "children",
            "fee_summary",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("status",)

    def get_has_account(self, obj):
        return obj.membership_id is not None

    def get_account_active(self, obj):
        return bool(obj.membership_id and obj.membership.is_active and obj.membership.user.is_active)

    def get_children(self, obj):
        return [
            {
                "link_id": str(gl.id),
                "student_id": str(gl.student_id),
                "name": gl.student.full_name,
                "admission_number": gl.student.admission_number,
                "class_label": gl.student.class_label,
                "relationship": gl.relationship,
                "is_primary": gl.is_primary,
                "transport_status": gl.student.transport_status,
            }
            for gl in obj.guardian_links.all()
        ]

    def get_fee_summary(self, obj):
        from apps.billing.models import Invoice

        student_ids = [gl.student_id for gl in obj.guardian_links.all()]
        qs = Invoice.objects.filter(student_id__in=student_ids)
        outstanding = sum((inv.balance for inv in qs if inv.status in ("ISSUED", "PARTIALLY_PAID", "OVERDUE")), 0)
        return {"outstanding": str(outstanding), "invoice_count": qs.count()}

    def validate_email(self, value):
        qs = ParentProfile.objects.filter(school=self.context["school"], email=value.lower())
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A parent with this email already exists in this school.")
        return value.lower()
