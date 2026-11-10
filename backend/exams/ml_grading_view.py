"""
exams/ml_grading_view.py
ExMint In-House ML Auto-Grading & AI Agent Training Views.

Endpoints:
- POST /api/exams/submissions/<id>/ai-grade/ (grades single submission)
- POST /api/exams/<exam_id>/batch-ml-grade/ (grades all submissions for an exam)
- POST /api/exams/ml-grade/preview/ (live interactive ML testing playground)
- GET  /api/exams/ml-model/info/ (model status, weights, diagnostics)
- POST /api/exams/ml-model/train/ (trains ML evaluation model using past graded answers)
"""

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.shortcuts import get_object_or_404

from .models import Submission, Answer, Question, Exam
from .access import manageable_exams
from .ai_grader import evaluate_free_ai_answer, ml_grade_answer
from .ml_grader import (
    MLGradingAgentTrainer,
    SKLEARN_AVAILABLE,
    XGBOOST_AVAILABLE,
    CATBOOST_AVAILABLE,
)
from users.permissions import CanCreateExam


def grade_single_answer(answer: Answer, question: Question) -> dict:
    """Internal helper to grade an individual answer."""
    qtype = question.question_type

    # ── MCQ Deterministic Grading ──────────────────────────────────────────────
    if qtype in ("mcq_single", "mcq_multi"):
        correct_ids = set(question.choices.filter(is_correct=True).values_list("id", flat=True))
        selected = set(answer.selected_choices or [])
        is_correct = (correct_ids == selected)
        marks = float(question.marks) if is_correct else 0.0
        
        answer.marks_awarded = marks
        answer.is_correct = is_correct
        answer.eval_method = "deterministic"
        answer.ai_feedback = "Correct choice selected." if is_correct else "Incorrect choice selected."
        answer.rubric_breakdown = []
        answer.semantic_score = 1.0 if is_correct else 0.0
        answer.save()
        
        return {
            "question_id": question.id,
            "question_type": qtype,
            "marks_awarded": marks,
            "max_marks": question.marks,
            "is_correct": is_correct,
            "method": "deterministic",
            "feedback": answer.ai_feedback,
        }

    # ── Short / Long Answer AI Grading ─────────────────────────────────────────
    if not (answer.text_answer or "").strip():
        answer.marks_awarded = 0
        answer.is_correct = False
        answer.ai_feedback = "No answer was submitted."
        answer.rubric_breakdown = []
        answer.semantic_score = 0
        answer.eval_method = "empty"
        answer.save()
        return {
            "question_id": question.id,
            "question_type": qtype,
            "marks_awarded": 0,
            "max_marks": question.marks,
            "is_correct": False,
            "method": "empty",
            "feedback": answer.ai_feedback,
        }

    expected = getattr(question, "expected_notes", "") or ""
    context = getattr(question, "reference_context", "") or ""
    rubrics = getattr(question, "rubrics", []) or []

    ml_res = ml_grade_answer(
        question_text=question.text,
        expected_notes=expected,
        student_answer=answer.text_answer or "",
        max_marks=question.marks,
        reference_context=context,
        rubrics=rubrics,
        question_type=qtype,
    )

    marks = ml_res["marks_awarded"]
    is_corr = ml_res["is_correct"]
    
    answer.marks_awarded = marks
    answer.is_correct = is_corr
    answer.ai_feedback = ml_res["feedback"]
    answer.rubric_breakdown = ml_res.get("rubric_breakdown", [])
    answer.semantic_score = ml_res.get("semantic_score", 0.0)
    answer.eval_method = ml_res.get("method", "exmint_ml_sklearn")
    answer.save()

    return {
        "question_id": question.id,
        "question_type": qtype,
        "marks_awarded": marks,
        "max_marks": question.marks,
        "is_correct": is_corr,
        "ai_feedback": ml_res["feedback"],
        "ai_reason": ml_res.get("reason", ""),
        "semantic_score": ml_res.get("semantic_score", 0.0),
        "rubric_breakdown": ml_res.get("rubric_breakdown", []),
        "features": ml_res.get("features", {}),
        "method": ml_res.get("method", "exmint_ml_sklearn"),
    }


def grade_submission(submission: Submission) -> dict:
    questions = list(submission.exam.questions.prefetch_related("choices").order_by("order"))
    total_possible = sum(question.marks for question in questions)
    if submission.status == Submission.DISQUALIFIED:
        submission.score = 0
        submission.total_marks = total_possible
        submission.is_graded = True
        submission.save(update_fields=["score", "total_marks", "is_graded"])
        return {"score": 0, "total_marks": total_possible, "details": []}

    details = []
    total_awarded = 0.0
    for question in questions:
        answer, _ = Answer.objects.get_or_create(
            submission=submission,
            question=question,
            defaults={"text_answer": "", "selected_choices": []},
        )
        result = grade_single_answer(answer, question)
        details.append(result)
        total_awarded += float(result.get("marks_awarded") or 0)

    submission.score = total_awarded
    submission.total_marks = total_possible
    submission.is_graded = True
    submission.save(update_fields=["score", "total_marks", "is_graded"])
    return {
        "score": total_awarded,
        "total_marks": total_possible,
        "details": details,
    }


class MLGradeSubmissionView(APIView):
    """POST /api/exams/submissions/<pk>/ai-grade/"""
    permission_classes = [CanCreateExam]

    def post(self, request, pk):
        try:
            submission = Submission.objects.filter(
                exam__in=manageable_exams(request.user)
            ).get(pk=pk)
        except Submission.DoesNotExist:
            return Response({"detail": "Submission not found."}, status=status.HTTP_404_NOT_FOUND)

        graded = grade_submission(submission)
        total_awarded = graded["score"]
        total_possible = graded["total_marks"]

        return Response({
            "submission_id": submission.id,
            "student_name": submission.student.full_name,
            "score": total_awarded,
            "total_marks": total_possible,
            "percentage": round((total_awarded / total_possible * 100), 1) if total_possible else 0,
            "details": graded["details"],
            "grader_engine": "ExMint Sklearn NLP & Gradient Boosting ML Agent",
        })


class MLBatchGradeView(APIView):
    """POST /api/exams/<exam_id>/batch-ml-grade/"""
    permission_classes = [CanCreateExam]

    def post(self, request, exam_id):
        exam = get_object_or_404(manageable_exams(request.user), pk=exam_id)
        submissions = Submission.objects.filter(exam=exam).exclude(status=Submission.ONGOING)
        
        graded_count = 0
        for sub in submissions:
            grade_submission(sub)
            graded_count += 1

        return Response({
            "detail": f"Successfully auto-graded {graded_count} submissions with ExMint Sklearn ML Agent.",
            "graded_count": graded_count,
            "exam_id": exam.id,
        })


class MLGradePreviewView(APIView):
    """POST /api/exams/ml-grade/preview/"""
    permission_classes = [CanCreateExam]

    def post(self, request):
        question_text = request.data.get("question_text", "")
        expected_notes = request.data.get("expected_notes", "")
        reference_context = request.data.get("reference_context", "")
        rubrics = request.data.get("rubrics", [])
        sample_answer = request.data.get("sample_answer", "")
        max_marks = int(request.data.get("max_marks", 5))
        question_type = request.data.get("question_type", "long")

        result = ml_grade_answer(
            question_text=question_text,
            expected_notes=expected_notes,
            student_answer=sample_answer,
            max_marks=max_marks,
            reference_context=reference_context,
            rubrics=rubrics,
            question_type=question_type,
        )

        return Response(result)


class MLModelInfoView(APIView):
    """GET /api/exams/ml-model/info/"""
    permission_classes = [CanCreateExam]

    def get(self, request):
        return Response({
            "engine": "ExMint ML & NLP Evaluation Agent",
            "libraries": {
                "scikit_learn": SKLEARN_AVAILABLE,
                "xgboost": XGBOOST_AVAILABLE,
                "catboost": CATBOOST_AVAILABLE,
            },
            "status": "online",
            "features": [
                "Sklearn TfidfVectorizer Word (1-3) & Char (3-5) N-Grams",
                "Linear & Cosine Similarity Distance Matrices",
                "Multi-factor Feature Engineering Pipeline (7 signals)",
                "Gradient Boosting / Random Forest / Ridge AI Agent Training",
                "Automated Rubric & Key Concept Coverage Matcher",
                "Explainable Student Feedback Generation",
            ],
            "weights": {
                "tfidf_word_sim": 0.25,
                "tfidf_char_sim": 0.20,
                "context_sim": 0.10,
                "rubric_coverage_ratio": 0.25,
                "rubric_score_avg": 0.10,
                "length_factor": 0.05,
                "keyword_density": 0.05,
            },
        })


class MLModelTrainView(APIView):
    """
    POST /api/exams/ml-model/train/
    Trains an ML grading regressor on previously graded answers from the database or provided dataset.
    """
    permission_classes = [CanCreateExam]

    def post(self, request):
        algorithm = request.data.get("algorithm", "gradient_boosting")
        
        # Collect graded answers from historical submissions
        graded_answers = Answer.objects.filter(
            marks_awarded__isnull=False,
            question__question_type__in=["short", "long"]
        ).select_related("question")

        training_samples = []
        for a in graded_answers:
            if a.text_answer and a.text_answer.strip():
                training_samples.append({
                    "student_answer": a.text_answer,
                    "expected_notes": a.question.expected_notes or "",
                    "reference_context": a.question.reference_context or "",
                    "rubrics": a.question.rubrics or [],
                    "max_marks": a.question.marks,
                    "question_type": a.question.question_type,
                    "marks_awarded": float(a.marks_awarded),
                })

        # If database has few samples, provide benchmark synthetic calibration data
        if len(training_samples) < 5:
            # Seed with benchmark samples to allow training demonstration
            training_samples.extend([
                {
                    "student_answer": "Transformers use self-attention with Query, Key and Value matrices to calculate attention weights across tokens in parallel.",
                    "expected_notes": "Transformers rely on multi-head self-attention mechanisms computing Query, Key, and Value dot-product attention.",
                    "reference_context": "Deep learning attention models.",
                    "rubrics": [{"point": "Mentions Query, Key, Value", "weight": 2.0}],
                    "max_marks": 5,
                    "question_type": "long",
                    "marks_awarded": 5.0,
                },
                {
                    "student_answer": "Attention mechanism processes words by looking at other words in the sentence.",
                    "expected_notes": "Transformers rely on multi-head self-attention mechanisms computing Query, Key, and Value dot-product attention.",
                    "reference_context": "Deep learning attention models.",
                    "rubrics": [{"point": "Mentions Query, Key, Value", "weight": 2.0}],
                    "max_marks": 5,
                    "question_type": "long",
                    "marks_awarded": 2.5,
                },
                {
                    "student_answer": "I do not know the answer to this question.",
                    "expected_notes": "Transformers rely on multi-head self-attention mechanisms computing Query, Key, and Value dot-product attention.",
                    "reference_context": "Deep learning attention models.",
                    "rubrics": [{"point": "Mentions Query, Key, Value", "weight": 2.0}],
                    "max_marks": 5,
                    "question_type": "long",
                    "marks_awarded": 0.0,
                },
            ])

        result = MLGradingAgentTrainer.train_model(training_samples, algorithm=algorithm)
        return Response(result)
