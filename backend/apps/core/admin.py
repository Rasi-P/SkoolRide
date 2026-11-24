from django.contrib import admin

from .models import AuditLog


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ("created_at", "action", "actor_email", "target_type", "target_id", "school")
    list_filter = ("action", "target_type")
    search_fields = ("actor_email", "target_id", "target_repr")
    readonly_fields = [f.name for f in AuditLog._meta.fields]
