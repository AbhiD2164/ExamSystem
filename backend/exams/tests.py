from datetime import datetime, timedelta, timezone as datetime_timezone
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIRequestFactory, APITestCase, force_authenticate

from users.models import Community, CommunityMembership, User
from .models import Choice, Exam, Question, Submission
from .serializers import ExamSerializer, QuestionSerializer
from .ai_grader import grade_with_gemini


class ExamAuthoringTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="author@example.com",
            password="Agile!Cobalt_River_8472",
            full_name="Exam Author",
            role=User.USER,
            email_verified=True,
        )
        self.community = Community.objects.create(
            name="New York College",
            country="US",
            time_zone="America/New_York",
            created_by=self.user,
        )
        CommunityMembership.objects.create(
            community=self.community,
            user=self.user,
            role=CommunityMembership.OWNER,
        )
        self.request = APIRequestFactory().post("/api/exams/")
        force_authenticate(self.request, user=self.user)
        self.request.user = self.user

    def test_exam_wall_clock_time_is_interpreted_in_community_zone(self):
        serializer = ExamSerializer(data={
            "title": "Local time exam",
            "community": self.community.pk,
            "time_zone": "America/New_York",
            "start_datetime": "2026-03-20T14:30",
            "duration_minutes": 60,
            "status": "draft",
        }, context={"request": self.request})

        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(
            serializer.validated_data["start_datetime"],
            datetime(2026, 3, 20, 18, 30, tzinfo=datetime_timezone.utc),
        )

    def test_published_exam_requires_a_release_time(self):
        serializer = ExamSerializer(data={
            "title": "Unscheduled results",
            "community": self.community.pk,
            "time_zone": "America/New_York",
            "start_datetime": "2026-03-20T14:30",
            "duration_minutes": 60,
            "status": "published",
            "allowed_emails": "candidate@example.com",
        }, context={"request": self.request})

        self.assertFalse(serializer.is_valid())
        self.assertIn("results_visible_from", serializer.errors)

    def test_exam_creator_is_limited_to_assigned_assessment_types(self):
        member = User.objects.create_user(
            email="cell-member@example.com",
            password="Agile!Cobalt_River_8472",
            full_name="Placement Cell Member",
            email_verified=True,
        )
        CommunityMembership.objects.create(
            community=self.community,
            user=member,
            role=CommunityMembership.EXAM_CREATOR,
            creator_exam_types=[Exam.PLACEMENT],
            member_group="Training and Placement Cell",
        )
        request = APIRequestFactory().post("/api/exams/")
        force_authenticate(request, user=member)
        request.user = member
        data = {
            "title": "Scoped test",
            "community": self.community.pk,
            "time_zone": "America/New_York",
            "start_datetime": "2026-11-20T14:30",
            "duration_minutes": 60,
            "status": "draft",
        }
        serializer = ExamSerializer(
            data={**data, "assessment_type": Exam.PRACTICE},
            context={"request": request},
        )
        self.assertFalse(serializer.is_valid())
        self.assertIn("community", serializer.errors)

        serializer = ExamSerializer(
            data={**data, "assessment_type": Exam.PLACEMENT},
            context={"request": request},
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_mcq_requires_correct_answer_and_text_question_requires_rubric(self):
        mcq = QuestionSerializer(data={
            "text": "Choose the correct answer.",
            "question_type": "mcq_single",
            "marks": 1,
            "choices": [
                {"text": "A", "is_correct": False},
                {"text": "B", "is_correct": False},
            ],
        })
        self.assertFalse(mcq.is_valid())
        self.assertIn("choices", mcq.errors)

        essay = QuestionSerializer(data={
            "text": "Write an essay.",
            "question_type": "long",
            "marks": 5,
        })
        self.assertFalse(essay.is_valid())
        self.assertIn("expected_notes", essay.errors)


class AutomaticGradingTests(APITestCase):
    def test_mcq_is_graded_on_submit_without_exposing_answer_key(self):
        user = User.objects.create_user(
            email="candidate@example.com",
            password="Agile!Cobalt_River_8472",
            full_name="Candidate",
            role=User.USER,
            email_verified=True,
        )
        exam = Exam.objects.create(
            created_by=user,
            title="Auto-grade",
            status=Exam.PUBLISHED,
            allowed_emails=user.email,
            start_datetime=timezone.now() - timedelta(minutes=1),
            duration_minutes=60,
            results_visible_from=timezone.now() + timedelta(days=1),
        )
        question = Question.objects.create(
            exam=exam,
            text="Select the correct option.",
            question_type=Question.MCQ_SINGLE,
            expected_notes="Hidden model answer",
        )
        correct = Choice.objects.create(question=question, text="Correct", is_correct=True)
        Choice.objects.create(question=question, text="Incorrect", is_correct=False)
        self.client.force_authenticate(user)

        response = self.client.post(reverse("submission-create"), {
            "exam": exam.pk,
            "answers": [{
                "question": question.pk,
                "text_answer": "",
                "selected_choices": [correct.pk],
            }],
        }, format="json")

        self.assertEqual(response.status_code, 201, response.data)
        self.assertNotIn("marks_awarded", response.data["answers"][0])
        self.assertNotIn("is_correct", response.data["answers"][0])
        submission = Submission.objects.get(pk=response.data["id"])
        self.assertTrue(submission.is_graded)
        self.assertEqual(submission.score, 1)
        self.assertFalse(submission.exam.results_are_visible())


class AssessmentEligibilityTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email="eligibility-owner@example.com",
            password="Agile!Cobalt_River_8472",
            full_name="Community Owner",
            email_verified=True,
        )
        self.candidate = User.objects.create_user(
            email="candidate@example.com",
            password="Agile!Cobalt_River_8472",
            full_name="Allowlisted Candidate",
            email_verified=True,
        )
        self.other = User.objects.create_user(
            email="other@example.com",
            password="Agile!Cobalt_River_8472",
            full_name="Enrolled Non-Candidate",
            email_verified=True,
        )
        self.community = Community.objects.create(
            name="Exam Community",
            created_by=self.owner,
        )
        CommunityMembership.objects.create(
            community=self.community,
            user=self.owner,
            role=CommunityMembership.OWNER,
        )
        self.pending_membership = CommunityMembership.objects.create(
            community=self.community,
            user=self.candidate,
            status=CommunityMembership.PENDING,
            is_active=False,
        )
        self.exam = Exam.objects.create(
            created_by=self.owner,
            community=self.community,
            title="Restricted test",
            status=Exam.PUBLISHED,
            is_public=True,
            allowed_emails=self.candidate.email,
            start_datetime=timezone.now() - timedelta(minutes=1),
            duration_minutes=60,
            results_visible_from=timezone.now() + timedelta(days=1),
        )
        self.exam.enrollments.create(student=self.other)

    def test_assessment_requires_allowlist_and_approved_membership_everywhere(self):
        self.client.force_authenticate(self.candidate)
        response = self.client.get(reverse("student-exam-list"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, [])
        self.assertEqual(
            self.client.get(reverse("student-exam-detail", args=[self.exam.pk])).status_code,
            403,
        )
        self.assertEqual(
            self.client.post(reverse("submission-create"), {"exam": self.exam.pk}, format="json").status_code,
            400,
        )

        self.pending_membership.status = CommunityMembership.APPROVED
        self.pending_membership.is_active = True
        self.pending_membership.save()
        response = self.client.get(reverse("student-exam-list"))
        self.assertEqual([item["id"] for item in response.data], [self.exam.pk])
        self.assertTrue(self.exam.is_student_allowed(self.candidate))

        self.client.force_authenticate(self.other)
        self.assertFalse(self.exam.is_student_allowed(self.other))
        self.assertEqual(self.client.get(reverse("student-exam-list")).data, [])
        self.assertEqual(
            self.client.get(reverse("student-exam-detail", args=[self.exam.pk])).status_code,
            403,
        )


class GeminiGraderConfigurationTests(TestCase):
    @override_settings(GEMINI_API_KEY="test-api-key", GEMINI_MODEL="gemini-test-model")
    @patch("exams.ai_grader.requests.post")
    def test_configured_model_is_used_for_request_and_result(self, post):
        response = post.return_value
        response.status_code = 200
        response.json.return_value = {
            "candidates": [{
                "content": {
                    "parts": [{
                        "text": (
                            '{"marks_awarded": 1, "is_correct": true, '
                            '"semantic_score": 1, "feedback": "Correct"}'
                        )
                    }]
                }
            }]
        }

        result = grade_with_gemini("Question", "Expected", "Answer", 1)

        self.assertEqual(result["method"], "gemini-test-model")
        self.assertIn(
            "/models/gemini-test-model:generateContent?",
            post.call_args.args[0],
        )
