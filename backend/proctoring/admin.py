"""
proctoring/admin.py
"""
from django.contrib import admin
from .models import ViolationEvent


@admin.register(ViolationEvent)
class ViolationEventAdmin(admin.ModelAdmin):
    list_display = ["submission", "violation_type", "severity", "occurred_at"]
    list_filter = ["violation_type", "severity"]
