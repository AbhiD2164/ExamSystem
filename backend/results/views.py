"""
results/views.py
Students can only view results after the examiner-set results_visible_from datetime.
"""
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView

from exams.models import Submission, Exam
from exams.access import manageable_exams
from exams.serializers import SubmissionDetailSerializer
from users.permissions import IsStudent, IsAdminOrExaminer, CanCreateExam


class StudentResultListView(generics.ListAPIView):
    """
    GET /api/results/my-results/
    Returns student's graded results only where results_visible_from has passed.
    """
    serializer_class = SubmissionDetailSerializer
    permission_classes = [IsStudent]

    def get_queryset(self):
        now = timezone.now()
        submissions = Submission.objects.filter(
            student=self.request.user,
            is_graded=True,
            exam__results_visible_from__lte=now,
        ).select_related("exam", "student", "exam__community")
        return [
            submission for submission in submissions
            if submission.exam.is_student_allowed(self.request.user)
        ]


class StudentResultDetailView(generics.RetrieveAPIView):
    """
    GET /api/results/my-results/<exam_id>/
    Student views their result for a specific exam — blocked until results_visible_from.
    """
    serializer_class = SubmissionDetailSerializer
    permission_classes = [IsStudent]

    def retrieve(self, request, *args, **kwargs):
        exam_id = self.kwargs["exam_id"]
        exam = generics.get_object_or_404(Exam, pk=exam_id)
        if not exam.is_student_allowed(request.user):
            self.permission_denied(request, message="You are not authorized for this assessment.")

        now = timezone.now()
        if not exam.results_are_visible():
            visible_from = exam.results_visible_from
            return Response(
                {
                    "detail": "Results are not yet available.",
                    "results_visible_from": visible_from,
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        submission = generics.get_object_or_404(
            Submission,
            student=request.user,
            exam=exam,
            is_graded=True,
        )
        serializer = self.get_serializer(submission)
        return Response(serializer.data)


class ExaminerResultsView(generics.ListAPIView):
    """
    GET /api/results/exam/<exam_id>/
    Examiner views all graded submissions for their exam.
    """
    serializer_class = SubmissionDetailSerializer
    permission_classes = [CanCreateExam]

    def get_queryset(self):
        return Submission.objects.filter(
            exam__in=manageable_exams(self.request.user),
            exam_id=self.kwargs["exam_id"],
        ).select_related("student", "exam")
