"""
users/admin.py
"""
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import Community, CommunityMembership, CommunityInvite, User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = [
        "email", "full_name", "role", "email_verified",
        "institution_name", "department",
        "last_email_changed_at", "is_active", "date_joined",
    ]
    list_filter = ["role", "email_verified", "is_active"]
    search_fields = ["email", "full_name", "institution_name", "student_id_number"]
    ordering = ["-date_joined"]
    fieldsets = (
        (None, {"fields": ("password",)}),
        ("Personal Info", {"fields": ("full_name", "institution_name", "department", "student_id_number")}),
        ("Contact & Verification", {"fields": ("email", "pending_email", "email_verified", "last_email_changed_at")}),
        ("Role", {"fields": ("role",)}),
        ("Permissions", {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")}),
        ("Dates", {"fields": ("last_login", "date_joined")}),
    )


@admin.register(Community)
class CommunityAdmin(admin.ModelAdmin):
    list_display = ["name", "organization_type", "country", "time_zone", "created_by", "created_at"]
    search_fields = ["name", "country"]


@admin.register(CommunityMembership)
class CommunityMembershipAdmin(admin.ModelAdmin):
    list_display = ["community", "user", "role", "status", "member_group", "is_active", "joined_at"]
    list_filter = ["role", "status", "is_active"]
    search_fields = ["community__name", "user__email", "user__full_name", "member_group"]


@admin.register(CommunityInvite)
class CommunityInviteAdmin(admin.ModelAdmin):
    list_display = [
        "community", "title", "token", "role", "allowed_domain",
        "uses_count", "max_uses", "is_active", "created_at",
    ]
    list_filter = ["role", "is_active"]
    search_fields = ["community__name", "title", "token", "allowed_domain", "allowed_emails"]
