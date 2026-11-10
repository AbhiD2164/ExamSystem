"""
proctoring/views.py — Records violations; auto-submits on 3rd violation.
"""
from django.utils import timezone
from rest_framework import generics, status, permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from exams.models import Submission
from exams.access import manageable_exams
from users.permissions import IsStudent, IsAdminOrExaminer
from .models import ViolationEvent
from .serializers import ViolationEventSerializer

MAX_TAB_SWITCHES = 3
MIN_AWAY_SECONDS = 5


class ReportViolationView(APIView):
    """
    POST /api/proctoring/violations/
    Student's browser reports a violation detected by the camera/tab monitor.

    Four tab switches or one absence lasting over five seconds disqualifies the attempt.
    """
    permission_classes = [IsStudent]

    def post(self, request):
        submission_id = request.data.get("submission_id")
        violation_type = request.data.get("violation_type")

        if not submission_id or not violation_type:
            return Response(
                {"detail": "submission_id and violation_type are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        submission = generics.get_object_or_404(
            Submission,
            pk=submission_id,
            student=request.user,
            status=Submission.ONGOING,
        )
        if not submission.exam.is_student_allowed(request.user):
            return Response(
                {"detail": "You are not currently authorized for this assessment."},
                status=status.HTTP_403_FORBIDDEN,
            )

        allowed_types = {value for value, _ in ViolationEvent.TYPE_CHOICES}
        if violation_type not in allowed_types:
            return Response({"detail": "Unknown violation type."}, status=status.HTTP_400_BAD_REQUEST)

        away_seconds = request.data.get("away_seconds", 0)
        try:
            away_seconds = float(away_seconds)
        except (TypeError, ValueError):
            return Response({"detail": "away_seconds must be a number."}, status=status.HTTP_400_BAD_REQUEST)

        count = submission.violations.count() + 1
        tab_switch_count = submission.violations.filter(
            violation_type=ViolationEvent.TAB_SWITCH
        ).count() + (violation_type == ViolationEvent.TAB_SWITCH)
        disqualified = (
            tab_switch_count > MAX_TAB_SWITCHES
            or (violation_type == ViolationEvent.WINDOW_BLUR and away_seconds > MIN_AWAY_SECONDS)
        )
        if disqualified:
            severity = ViolationEvent.FINAL
            remark = (
                "Exam failed and auto-submitted because the candidate exceeded the proctoring limits."
            )
            ViolationEvent.objects.create(
                submission=submission,
                violation_type=violation_type,
                severity=severity,
                details=f"{request.data.get('details', '')} Away duration: {away_seconds:.1f}s.",
            )
            submission.violation_count = count
            submission.status = Submission.DISQUALIFIED
            submission.submitted_at = timezone.now()
            submission.proctor_remark = remark
            submission.score = 0
            submission.total_marks = sum(
                submission.exam.questions.values_list("marks", flat=True)
            )
            submission.is_graded = True
            submission.save(update_fields=[
                "violation_count", "status", "submitted_at", "proctor_remark",
                "score", "total_marks", "is_graded",
            ])

            return Response(
                {
                    "action": "auto_submitted",
                    "warning_number": count,
                    "message": remark,
                },
                status=status.HTTP_200_OK,
            )
        else:
            severity = ViolationEvent.WARNING
            ViolationEvent.objects.create(
                submission=submission,
                violation_type=violation_type,
                severity=severity,
                details=request.data.get("details", ""),
            )
            submission.violation_count = count
            submission.save(update_fields=["violation_count"])
            switches_left = max(0, MAX_TAB_SWITCHES - tab_switch_count)
            return Response(
                {
                    "action": "warning",
                    "warning_number": count,
                    "warnings_remaining": switches_left,
                    "message": (
                        f"{violation_type.replace('_', ' ').title()} recorded. "
                        f"{switches_left} tab switch(es) remain before the attempt is failed."
                    ),
                },
                status=status.HTTP_200_OK,
            )


class ViolationListView(generics.ListAPIView):
    """
    GET /api/proctoring/violations/?submission_id=<id>
    Examiner/Admin can view all violations for a submission.
    """
    serializer_class = ViolationEventSerializer
    permission_classes = [IsAdminOrExaminer]

    def get_queryset(self):
        qs = ViolationEvent.objects.filter(
            submission__exam__in=manageable_exams(self.request.user)
        )
        submission_id = self.request.query_params.get("submission_id")
        if submission_id:
            qs = qs.filter(submission_id=submission_id)
        return qs
