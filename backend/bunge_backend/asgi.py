"""
ASGI config for bunge_backend project.

It exposes the ASGI callable as a module-level variable named ``application``.
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "bunge_backend.settings")

from django.core.asgi import get_asgi_application

from .startup import bootstrap

application = get_asgi_application()
bootstrap()
