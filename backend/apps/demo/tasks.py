from __future__ import annotations

from celery import shared_task
from django.conf import settings


@shared_task
def simulator_tick() -> int:
    if not settings.DEMO_MODE:
        return 0
    from . import simulator
    from .models import DemoSimulation

    count = 0
    for sim in DemoSimulation.objects.filter(is_running=True):
        simulator.tick(sim)
        count += 1
    return count
