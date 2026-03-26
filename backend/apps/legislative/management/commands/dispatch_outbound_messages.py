"""
Dispatch queued outbound legislative SMS messages.
"""

from django.core.management.base import BaseCommand

from apps.legislative.services import dispatch_pending_outbound_messages


class Command(BaseCommand):
    help = "Dispatch queued outbound legislative SMS messages."

    def add_arguments(self, parser):
        parser.add_argument(
            "--limit",
            type=int,
            default=50,
            help="Maximum number of queued messages to attempt in one run.",
        )

    def handle(self, *args, **options):
        limit = int(options.get("limit") or 50)
        dispatched = dispatch_pending_outbound_messages(limit=limit)

        if not dispatched:
            self.stdout.write(self.style.WARNING("No queued outbound messages were ready to send."))
            return

        self.stdout.write(self.style.SUCCESS(f"Attempted to dispatch {len(dispatched)} outbound message(s)."))
