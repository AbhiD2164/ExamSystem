"""
exams/urls.py
"""
from django.urls import path
from .ml_grading_view import (
    MLGradeSubmissionView,
    MLBatchGradeView,
    MLGradePreviewView,
    MLModelInfoView,
    MLModelTrainView,
)
from .views import (
    ExamListCreateView,
    ExamDetailView,
    QuestionListCreateView,
    QuestionDetailView,
    StudentExamListView,
    StudentExamDetailView,
    SubmissionCreateView,
    StudentSubmissionStatusView,
    ExamSubmissionsView,
    GradeSubmissionView,
    SaveAnswerView,
)

urlpatterns = [
    # Examiner / Admin exam management
    path("", ExamListCreateView.as_view(), name="exam-list-create"),
    path("<int:pk>/", ExamDetailView.as_view(), name="exam-detail"),
    path("<int:exam_id>/questions/", QuestionListCreateView.as_view(), name="question-list-create"),
    path("<int:exam_id>/questions/<int:pk>/", QuestionDetailView.as_view(), name="question-detail"),
    path("<int:exam_id>/submissions/", ExamSubmissionsView.as_view(), name="exam-submissions"),
    path("submissions/<int:pk>/grade/", GradeSubmissionView.as_view(), name="grade-submission"),

    # ExMint In-House ML Auto-Grading & Training Diagnostics
    path("submissions/<int:pk>/ai-grade/", MLGradeSubmissionView.as_view(), name="ml-grade-submission"),
    path("<int:exam_id>/batch-ml-grade/", MLBatchGradeView.as_view(), name="ml-batch-grade"),
    path("ml-grade/preview/", MLGradePreviewView.as_view(), name="ml-grade-preview"),
    path("ml-model/info/", MLModelInfoView.as_view(), name="ml-model-info"),
    path("ml-model/train/", MLModelTrainView.as_view(), name="ml-model-train"),

    # Student exam actions
    path("my-exams/", StudentExamListView.as_view(), name="student-exam-list"),
    path("my-exams/<int:pk>/", StudentExamDetailView.as_view(), name="student-exam-detail"),
    path("my-exams/<int:exam_id>/submission/", StudentSubmissionStatusView.as_view(), name="student-submission-status"),
    path("submit/", SubmissionCreateView.as_view(), name="submission-create"),
    path("save-answer/", SaveAnswerView.as_view(), name="save-answer"),
]
