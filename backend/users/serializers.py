"""
users/serializers.py
"""
from datetime import timedelta
from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.utils import timezone
from rest_framework import serializers
from rest_framework_simplejwt.tokens import RefreshToken
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from .models import Community, CommunityMembership, CommunityInvite, User


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    institution_name = serializers.CharField(required=False, allow_blank=True, default="")
    department = serializers.CharField(required=False, allow_blank=True, default="")
    student_id_number = serializers.CharField(required=False, allow_blank=True, default="")

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "full_name",
            "password",
            "institution_name",
            "department",
            "student_id_number",
        ]

    def validate_password(self, value):
        validate_password(
            value,
            user=User(
                email=self.initial_data.get("email", ""),
                full_name=self.initial_data.get("full_name", ""),
            ),
        )
        return value

    def validate_email(self, value):
        value = value.strip().lower()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("An account already uses this email address.")
        return value

    def create(self, validated_data):
        validated_data["role"] = User.USER
        user = User.objects.create_user(**validated_data)
        return user


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def validate_email(self, value):
        return value.strip().lower()

    def validate(self, data):
        user = authenticate(username=data["email"], password=data["password"])
        if not user:
            raise serializers.ValidationError("Invalid credentials.")
        if not user.is_active:
            raise serializers.ValidationError("Account is disabled.")
        if not user.email_verified:
            raise serializers.ValidationError({"email": "Verify your email before signing in."})
        refresh = RefreshToken.for_user(user)
        return {
            "refresh": str(refresh),
            "access": str(refresh.access_token),
            "user": UserDetailSerializer(user).data,
        }


class UserDetailSerializer(serializers.ModelSerializer):
    can_create_exam = serializers.SerializerMethodField()
    can_publish_results = serializers.SerializerMethodField()
    can_change_email = serializers.SerializerMethodField()
    email_change_cooldown_days = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id", "email", "full_name", "role", "email_verified",
            "is_active",
            "institution_name", "department", "student_id_number",
            "can_create_exam", "can_publish_results",
            "last_email_changed_at", "pending_email",
            "can_change_email", "email_change_cooldown_days",
            "date_joined",
        ]
        read_only_fields = [
            "id", "email", "date_joined",
            "email_verified", "role", "is_active", "last_email_changed_at",
            "pending_email", "can_change_email", "email_change_cooldown_days",
        ]

    def get_can_change_email(self, user):
        if not user.last_email_changed_at:
            return True
        days_passed = (timezone.now() - user.last_email_changed_at).days
        return days_passed >= 180

    def get_email_change_cooldown_days(self, user):
        if not user.last_email_changed_at:
            return 0
        days_passed = (timezone.now() - user.last_email_changed_at).days
        remaining = 180 - days_passed
        return max(0, remaining)

    def validate_email(self, value):
        value = value.strip().lower()
        duplicates = User.objects.filter(email__iexact=value)
        if self.instance:
            duplicates = duplicates.exclude(pk=self.instance.pk)
        if duplicates.exists():
            raise serializers.ValidationError("An account already uses this email address.")
        return value

    def get_can_create_exam(self, user):
        if user.is_admin:
            return True
        return any(
            membership.role in [CommunityMembership.OWNER, CommunityMembership.MANAGER]
            or (
                membership.role == CommunityMembership.EXAM_CREATOR
                and bool(membership.creator_exam_types)
            )
            for membership in user.memberships.filter(
                is_active=True,
                status=CommunityMembership.APPROVED,
            ).only("role", "creator_exam_types")
        )

    def get_can_publish_results(self, user):
        return self.get_can_create_exam(user)


class AdminUserSerializer(UserDetailSerializer):
    class Meta(UserDetailSerializer.Meta):
        fields = UserDetailSerializer.Meta.fields + ["aadhar_number"]
        read_only_fields = [
            "id", "date_joined", "email_verified", "role",
        ]


class RequestEmailChangeSerializer(serializers.Serializer):
    new_email = serializers.EmailField()

    def validate_new_email(self, value):
        user = self.context["request"].user
        value = value.strip().lower()
        if value == user.email.lower():
            raise serializers.ValidationError("New email must be different from your current email address.")
        if User.objects.filter(email__iexact=value).exclude(pk=user.pk).exists():
            raise serializers.ValidationError("An account already uses this email address.")
        return value


class ConfirmEmailChangeSerializer(serializers.Serializer):
    code = serializers.RegexField(regex=r"^\d{6}$")


class PasswordChangeSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=8)

    def validate_old_password(self, value):
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Old password is incorrect.")
        return value

    def validate_new_password(self, value):
        validate_password(value, user=self.context["request"].user)
        return value

    def save(self, **kwargs):
        user = self.context["request"].user
        user.set_password(self.validated_data["new_password"])
        user.save()
        return user


class CommunitySerializer(serializers.ModelSerializer):
    creator_name = serializers.CharField(source="created_by.full_name", read_only=True)
    my_membership = serializers.SerializerMethodField()
    membership_role = serializers.SerializerMethodField()
    join_status = serializers.SerializerMethodField()
    member_count = serializers.SerializerMethodField()

    class Meta:
        model = Community
        fields = [
            "id",
            "name",
            "organization_type",
            "country",
            "time_zone",
            "created_by",
            "creator_name",
            "my_membership",
            "membership_role",
            "join_status",
            "member_count",
            "created_at",
        ]
        read_only_fields = ["created_by", "created_at"]

    def validate_time_zone(self, value):
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise serializers.ValidationError("Select a valid IANA time zone.") from exc
        return value

    def _get_membership(self, community):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return None
        return community.memberships.filter(user=request.user, is_active=True).first()

    def get_my_membership(self, community):
        membership = self._get_membership(community)
        if not membership:
            return None
        return {
            "role": membership.role,
            "status": membership.status,
            "member_group": membership.member_group,
            "creator_exam_types": membership.creator_exam_types,
        }

    def get_membership_role(self, community):
        membership = self._get_membership(community)
        if membership and membership.status == CommunityMembership.APPROVED:
            return membership.role
        return None

    def get_join_status(self, community):
        membership = self._get_membership(community)
        return membership.status if membership else None

    def get_member_count(self, community):
        return community.memberships.filter(status=CommunityMembership.APPROVED, is_active=True).count()


class CommunityMembershipSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source="user.full_name", read_only=True)
    user_email = serializers.CharField(source="user.email", read_only=True)

    class Meta:
        model = CommunityMembership
        fields = [
            "id",
            "community",
            "user",
            "user_name",
            "user_email",
            "role",
            "status",
            "member_group",
            "creator_exam_types",
            "is_active",
            "joined_at",
        ]
        read_only_fields = ["community", "user", "joined_at"]


class UpdateMembershipRoleSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(write_only=True, required=True)

    class Meta:
        model = CommunityMembership
        fields = ["email", "role", "member_group", "creator_exam_types"]

    creator_exam_types = serializers.MultipleChoiceField(
        choices=tuple((choice, choice) for choice in [
            "practice", "placement", "internal", "member_selection", "other",
        ]),
        required=False,
        default=list,
    )

    def validate(self, attrs):
        if attrs.get("role") != "exam_creator" and attrs.get("creator_exam_types"):
            raise serializers.ValidationError({
                "creator_exam_types": "Only designated exam creators can have assessment-type scopes."
            })
        if attrs.get("role") == "exam_creator" and not attrs.get("creator_exam_types"):
            raise serializers.ValidationError({
                "creator_exam_types": "Select at least one assessment type for this creator."
            })
        if attrs.get("role") == "exam_creator" and not (attrs.get("member_group") or "").strip():
            raise serializers.ValidationError({
                "member_group": "Name the authorized group for this exam creator."
            })
        return attrs


class CommunityInviteSerializer(serializers.ModelSerializer):
    community_name = serializers.CharField(source="community.name", read_only=True)
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True)
    invite_url = serializers.SerializerMethodField()

    class Meta:
        model = CommunityInvite
        fields = [
            "id",
            "community",
            "community_name",
            "token",
            "title",
            "role",
            "member_group",
            "allowed_domain",
            "allowed_emails",
            "max_uses",
            "uses_count",
            "expires_at",
            "is_active",
            "created_by",
            "created_by_name",
            "created_at",
            "invite_url",
        ]
        read_only_fields = ["id", "community", "token", "uses_count", "created_by", "created_at"]

    def get_invite_url(self, obj):
        request = self.context.get("request")
        frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:5173")
        return f"{frontend_url.rstrip('/')}/join/{obj.token}"


class AcceptCommunityInviteSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=64, trim_whitespace=True)
