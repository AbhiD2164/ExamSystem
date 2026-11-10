from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from exams.models import Exam, Question, Submission
from users.models import User


class ProctoringThresholdTests(APITestCase):
    def create_ongoing_submission(self, suffix):
        user = User.objects.create_user(
            email=f"candidate{suffix}@example.com",
            password="Agile!Cobalt_River_8472",
            full_name=f"Candidate {suffix}",
            role=User.USER,
            email_verified=True,
        )
        exam = Exam.objects.create(
            created_by=user,
            title=f"Exam {suffix}",
            is_public=True,
            allowed_emails=user.email,
            status=Exam.PUBLISHED,
            start_datetime=timezone.now(),
            duration_minutes=60,
        )
        Question.objects.create(exam=exam, text="Question", question_type=Question.SHORT_ANSWER, marks=10)
        submission = Submission.objects.create(student=user, exam=exam)
        return user, submission

    def report(self, user, submission, violation_type, **extra):
        self.client.force_authenticate(user)
        return self.client.post(reverse("report-violation"), {
            "submission_id": submission.pk,
            "violation_type": violation_type,
            **extra,
        }, format="json")

    def test_fourth_tab_switch_fails_and_auto_submits_with_zero_score(self):
        user, submission = self.create_ongoing_submission(1)
        for _ in range(3):
            response = self.report(user, submission, "tab_switch")
            self.assertEqual(response.data["action"], "warning")

        response = self.report(user, submission, "tab_switch")
        submission.refresh_from_db()
        self.assertEqual(response.data["action"], "auto_submitted")
        self.assertEqual(submission.status, Submission.DISQUALIFIED)
        self.assertEqual(submission.score, 0)
        self.assertEqual(submission.total_marks, 10)
        self.assertTrue(submission.is_graded)

    def test_absence_longer_than_five_seconds_fails_immediately(self):
        user, submission = self.create_ongoing_submission(2)
        response = self.report(user, submission, "window_blur", away_seconds=5.1)
        submission.refresh_from_db()

        self.assertEqual(response.data["action"], "auto_submitted")
        self.assertEqual(submission.status, Submission.DISQUALIFIED)
        self.assertEqual(submission.score, 0)

    def test_camera_permission_is_not_a_violation_type(self):
        user, submission = self.create_ongoing_submission(3)
        response = self.report(user, submission, "camera_permission")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(submission.violations.count(), 0)
