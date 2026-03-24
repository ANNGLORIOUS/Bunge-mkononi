"""
WSGI config for bunge_backend project.

It exposes the WSGI callable as a module-level variable named ``application``.
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "bunge_backend.settings")

from django.core.wsgi import get_wsgi_application

from .startup import bootstrap

application = get_wsgi_application()
bootstrap()
