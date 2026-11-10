"""
exams/serializers.py
"""
from rest_framework import serializers
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from datetime import timedelta
import re
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from .models import Exam, Question, Choice, Submission, Answer


class ExamTimeZoneField(serializers.DateTimeField):
    def to_internal_value(self, value):
        parsed = parse_datetime(str(value))
        if parsed and timezone.is_naive(parsed):
            zone_name = self.root.initial_data.get("time_zone", "UTC")
            try:
                parsed = parsed.replace(tzinfo=ZoneInfo(zone_name))
            except (ZoneInfoNotFoundError, TypeError, ValueError) as exc:
                raise serializers.ValidationError("Use a valid IANA time zone.") from exc
            return parsed
        return super().to_internal_value(value)


class ChoiceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Choice
        fields = ["id", "text", "is_correct", "order"]


class ChoiceStudentSerializer(serializers.ModelSerializer):
    """Hides is_correct from students."""
    class Meta:
        model = Choice
        fields = ["id", "text", "order"]


class QuestionSerializer(serializers.ModelSerializer):
    choices = ChoiceSerializer(many=True, required=False)

    class Meta:
        model = Question
        fields = [
            "id", "text", "question_type", "marks", "order", "is_required",
            "expected_notes", "reference_context", "rubrics", "choices"
        ]

    def validate(self, attrs):
        question_type = attrs.get("question_type", getattr(self.instance, "question_type", None))
        if "choices" in attrs:
            choices = attrs["choices"]
        elif self.instance:
            choices = list(self.instance.choices.values("text", "is_correct", "order"))
        else:
            choices = []

        if attrs.get("marks", getattr(self.instance, "marks", 1)) < 1:
            raise serializers.ValidationError({"marks": "Marks must be greater than zero."})
        if question_type in (Question.MCQ_SINGLE, Question.MCQ_MULTI):
            correct_count = sum(choice["is_correct"] for choice in choices)
            if len(choices) < 2:
                raise serializers.ValidationError({"choices": "Add at least two answer choices."})
            if question_type == Question.MCQ_SINGLE and correct_count != 1:
                raise serializers.ValidationError({"choices": "A single-answer question needs exactly one correct choice."})
            if question_type == Question.MCQ_MULTI and correct_count < 1:
                raise serializers.ValidationError({"choices": "Select at least one correct choice."})
        else:
            if choices:
                raise serializers.ValidationError({"choices": "Written questions cannot include answer choices."})
            expected = attrs.get("expected_notes", getattr(self.instance, "expected_notes", ""))
            rubrics = attrs.get("rubrics", getattr(self.instance, "rubrics", []))
            if not expected.strip() and not rubrics:
                raise serializers.ValidationError({
                    "expected_notes": "Provide a model answer or at least one grading rubric for AI evaluation."
                })
        return attrs

    def create(self, validated_data):
        choices_data = validated_data.pop("choices", [])
        question = Question.objects.create(**validated_data)
        for choice_data in choices_data:
            Choice.objects.create(question=question, **choice_data)
        return question

    def update(self, instance, validated_data):
        choices_data = validated_data.pop("choices", None)
        for attr, val in validated_data.items():
            setattr(instance, attr, val)
        instance.save()
        if choices_data is not None:
            instance.choices.all().delete()
            for choice_data in choices_data:
                Choice.objects.create(question=instance, **choice_data)
        return instance


class QuestionStudentSerializer(serializers.ModelSerializer):
    """Hides model answers, reference context, and rubrics from students during exam."""
    choices = ChoiceStudentSerializer(many=True, read_only=True)

    class Meta:
        model = Question
        fields = [
            "id", "text", "question_type", "marks", "order", "is_required", "choices"
        ]


class ExamSerializer(serializers.ModelSerializer):
    is_public = serializers.BooleanField(write_only=True, required=False, default=False)
    start_datetime = ExamTimeZoneField()
    results_visible_from = ExamTimeZoneField(required=False, allow_null=True)
    questions = QuestionSerializer(many=True, read_only=True)
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True)
    end_datetime = serializers.SerializerMethodField()
    is_joinable = serializers.SerializerMethodField()
    allowed_count = serializers.SerializerMethodField()

    class Meta:
        model = Exam
        fields = [
            "id", "title", "assessment_type", "description", "instructions", "status",
            "community", "time_zone",
            "institution_name", "department", "target_batch",
            "is_public", "allowed_emails", "allowed_count",
            "start_datetime", "duration_minutes", "end_datetime",
            "results_visible_from", "created_by", "created_by_name",
            "is_joinable", "questions", "created_at", "updated_at",
        ]
        read_only_fields = ["created_by", "created_at", "updated_at"]

    def validate_time_zone(self, value):
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise serializers.ValidationError("Use a valid IANA time zone.") from exc
        return value

    def validate_allowed_emails(self, value):
        emails = [item for item in re.split(r"[\r\n,\s]+", value.strip()) if item]
        normalized = []
        for email in emails:
            normalized.append(serializers.EmailField().run_validation(email).lower())
        return ", ".join(sorted(set(normalized)))

    def validate(self, attrs):
        community = attrs.get("community", getattr(self.instance, "community", None))
        assessment_type = attrs.get(
            "assessment_type",
            getattr(self.instance, "assessment_type", Exam.PRACTICE),
        )
        if community:
            user = self.context["request"].user
            from .access import can_create_exam_in_community

            if not can_create_exam_in_community(user, community, assessment_type):
                raise serializers.ValidationError({
                    "community": "Your community role does not allow creating this assessment type."
                })
        elif not self.instance and not self.context["request"].user.is_admin:
            raise serializers.ValidationError({"community": "Select a community where you can create exams."})

        if attrs.get("is_public", getattr(self.instance, "is_public", False)):
            raise serializers.ValidationError({
                "is_public": "Assessments must use an explicit candidate email allowlist."
            })

        duration = attrs.get("duration_minutes", getattr(self.instance, "duration_minutes", 0))
        if duration < 1:
            raise serializers.ValidationError({"duration_minutes": "Duration must be at least one minute."})
        start = attrs.get("start_datetime", getattr(self.instance, "start_datetime", None))
        result_release = attrs.get("results_visible_from", getattr(self.instance, "results_visible_from", None))
        status_value = attrs.get("status", getattr(self.instance, "status", Exam.DRAFT))
        allowed_emails = attrs.get(
            "allowed_emails", getattr(self.instance, "allowed_emails", "")
        )
        if status_value == Exam.PUBLISHED and not allowed_emails.strip():
            raise serializers.ValidationError({
                "allowed_emails": "Add at least one candidate email before publishing."
            })
        if status_value == Exam.PUBLISHED and not result_release:
            raise serializers.ValidationError({
                "results_visible_from": "Set a results release time before publishing the exam."
            })
        if start and result_release and result_release < start + timedelta(minutes=duration):
            raise serializers.ValidationError({
                "results_visible_from": "Results cannot be released before the scheduled exam ends."
            })
        return attrs

    def get_end_datetime(self, obj):
        return obj.end_datetime

    def get_is_joinable(self, obj):
        return obj.is_joinable()

    def get_allowed_count(self, obj):
        return len(obj.get_allowed_email_list())


class ExamStudentSerializer(serializers.ModelSerializer):
    """Student view — questions without answers."""
    questions = QuestionStudentSerializer(many=True, read_only=True)
    end_datetime = serializers.SerializerMethodField()
    time_remaining_minutes = serializers.SerializerMethodField()
    is_joinable = serializers.SerializerMethodField()

    class Meta:
        model = Exam
        fields = [
            "id", "title", "assessment_type", "description", "instructions",
            "time_zone",
            "institution_name", "department", "target_batch",
            "start_datetime", "duration_minutes", "end_datetime",
            "time_remaining_minutes", "is_joinable", "questions",
        ]

    def get_end_datetime(self, obj):
        return obj.end_datetime

    def get_time_remaining_minutes(self, obj):
        return obj.time_remaining_for_student()

    def get_is_joinable(self, obj):
        return obj.is_joinable()


class ExamListStudentSerializer(serializers.ModelSerializer):
    """Lightweight exam list for students."""
    end_datetime = serializers.SerializerMethodField()
    results_visible_from = serializers.DateTimeField(allow_null=True, required=False)
    results_available = serializers.SerializerMethodField()
    is_joinable = serializers.SerializerMethodField()
    submission_status = serializers.SerializerMethodField()
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True)

    class Meta:
        model = Exam
        fields = [
            "id", "title", "assessment_type", "description", "created_by_name",
            "time_zone",
            "institution_name", "department", "target_batch",
            "start_datetime", "duration_minutes", "end_datetime",
            "results_visible_from", "results_available", "is_joinable",
            "submission_status",
        ]

    def get_end_datetime(self, obj):
        return obj.end_datetime

    def get_results_available(self, obj):
        return obj.results_are_visible()

    def get_is_joinable(self, obj):
        return obj.is_joinable()

    def get_submission_status(self, obj):
        submissions = getattr(obj, "current_user_submissions", [])
        return submissions[0].status if submissions else None


class AnswerSerializer(serializers.ModelSerializer):
    question_text = serializers.CharField(source="question.text", read_only=True)
    question_type = serializers.CharField(source="question.question_type", read_only=True)
    max_marks = serializers.IntegerField(source="question.marks", read_only=True)
    expected_notes = serializers.CharField(source="question.expected_notes", read_only=True)

    class Meta:
        model = Answer
        fields = [
            "id", "question", "question_text", "question_type", "max_marks",
            "expected_notes", "text_answer", "selected_choices",
            "marks_awarded", "is_correct", "ai_feedback",
            "rubric_breakdown", "semantic_score", "eval_method"
        ]


class SubmissionCreateSerializer(serializers.ModelSerializer):
    answers = AnswerSerializer(many=True, required=False)

    class Meta:
        model = Submission
        fields = ["exam", "answers"]

    def validate(self, data):
        exam = data["exam"]
        student = self.context["request"].user
        now = timezone.now()

        if exam.status != Exam.PUBLISHED:
            raise serializers.ValidationError("This exam is not published.")

        # Access check: student must be allowed
        if not exam.is_student_allowed(student):
            raise serializers.ValidationError("You are not authorized/whitelisted for this exam.")

        # Registration gate: cannot submit after exam end
        if now > exam.end_datetime:
            raise serializers.ValidationError("The exam period has ended. You cannot submit.")

        # Cannot start before exam begins
        if now < exam.start_datetime:
            raise serializers.ValidationError("The exam has not started yet.")

        # Check if already submitted
        if Submission.objects.filter(student=student, exam=exam).exclude(status=Submission.ONGOING).exists():
            raise serializers.ValidationError("You have already submitted this exam.")

        for answer in data.get("answers", []):
            question = answer["question"]
            if question.exam_id != exam.id:
                raise serializers.ValidationError({"answers": "Each answer must belong to this exam."})
            selected = answer.get("selected_choices", [])
            if not isinstance(selected, list) or any(
                not isinstance(choice_id, int) or isinstance(choice_id, bool)
                for choice_id in selected
            ):
                raise serializers.ValidationError({"answers": "Selected choices must be a list."})
            valid_choice_ids = set(question.choices.values_list("id", flat=True))
            if not set(selected).issubset(valid_choice_ids):
                raise serializers.ValidationError({"answers": "A selected choice does not belong to its question."})
            if question.question_type == Question.MCQ_SINGLE and len(selected) > 1:
                raise serializers.ValidationError({"answers": "A single-answer question accepts only one choice."})
            if question.question_type not in (Question.MCQ_SINGLE, Question.MCQ_MULTI) and selected:
                raise serializers.ValidationError({"answers": "Text questions cannot contain selected choices."})
        return data

    def create(self, validated_data):
        answers_data = validated_data.pop("answers", [])
        student = self.context["request"].user
        submission, _ = Submission.objects.get_or_create(
            student=student,
            exam=validated_data["exam"],
            defaults={"status": Submission.ONGOING},
        )
        submission.status = Submission.SUBMITTED
        submission.submitted_at = timezone.now()
        submission.save()

        for answer_data in answers_data:
            Answer.objects.update_or_create(
                submission=submission,
                question=answer_data["question"],
                defaults={
                    "text_answer": answer_data.get("text_answer", ""),
                    "selected_choices": answer_data.get("selected_choices", []),
                },
            )
        return submission


class SubmissionDetailSerializer(serializers.ModelSerializer):
    answers = AnswerSerializer(many=True, read_only=True)
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    student_email = serializers.CharField(source="student.email", read_only=True)
    exam_title = serializers.CharField(source="exam.title", read_only=True)

    class Meta:
        model = Submission
        fields = [
            "id", "student", "student_name", "student_email", "exam", "exam_title",
            "status", "started_at", "submitted_at",
            "violation_count", "proctor_remark",
            "score", "total_marks", "is_graded",
            "answers",
        ]


class StudentAnswerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Answer
        fields = ["id", "question", "text_answer", "selected_choices"]


class StudentSubmissionSerializer(serializers.ModelSerializer):
    answers = StudentAnswerSerializer(many=True, read_only=True)

    class Meta:
        model = Submission
        fields = [
            "id", "exam", "status", "started_at", "submitted_at",
            "violation_count", "proctor_remark", "answers",
        ]


class GradeSubmissionSerializer(serializers.ModelSerializer):
    """Examiner manually grades a submission."""
    class Meta:
        model = Submission
        fields = ["score", "total_marks", "is_graded", "proctor_remark"]

    def validate(self, attrs):
        if self.instance and self.instance.status == Submission.DISQUALIFIED:
            attrs["score"] = 0
            attrs["is_graded"] = True
        return attrs
