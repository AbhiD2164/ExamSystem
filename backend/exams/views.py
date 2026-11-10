"""
exams/views.py
ExMint Production-grade exam management views for:
- Admin
- Examiner
- Student

Features:
- Secure role-based access
- Candidate email whitelisting & open-to-all access control
- Real-time autosave
- In-house ML grading integration
- Comprehensive rubrics and reference context
"""

from django.utils import timezone
from django.shortcuts import get_object_or_404
from django.db.models import Prefetch

from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response

from .models import (
    Exam,
    Question,
    Submission,
    Answer,
)
from .access import manageable_exams

from .serializers import (
    ExamSerializer,
    ExamStudentSerializer,
    ExamListStudentSerializer,
    QuestionSerializer,
    SubmissionCreateSerializer,
    SubmissionDetailSerializer,
    StudentSubmissionSerializer,
    GradeSubmissionSerializer,
)

from users.permissions import (
    IsStudent,
    CanCreateExam,
)


# =============================================================================
# Utility Mixins
# =============================================================================

class ExaminerExamMixin:
    """Shared helper for examiner/admin exam access."""
    def get_exam_queryset(self):
        return manageable_exams(self.request.user)


# =============================================================================
# Examiner/Admin Exam Management
# =============================================================================

class ExamListCreateView(ExaminerExamMixin, generics.ListCreateAPIView):
    """
    GET  /api/exams/
    POST /api/exams/
    """
    serializer_class = ExamSerializer
    permission_classes = [CanCreateExam]

    def get_queryset(self):
        return (
            self.get_exam_queryset()
            .select_related("created_by")
            .prefetch_related("questions")
            .order_by("-created_at")
        )

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class ExamDetailView(ExaminerExamMixin, generics.RetrieveUpdateDestroyAPIView):
    """GET/PATCH/DELETE /api/exams/<id>/"""
    serializer_class = ExamSerializer
    permission_classes = [CanCreateExam]

    def get_queryset(self):
        return self.get_exam_queryset()

    def perform_update(self, serializer):
        serializer.save()


# =============================================================================
# Question Management
# =============================================================================

class QuestionListCreateView(ExaminerExamMixin, generics.ListCreateAPIView):
    """GET/POST /api/exams/<exam_id>/questions/"""
    serializer_class = QuestionSerializer
    permission_classes = [CanCreateExam]

    def get_exam(self):
        return get_object_or_404(self.get_exam_queryset(), pk=self.kwargs["exam_id"])

    def get_queryset(self):
        return self.get_exam().questions.all().prefetch_related("choices")

    def perform_create(self, serializer):
        serializer.save(exam=self.get_exam())


class QuestionDetailView(ExaminerExamMixin, generics.RetrieveUpdateDestroyAPIView):
    """GET/PATCH/DELETE /api/exams/<exam_id>/questions/<id>/"""
    serializer_class = QuestionSerializer
    permission_classes = [CanCreateExam]

    def get_queryset(self):
        exam = get_object_or_404(self.get_exam_queryset(), pk=self.kwargs["exam_id"])
        return exam.questions.all()


# =============================================================================
# Student Exam Views (Access-Controlled)
# =============================================================================

class StudentExamListView(generics.ListAPIView):
    """
    GET /api/exams/my-exams/
    Returns only published exams for which the account's email is allowlisted and
    the account has approved membership in the owning community.
    """
    serializer_class = ExamListStudentSerializer
    permission_classes = [IsStudent]

    def get_queryset(self):
        user = self.request.user
        base_qs = Exam.objects.filter(status=Exam.PUBLISHED).select_related("created_by").prefetch_related(
            Prefetch(
                "submissions",
                queryset=Submission.objects.filter(student=user),
                to_attr="current_user_submissions",
            )
        )

        institution = self.request.query_params.get("institution")
        department = self.request.query_params.get("department")
        if institution:
            base_qs = base_qs.filter(institution_name__icontains=institution)
        if department:
            base_qs = base_qs.filter(department__icontains=department)

        allowed_exams = []
        for ex in base_qs:
            if ex.is_student_allowed(user):
                allowed_exams.append(ex.id)

        return base_qs.filter(id__in=allowed_exams).order_by("start_datetime")


class StudentExamDetailView(generics.RetrieveAPIView):
    """
    GET /api/exams/my-exams/<id>/
    Returns exam structure for student if authorized and time is valid.
    """
    serializer_class = ExamStudentSerializer
    permission_classes = [IsStudent]

    def get_object(self):
        exam = get_object_or_404(Exam, pk=self.kwargs["pk"], status=Exam.PUBLISHED)
        
        # Access control check
        if not exam.is_student_allowed(self.request.user):
            self.permission_denied(
                self.request,
                message="You are not authorized for this exam. Contact the examiner to whitelist your email."
            )
        return exam

    def retrieve(self, request, *args, **kwargs):
        exam = self.get_object()
        now = timezone.now()

        if now < exam.start_datetime:
            return Response(
                {
                    "detail": "Exam has not started yet.",
                    "start_datetime": exam.start_datetime,
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        if now > exam.end_datetime:
            return Response(
                {
                    "detail": "Exam has already ended.",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = self.get_serializer(exam)
        return Response(serializer.data)


# =============================================================================
# Student Submission
# =============================================================================

class SubmissionCreateView(generics.CreateAPIView):
    """POST /api/exams/submit/"""
    serializer_class = SubmissionCreateSerializer
    permission_classes = [IsStudent]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        submission = serializer.save()
        from .ml_grading_view import grade_submission
        grade_submission(submission)
        return Response(
            StudentSubmissionSerializer(submission).data,
            status=status.HTTP_201_CREATED,
        )


class StudentSubmissionStatusView(generics.RetrieveAPIView):
    """GET /api/exams/my-exams/<exam_id>/submission/"""
    serializer_class = StudentSubmissionSerializer
    permission_classes = [IsStudent]

    def get_object(self):
        submission = get_object_or_404(
            Submission,
            student=self.request.user,
            exam_id=self.kwargs["exam_id"],
        )
        if not submission.exam.is_student_allowed(self.request.user):
            self.permission_denied(
                self.request,
                message="You are not currently authorized for this assessment.",
            )
        return submission


# =============================================================================
# Examiner Submission Management
# =============================================================================

class ExamSubmissionsView(ExaminerExamMixin, generics.ListAPIView):
    """GET /api/exams/<exam_id>/submissions/"""
    serializer_class = SubmissionDetailSerializer
    permission_classes = [CanCreateExam]

    def get_queryset(self):
        exam = get_object_or_404(self.get_exam_queryset(), pk=self.kwargs["exam_id"])
        return (
            Submission.objects
            .filter(exam=exam)
            .select_related("student", "exam")
            .prefetch_related("answers", "answers__question")
            .order_by("-submitted_at")
        )


class GradeSubmissionView(ExaminerExamMixin, generics.UpdateAPIView):
    """PATCH /api/exams/submissions/<id>/grade/"""
    serializer_class = GradeSubmissionSerializer
    permission_classes = [CanCreateExam]

    def get_queryset(self):
        return Submission.objects.filter(exam__in=self.get_exam_queryset())
    http_method_names = ["patch"]


# =============================================================================
# Autosave Answers
# =============================================================================

class SaveAnswerView(APIView):
    """
    POST /api/exams/save-answer/
    Autosaves student answers in real-time.
    """
    permission_classes = [IsStudent]

    def post(self, request):
        exam_id = request.data.get("exam_id")
        question_id = request.data.get("question_id")
        text_answer = request.data.get("text_answer", "")
        selected_choices = request.data.get("selected_choices", [])

        exam = get_object_or_404(Exam, pk=exam_id, status=Exam.PUBLISHED)

        if not exam.is_student_allowed(request.user):
            return Response(
                {"detail": "You are not authorized for this exam."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if not exam.is_joinable():
            return Response(
                {"detail": "Exam is not currently active."},
                status=status.HTTP_403_FORBIDDEN,
            )

        question = get_object_or_404(Question, pk=question_id, exam=exam)
        if not isinstance(selected_choices, list) or any(
            not isinstance(choice_id, int) or isinstance(choice_id, bool)
            for choice_id in selected_choices
        ):
            return Response({"detail": "selected_choices must contain choice IDs."}, status=status.HTTP_400_BAD_REQUEST)
        valid_choice_ids = set(question.choices.values_list("id", flat=True))
        if not set(selected_choices).issubset(valid_choice_ids):
            return Response({"detail": "A selected choice does not belong to this question."}, status=status.HTTP_400_BAD_REQUEST)
        if question.question_type == Question.MCQ_SINGLE and len(selected_choices) > 1:
            return Response({"detail": "A single-answer question accepts only one choice."}, status=status.HTTP_400_BAD_REQUEST)
        if question.question_type not in (Question.MCQ_SINGLE, Question.MCQ_MULTI) and selected_choices:
            return Response({"detail": "Text questions cannot contain selected choices."}, status=status.HTTP_400_BAD_REQUEST)

        submission, _ = Submission.objects.get_or_create(
            student=request.user,
            exam=exam,
            defaults={"status": Submission.ONGOING},
        )

        if submission.status != Submission.ONGOING:
            return Response(
                {"detail": "Exam has already been submitted."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        Answer.objects.update_or_create(
            submission=submission,
            question=question,
            defaults={
                "text_answer": text_answer,
                "selected_choices": selected_choices,
            },
        )

        return Response(
            {"detail": "Answer autosaved successfully.", "timestamp": timezone.now()},
            status=status.HTTP_200_OK,
        )