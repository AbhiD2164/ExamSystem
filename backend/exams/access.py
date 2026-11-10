from django.db.models import Q
from .models import Exam


def can_create_exam_in_community(user, community, assessment_type):
    if user.is_admin or user.is_superuser:
        return True
    membership = user.memberships.filter(
        community=community,
        status="approved",
        is_active=True,
    ).first()
    if not membership:
        return False
    if membership.role in ("owner", "manager"):
        return True
    return (
        membership.role == "exam_creator"
        and assessment_type in membership.creator_exam_types
    )


def can_manage_exam(user, exam):
    if user.is_admin or user.is_superuser:
        return True
    if exam.created_by_id == user.id and not exam.community_id:
        return True
    if not exam.community_id:
        return False
    return can_create_exam_in_community(
        user, exam.community, exam.assessment_type
    )


def manageable_exams(user):
    if user.is_admin or user.is_superuser:
        return Exam.objects.all()
    memberships = list(user.memberships.filter(
        status="approved",
        is_active=True,
    ).only("community_id", "role", "creator_exam_types"))
    community_ids = [
        membership.community_id
        for membership in memberships
        if membership.role in ("owner", "manager")
    ]
    scope_filter = Q()
    for membership in memberships:
        if membership.role == "exam_creator" and membership.creator_exam_types:
            scope_filter |= Q(
                community_id=membership.community_id,
                assessment_type__in=membership.creator_exam_types,
            )
    return Exam.objects.filter(
        Q(created_by=user) | Q(community_id__in=community_ids) | scope_filter
    ).distinct()
