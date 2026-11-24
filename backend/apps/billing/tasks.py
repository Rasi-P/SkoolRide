from __future__ import annotations

from celery import shared_task
from django.utils import timezone


@shared_task
def send_overdue_invoice_reminders() -> int:
    from apps.notifications.services import notify_student_guardians

    from .models import Invoice
    from .services import mark_overdue_invoices

    mark_overdue_invoices()
    today = timezone.localdate()
    sent = 0
    for inv in Invoice.objects.filter(status="OVERDUE").select_related("student", "school"):
        if inv.reminder_sent_at and (timezone.now() - inv.reminder_sent_at).days < 7:
            continue
        notify_student_guardians(
            student=inv.student,
            category="FEE_OVERDUE",
            title="Transport fee overdue",
            body=f"Invoice {inv.invoice_number} ({inv.currency} {inv.balance}) was due on {inv.due_date:%d %b %Y}. Please pay at the earliest.",
            dedupe_key=f"overdue:{inv.id}:{today.isocalendar()[1]}",
            data={"invoice_id": str(inv.id)},
        )
        inv.reminder_sent_at = timezone.now()
        inv.save(update_fields=["reminder_sent_at"])
        sent += 1
    return sent
