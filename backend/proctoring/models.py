"""
proctoring/models.py — Tracks proctor violations per submission.
"""
from django.db import models
from django.conf import settings
from exams.models import Submission


class ViolationEvent(models.Model):
    """
    Each detected violation (head movement, eye shift, tab switch, etc.)
    is logged here.     A fourth tab switch or an absence lasting more than five seconds
    disqualifies and auto-submits the attempt.
    """
    HEAD_MOVEMENT = "head_movement"
    EYE_MOVEMENT = "eye_movement"
    TAB_SWITCH = "tab_switch"
    WINDOW_BLUR = "window_blur"
    MULTIPLE_FACES = "multiple_faces"
    NO_FACE = "no_face"
    FILE_OPEN = "file_open"

    TYPE_CHOICES = [
        (HEAD_MOVEMENT, "Repeated Head Movement"),
        (EYE_MOVEMENT, "Repeated Eye Movement"),
        (TAB_SWITCH, "Tab Switch"),
        (WINDOW_BLUR, "Window / App Switch"),
        (MULTIPLE_FACES, "Multiple Faces Detected"),
        (NO_FACE, "No Face Detected"),
        (FILE_OPEN, "External File Opened"),
    ]

    WARNING = "warning"
    FINAL = "final"   # Third violation — triggers auto-submit

    SEVERITY_CHOICES = [
        (WARNING, "Warning"),
        (FINAL, "Final (Auto-Submit)"),
    ]

    submission = models.ForeignKey(Submission, on_delete=models.CASCADE, related_name="violations")
    violation_type = models.CharField(max_length=30, choices=TYPE_CHOICES)
    severity = models.CharField(max_length=10, choices=SEVERITY_CHOICES, default=WARNING)
    details = models.TextField(blank=True)
    occurred_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["occurred_at"]

    def __str__(self):
        return f"{self.submission} — {self.get_violation_type_display()} [{self.severity}]"
