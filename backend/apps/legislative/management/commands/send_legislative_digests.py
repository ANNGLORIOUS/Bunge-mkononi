"""
Generate and dispatch due legislative digests.
"""

from django.core.management.base import BaseCommand

from apps.legislative.services import dispatch_pending_outbound_messages, generate_due_digests


class Command(BaseCommand):
    help = "Generate due digest messages and dispatch queued outbound SMS messages."

    def add_arguments(self, parser):
        parser.add_argument(
            "--limit",
            type=int,
            default=50,
            help="Maximum number of outbound messages to attempt in one run.",
        )

    def handle(self, *args, **options):
        limit = int(options.get("limit") or 50)
        digests = generate_due_digests()
        dispatched = dispatch_pending_outbound_messages(limit=limit)

        self.stdout.write(self.style.SUCCESS(f"Queued {len(digests)} digest message(s)."))
        if dispatched:
            self.stdout.write(self.style.SUCCESS(f"Attempted to dispatch {len(dispatched)} queued message(s)."))
        else:
            self.stdout.write(self.style.WARNING("No queued outbound messages were ready to send."))
