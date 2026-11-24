from django.conf import settings
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Delete ALL application data. Restricted to DEMO_MODE."

    def add_arguments(self, parser):
        parser.add_argument("--yes", action="store_true", help="Skip confirmation prompt")

    def handle(self, *args, **options):
        if not settings.DEMO_MODE:
            raise CommandError("Refusing to reset: DEMO_MODE is off.")
        if not options["yes"]:
            answer = input("This deletes every school, user and record. Type 'reset' to continue: ")
            if answer.strip().lower() != "reset":
                self.stdout.write("Aborted.")
                return
        from django.db import transaction

        from apps.demo.seed import wipe

        with transaction.atomic():
            wipe()
        self.stdout.write(self.style.SUCCESS("All data removed. Run `seed_demo_data` to reseed."))
