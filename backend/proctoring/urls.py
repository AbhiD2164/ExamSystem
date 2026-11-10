"""
proctoring/urls.py
"""
from django.urls import path
from .views import ReportViolationView, ViolationListView

urlpatterns = [
    path("violations/", ReportViolationView.as_view(), name="report-violation"),
    path("violations/list/", ViolationListView.as_view(), name="violation-list"),
]
