"""
Legacy compatibility shim for the legislative API routes.

The live Django project includes ``apps.legislative.urls`` from
``bunge_backend/urls.py``. Keeping this module as a thin re-export avoids IDE
import errors from the old top-level ``backend/urls.py`` path.
"""

from apps.legislative.urls import urlpatterns

