"""
core/urls.py — Root URL configuration.
DRF's default browsable-API login/logout views are NOT included.
All authentication is handled via JWT endpoints in users/urls.py.
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path("django-admin/", admin.site.urls),

    # Auth & user management (JWT — no DRF session login)
    path("api/auth/", include("users.urls")),

    # Exam management
    path("api/exams/", include("exams.urls")),

    # Proctoring (violations / warnings)
    path("api/proctoring/", include("proctoring.urls")),

    # Results
    path("api/results/", include("results.urls")),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
