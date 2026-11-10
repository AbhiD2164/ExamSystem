"""
exams/ai_grading_view.py
Compatibility wrapper for ml_grading_view.
"""
from .ml_grading_view import (
    MLGradeSubmissionView,
    MLGradeSubmissionView as AIGradeSubmissionView,
    MLBatchGradeView,
    MLGradePreviewView,
    MLModelInfoView,
)

__all__ = [
    "MLGradeSubmissionView",
    "AIGradeSubmissionView",
    "MLBatchGradeView",
    "MLGradePreviewView",
    "MLModelInfoView",
]
