from django.conf import settings
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Seed realistic demo data (3 schools, buses, routes, students, parents, trips, GPS, billing). DEMO_MODE only."

    def add_arguments(self, parser):
        parser.add_argument("--reset", action="store_true", help="Delete existing data before seeding a disposable demo database")
        parser.add_argument("--yes", action="store_true", help="Confirm deletion with --reset")

    def handle(self, *args, **options):
        if not settings.DEMO_MODE:
            raise CommandError("Refusing to seed: DEMO_MODE is off.")
        if options["reset"] and not options["yes"]:
            raise CommandError("Reset deletes all application data. Confirm explicitly with --reset --yes.")
        from apps.demo.seed import DEMO_PASSWORD, seed

        self.stdout.write("Seeding fictional demo data...")
        summary = seed(stdout=self.stdout, reset=options["reset"])
        for k, v in summary.items():
            self.stdout.write(f"  {k:>16}: {v}")
        self.stdout.write(self.style.SUCCESS("Demo data ready."))
        self.stdout.write(f"Demo accounts (password for all: {DEMO_PASSWORD}) - development only, insecure:")
        for line in (
            "  Super Admin        superadmin@schoolbuspro.demo",
            "  School Admin       admin@greenfield.demo   (Greenfield International School, active)",
            "  Transport Manager  transport@greenfield.demo",
            "  Driver             driver1@greenfield.demo (Bus 1, route R1)",
            "  Attendant          attendant1@greenfield.demo",
            "  Parent             parent@greenfield.demo",
            "  School Admin       admin@sunrise.demo      (Sunrise Public School, trial / onboarding)",
            "  School Admin       admin@riverside.demo    (Riverside Academy, SUSPENDED)",
        ):
            self.stdout.write(line)
