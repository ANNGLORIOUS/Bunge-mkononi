from django.contrib import admin
from django.shortcuts import redirect
from django.urls import include, path


def root_redirect(request):
    return redirect("/api/health/")

urlpatterns = [
    path("", root_redirect),
    path("admin/", admin.site.urls),
    path("api/", include("apps.legislative.urls")),
]
