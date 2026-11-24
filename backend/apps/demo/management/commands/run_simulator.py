"""Development-only loop that advances every running GPS simulation (use when Celery beat is not running)."""

import time

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Tick running demo GPS simulations every N seconds (DEMO_MODE only)."

    def add_arguments(self, parser):
        parser.add_argument("--interval", type=float, default=5.0)
        parser.add_argument("--once", action="store_true")

    def handle(self, *args, **options):
        if not settings.DEMO_MODE:
            raise CommandError("DEMO_MODE is off.")
        from apps.demo import simulator
        from apps.demo.models import DemoSimulation

        self.stdout.write(self.style.WARNING("SIMULATED GPS feed running - development demo only. Ctrl+C to stop."))
        while True:
            sims = list(DemoSimulation.objects.filter(is_running=True).select_related("trip__route"))
            for sim in sims:
                result = simulator.tick(sim)
                if result:
                    self.stdout.write(f"{sim.trip.route.code}: {result}")
            if options["once"]:
                return
            time.sleep(options["interval"])
