"""
exams/admin.py
"""
from django.contrib import admin
from .models import Exam, Question, Choice, Submission, Answer


class QuestionInline(admin.TabularInline):
    model = Question
    extra = 0


class ChoiceInline(admin.TabularInline):
    model = Choice
    extra = 0


@admin.register(Exam)
class ExamAdmin(admin.ModelAdmin):
    list_display = ["title", "created_by", "status", "start_datetime", "duration_minutes"]
    list_filter = ["status"]
    inlines = [QuestionInline]


@admin.register(Question)
class QuestionAdmin(admin.ModelAdmin):
    list_display = ["exam", "text", "question_type", "marks", "order"]
    inlines = [ChoiceInline]


@admin.register(Submission)
class SubmissionAdmin(admin.ModelAdmin):
    list_display = ["student", "exam", "status", "violation_count", "score", "is_graded"]
    list_filter = ["status", "is_graded"]


admin.site.register(Answer)
