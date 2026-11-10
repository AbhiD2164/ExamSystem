"""
users/permissions.py — Reusable permission classes.
"""
from rest_framework.permissions import BasePermission


class IsAdminUser(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_admin)


class IsExaminer(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_examiner)


class IsStudent(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and not request.user.is_admin)


class IsAdminOrExaminer(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and (request.user.is_admin or request.user.is_examiner))


class IsAdminOrSelf(BasePermission):
    def has_object_permission(self, request, view, obj):
        return request.user.is_admin or obj == request.user


class CanCreateExam(BasePermission):
    """Exam creators receive their exam rights through community membership."""
    def has_permission(self, request, view):
        user = request.user
        if not user.is_authenticated:
            return False
        if user.is_admin:
            return True
        memberships = user.memberships.filter(
            status="approved",
            is_active=True,
        ).values("role", "creator_exam_types")
        return any(
            membership["role"] in ["owner", "manager"]
            or (
                membership["role"] == "exam_creator"
                and bool(membership["creator_exam_types"])
            )
            for membership in memberships
        )

    def has_object_permission(self, request, view, obj):
        user = request.user
        if user.is_admin:
            return True
        from exams.access import can_manage_exam

        exam = getattr(obj, "exam", obj)
        return can_manage_exam(user, exam)
