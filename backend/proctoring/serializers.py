"""
proctoring/serializers.py
"""
from rest_framework import serializers
from .models import ViolationEvent


class ViolationEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = ViolationEvent
        fields = ["id", "submission", "violation_type", "severity", "details", "occurred_at"]
        read_only_fields = ["id", "severity", "occurred_at"]
