"""
exams/models.py — Exam, Question, Choice, Enrollment, Submission, Answer models.
"""
from django.db import models
from django.conf import settings
from django.utils import timezone


class Exam(models.Model):
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"
    STATUS_CHOICES = [(DRAFT, "Draft"), (PUBLISHED, "Published"), (ARCHIVED, "Archived")]
    PRACTICE = "practice"
    PLACEMENT = "placement"
    INTERNAL = "internal"
    MEMBER_SELECTION = "member_selection"
    OTHER = "other"
    ASSESSMENT_TYPE_CHOICES = [
        (PRACTICE, "Practice"),
        (PLACEMENT, "Placement / entry-level jobs"),
        (INTERNAL, "Internal assessment"),
        (MEMBER_SELECTION, "Member selection"),
        (OTHER, "Other"),
    ]

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="created_exams",
    )
    community = models.ForeignKey(
        "users.Community",
        on_delete=models.CASCADE,
        related_name="exams",
        null=True,
        blank=True,
    )
    title = models.CharField(max_length=255)
    assessment_type = models.CharField(
        max_length=24, choices=ASSESSMENT_TYPE_CHOICES, default=PRACTICE
    )
    description = models.TextField(blank=True)
    instructions = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=DRAFT)
    
    # Institution / School / Department Level Organization
    institution_name = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="School or Institute conducting the exam (leave blank for universal access)"
    )
    department = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="Department or Faculty conducting the exam"
    )
    target_batch = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="Target academic cohort, section, or batch (e.g. 'Class 2026', 'Section A')"
    )

    # Access Control: Open to anyone or restricted to whitelisted emails
    is_public = models.BooleanField(
        default=False,
        help_text="Legacy compatibility only. Public access is disabled; candidates must be allowlisted."
    )
    allowed_emails = models.TextField(
        blank=True,
        help_text="Comma, space, or newline separated student emails allowed to take this exam."
    )

    start_datetime = models.DateTimeField()
    time_zone = models.CharField(max_length=64, default="UTC")
    duration_minutes = models.PositiveIntegerField()
    results_visible_from = models.DateTimeField(null=True, blank=True)
    students = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        through="Enrollment",
        related_name="enrolled_exams",
        blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-start_datetime"]

    def __str__(self):
        return self.title

    @property
    def end_datetime(self):
        from datetime import timedelta
        return self.start_datetime + timedelta(minutes=self.duration_minutes)

    def is_joinable(self):
        now = timezone.now()
        return self.start_datetime <= now <= self.end_datetime

    def time_remaining_for_student(self):
        now = timezone.now()
        remaining = self.end_datetime - now
        if remaining.total_seconds() <= 0:
            return 0
        return int(remaining.total_seconds() // 60)

    def results_are_visible(self):
        if not self.results_visible_from:
            return False
        return timezone.now() >= self.results_visible_from

    def get_allowed_email_list(self):
        """Parse allowed_emails text into a cleaned set of lowercase emails."""
        if not self.allowed_emails:
            return set()
        import re
        raw = re.split(r'[\r\n,\s]+', self.allowed_emails)
        return {e.strip().lower() for e in raw if e and "@" in e}

    def is_student_allowed(self, user):
        """
        A candidate must be authenticated, email-verified, and belong to the
        authorized community/group. If specific candidate emails are configured,
        they must also be present on that allowlist.
        """
        if not user or not user.is_authenticated:
            return False
        if getattr(user, "is_admin", False):
            return True
        if not user.email_verified:
            return False
        user_email = (user.email or "").strip().lower()
        if not user_email:
            return False

        # Community / Group level enforcement: Must be an approved active member
        if self.community_id:
            is_approved = self.community.memberships.filter(
                user=user,
                status="approved",
                is_active=True,
            ).exists()
            if not is_approved:
                return False

        # Candidate allowlist restriction (if specific emails were provided)
        allowed_list = self.get_allowed_email_list()
        if allowed_list:
            if user_email not in allowed_list:
                return False
        elif not self.community_id:
            return False

        return True


class Question(models.Model):
    SHORT_ANSWER = "short"
    LONG_ANSWER  = "long"
    MCQ_SINGLE   = "mcq_single"
    MCQ_MULTI    = "mcq_multi"
    TYPE_CHOICES = [
        (SHORT_ANSWER, "Short Answer"),
        (LONG_ANSWER, "Long Answer"),
        (MCQ_SINGLE, "MCQ – Single Correct"),
        (MCQ_MULTI, "MCQ – Multiple Correct")
    ]

    exam = models.ForeignKey(Exam, on_delete=models.CASCADE, related_name="questions")
    text = models.TextField()
    question_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default=MCQ_SINGLE)
    marks = models.PositiveIntegerField(default=1)
    order = models.PositiveIntegerField(default=0)
    is_required = models.BooleanField(default=True)

    # Model Answer & Notes
    expected_notes = models.TextField(
        blank=True,
        help_text="Examiner model answer / key concepts — used by ExMint ML auto-grader"
    )
    # Comprehensive Reference Context
    reference_context = models.TextField(
        blank=True,
        help_text="Comprehensive reference context, passage, or background documentation for long answers."
    )
    # Key Point Rubrics: list of { "point": "...", "weight": 1.0, "keywords": ["..."] }
    rubrics = models.JSONField(
        default=list,
        blank=True,
        help_text="List of structured key points / rubrics for comprehensive evaluation."
    )

    class Meta:
        ordering = ["order"]

    def __str__(self):
        return f"Q{self.order}: {self.text[:60]}"


class Choice(models.Model):
    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name="choices")
    text = models.CharField(max_length=512)
    is_correct = models.BooleanField(default=False)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order"]

    def __str__(self):
        return f"{self.text} ({'V' if self.is_correct else 'X'})"


class Enrollment(models.Model):
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="enrollments",
        limit_choices_to={"role": "user"}
    )
    exam = models.ForeignKey(Exam, on_delete=models.CASCADE, related_name="enrollments")
    enrolled_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ["student", "exam"]

    def __str__(self):
        return f"{self.student.full_name} -> {self.exam.title}"


class Submission(models.Model):
    ONGOING        = "ongoing"
    SUBMITTED      = "submitted"
    AUTO_SUBMITTED = "auto_submitted"
    DISQUALIFIED   = "disqualified"
    STATUS_CHOICES = [
        (ONGOING, "Ongoing"),
        (SUBMITTED, "Submitted"),
        (AUTO_SUBMITTED, "Auto-Submitted (Violations)"),
        (DISQUALIFIED, "Disqualified")
    ]

    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="submissions"
    )
    exam = models.ForeignKey(Exam, on_delete=models.CASCADE, related_name="submissions")
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default=ONGOING)
    started_at = models.DateTimeField(auto_now_add=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    violation_count = models.PositiveIntegerField(default=0)
    proctor_remark = models.TextField(blank=True)
    score = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    total_marks = models.PositiveIntegerField(null=True, blank=True)
    is_graded = models.BooleanField(default=False)

    class Meta:
        unique_together = ["student", "exam"]
        ordering = ["-started_at"]

    def __str__(self):
        return f"{self.student.full_name} | {self.exam.title} [{self.status}]"


class Answer(models.Model):
    submission = models.ForeignKey(Submission, on_delete=models.CASCADE, related_name="answers")
    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name="student_answers")
    text_answer = models.TextField(blank=True)
    selected_choices = models.JSONField(default=list, blank=True)
    marks_awarded = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    is_correct = models.BooleanField(null=True)
    
    # ExMint AI Evaluation Data
    ai_feedback = models.TextField(blank=True)
    rubric_breakdown = models.JSONField(default=list, blank=True)
    semantic_score = models.FloatField(null=True, blank=True)
    eval_method = models.CharField(max_length=30, default="manual")

    class Meta:
        unique_together = ["submission", "question"]

    def __str__(self):
        return f"Answer by {self.submission.student.full_name} to Q{self.question.order}"
