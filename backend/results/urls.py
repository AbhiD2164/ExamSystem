"""
results/urls.py
"""
from django.urls import path
from .views import StudentResultListView, StudentResultDetailView, ExaminerResultsView

urlpatterns = [
    path("my-results/", StudentResultListView.as_view(), name="student-results"),
    path("my-results/<int:exam_id>/", StudentResultDetailView.as_view(), name="student-result-detail"),
    path("exam/<int:exam_id>/", ExaminerResultsView.as_view(), name="examiner-results"),
]
