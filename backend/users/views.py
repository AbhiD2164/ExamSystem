"""
users/views.py — Authentication & user management views (JWT only, no DRF sessions).
"""
import secrets
from datetime import timedelta
from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.core.mail import send_mail
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import generics, permissions, serializers, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from .firebase_auth import (
    generate_firebase_email_verification_link,
    generate_firebase_password_reset_link,
)
from .models import Community, CommunityMembership, CommunityInvite, EmailCode, User
from .permissions import IsAdminUser
from .serializers import (
    AcceptCommunityInviteSerializer,
    AdminUserSerializer,
    CommunityInviteSerializer,
    CommunityMembershipSerializer,
    CommunitySerializer,
    ConfirmEmailChangeSerializer,
    LoginSerializer,
    PasswordChangeSerializer,
    RegisterSerializer,
    RequestEmailChangeSerializer,
    UpdateMembershipRoleSerializer,
    UserDetailSerializer,
)


class RegisterView(generics.CreateAPIView):
    """
    POST /api/auth/register/
    Registration requires unique email address.
    Issues email verification code.
    """
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_register"

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                user = serializer.save()
                issue_email_code(user, EmailCode.VERIFY_EMAIL)
        except IntegrityError:
            return Response(
                {"detail": "An account already uses this email address."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(
            {
                "detail": "A verification code has been sent to your email address.",
                "email": user.email,
            },
            status=status.HTTP_201_CREATED,
        )


def issue_email_code(user, purpose, target_email=None):
    code = f"{secrets.randbelow(1_000_000):06d}"
    target = target_email or user.email
    EmailCode.objects.filter(user=user, purpose=purpose).delete()
    challenge = EmailCode(user=user, purpose=purpose, expires_at=timezone.now() + timedelta(minutes=15))
    challenge.set_code(code)
    challenge.save()

    if purpose == EmailCode.VERIFY_EMAIL:
        subject = "Verify your ExMint email address"
        msg = (
            f"Hello {user.full_name},\n\n"
            f"Your ExMint verification code is: {code}\n"
            f"This code will expire in 15 minutes."
        )
        fb_link = generate_firebase_email_verification_link(target)
        if fb_link:
            msg += f"\n\nYou can also click here to verify with Firebase: {fb_link}"
    elif purpose == EmailCode.RESET_PASSWORD:
        subject = "Your ExMint password reset code"
        msg = (
            f"Hello {user.full_name},\n\n"
            f"Your ExMint password reset code is: {code}\n"
            f"This code will expire in 15 minutes."
        )
        fb_link = generate_firebase_password_reset_link(target)
        if fb_link:
            msg += f"\n\nYou can also click here to reset via Firebase: {fb_link}"
    elif purpose == EmailCode.CHANGE_EMAIL:
        subject = "Confirm your new ExMint email address"
        msg = (
            f"Hello {user.full_name},\n\n"
            f"You requested to change your ExMint account email to this address ({target}).\n\n"
            f"Your 6-digit confirmation code is: {code}\n"
            f"This code expires in 15 minutes.\n\n"
            f"⚠️ Important Alert: Once confirmed, you will not be able to change your email again for 6 months (180 days).\n"
            f"If you did not request this change, please ignore this email."
        )
    else:
        subject = "ExMint Verification Code"
        msg = f"Your verification code is {code}. It expires in 15 minutes."

    send_mail(
        subject,
        msg,
        None,
        [target],
        fail_silently=False,
    )


def consume_email_code(user, purpose, code):
    challenge = EmailCode.objects.filter(user=user, purpose=purpose).order_by("-created_at").first()
    if not challenge or challenge.expires_at <= timezone.now() or challenge.attempts >= 5:
        raise serializers.ValidationError({"code": "The code is invalid or expired."})
    challenge.attempts += 1
    challenge.save(update_fields=["attempts"])
    if not challenge.matches(code):
        raise serializers.ValidationError({"code": "The code is invalid or expired."})
    challenge.delete()


class VerifyEmailView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_verify"

    def post(self, request):
        email = serializers.EmailField().run_validation(request.data.get("email"))
        code = serializers.RegexField(regex=r"^\d{6}$").run_validation(request.data.get("code"))
        user = generics.get_object_or_404(User, email=email)
        if user.email_verified:
            return Response({"detail": "Email is already verified."})
        consume_email_code(user, EmailCode.VERIFY_EMAIL, code)
        user.email_verified = True
        user.save(update_fields=["email_verified"])
        refresh = RefreshToken.for_user(user)
        return Response({
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "user": UserDetailSerializer(user).data,
        })


class ResendVerificationView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_resend"

    def post(self, request):
        email = serializers.EmailField().run_validation(request.data.get("email"))
        user = User.objects.filter(email=email, email_verified=False).first()
        if user:
            issue_email_code(user, EmailCode.VERIFY_EMAIL)
        return Response({"detail": "If the account needs verification, a code has been sent."})


class PasswordResetRequestView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password_reset"

    def post(self, request):
        email = serializers.EmailField().run_validation(request.data.get("email"))
        user = User.objects.filter(email=email, is_active=True, email_verified=True).first()
        if user:
            issue_email_code(user, EmailCode.RESET_PASSWORD)
        return Response({"detail": "If a verified account exists, a reset code has been sent."})


class PasswordResetConfirmView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password_reset_confirm"

    def post(self, request):
        email = serializers.EmailField().run_validation(request.data.get("email"))
        code = serializers.RegexField(regex=r"^\d{6}$").run_validation(request.data.get("code"))
        password = serializers.CharField(write_only=True, min_length=8).run_validation(request.data.get("password"))
        user = generics.get_object_or_404(User, email=email, is_active=True, email_verified=True)
        validate_password(password, user=user)
        consume_email_code(user, EmailCode.RESET_PASSWORD, code)
        user.set_password(password)
        user.save(update_fields=["password"])
        return Response({"detail": "Password reset successfully. You can now sign in."})


class LoginView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_login"

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(serializer.validated_data, status=status.HTTP_200_OK)


class LogoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        try:
            token = RefreshToken(request.data["refresh"])
            token.blacklist()
            return Response({"detail": "Successfully logged out."}, status=status.HTTP_200_OK)
        except Exception:
            return Response({"detail": "Invalid token."}, status=status.HTTP_400_BAD_REQUEST)


class MeView(generics.RetrieveUpdateAPIView):
    """GET/PATCH /api/auth/me/ — current user profile."""
    serializer_class = UserDetailSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user


class PasswordChangeView(APIView):
    """POST /api/auth/change-password/"""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = PasswordChangeSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({"detail": "Password updated."}, status=status.HTTP_200_OK)


class RequestEmailChangeView(APIView):
    """
    POST /api/auth/request-email-change/
    Requests an email change. Enforces validation to allow email changes only once every 180 days (half-year).
    Warns user with alert message and issues verification code to the new email address.
    """
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_verify"

    def post(self, request):
        user = request.user

        # 1. Enforce 180-day (half-year) cooldown
        if user.last_email_changed_at:
            days_passed = (timezone.now() - user.last_email_changed_at).days
            if days_passed < 180:
                remaining_days = 180 - days_passed
                next_date = (user.last_email_changed_at + timedelta(days=180)).strftime("%d %B %Y")
                return Response(
                    {
                        "detail": f"Email change restriction: You can only change your email address once every 6 months (180 days). You may change it again on or after {next_date} ({remaining_days} days remaining).",
                        "remaining_days": remaining_days,
                        "next_allowed_date": next_date,
                        "alert": "Notice: Email address modifications are rate-limited to prevent unauthorized account transfers.",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        # 2. Validate requested new email
        serializer = RequestEmailChangeSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        new_email = serializer.validated_data["new_email"]

        # 3. Save pending email and send code to the new address
        user.pending_email = new_email
        user.save(update_fields=["pending_email"])
        issue_email_code(user, EmailCode.CHANGE_EMAIL, target_email=new_email)

        return Response(
            {
                "detail": f"A 6-digit confirmation code has been sent to {new_email}. Please enter it to complete verification.",
                "pending_email": new_email,
                "alert": "⚠️ Notice: Email address can only be changed once every 6 months (180 days). Please avoid changing your email unnecessarily.",
            },
            status=status.HTTP_200_OK,
        )


class ConfirmEmailChangeView(APIView):
    """
    POST /api/auth/confirm-email-change/
    Verifies the code sent to the new email address and updates the account's primary email.
    """
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_verify"

    def post(self, request):
        user = request.user
        if not user.pending_email:
            return Response(
                {"detail": "No pending email change request found. Please request a change first."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = ConfirmEmailChangeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        code = serializer.validated_data["code"]

        consume_email_code(user, EmailCode.CHANGE_EMAIL, code)

        new_email = user.pending_email
        with transaction.atomic():
            user.email = new_email
            user.pending_email = ""
            user.last_email_changed_at = timezone.now()
            user.save(update_fields=["email", "pending_email", "last_email_changed_at"])

        return Response(
            {
                "detail": f"Email address successfully changed to {new_email}.",
                "user": UserDetailSerializer(user).data,
            },
            status=status.HTTP_200_OK,
        )


# ── Admin-only user management ───────────────────────────────────────────────

class UserListView(generics.ListAPIView):
    """GET /api/auth/users/?role=examiner|student — Admin only."""
    serializer_class = AdminUserSerializer
    permission_classes = [IsAdminUser]

    def get_queryset(self):
        qs = User.objects.all()
        role = self.request.query_params.get("role")
        if role:
            if role in ("student", "examiner"):
                role = User.USER
            qs = qs.filter(role=role)
        return qs


class UserDetailView(generics.RetrieveUpdateDestroyAPIView):
    """GET/PATCH/DELETE /api/auth/users/<id>/ — Admin only."""
    serializer_class = AdminUserSerializer
    permission_classes = [IsAdminUser]
    queryset = User.objects.all()


class CommunityListCreateView(generics.ListCreateAPIView):
    serializer_class = CommunitySerializer

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsAdminUser()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        return Community.objects.all()

    def perform_create(self, serializer):
        community = serializer.save(created_by=self.request.user)
        CommunityMembership.objects.create(
            community=community,
            user=self.request.user,
            role=CommunityMembership.OWNER,
            status=CommunityMembership.APPROVED,
            is_active=True,
        )


class CommunityJoinView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, community_id):
        user = request.user
        if not user.email_verified:
            return Response(
                {"detail": "Verify your registered email before requesting membership."},
                status=status.HTTP_403_FORBIDDEN,
            )
        community = generics.get_object_or_404(Community, pk=community_id)
        membership, created = CommunityMembership.objects.get_or_create(
            community=community,
            user=user,
            defaults={
                "role": CommunityMembership.MEMBER,
                "status": CommunityMembership.PENDING,
                "is_active": False,
            },
        )
        if not created and membership.status == CommunityMembership.REJECTED:
            membership.status = CommunityMembership.PENDING
            membership.is_active = False
            membership.save(update_fields=["status", "is_active"])
        return Response(
            CommunityMembershipSerializer(membership, context={"request": request}).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class CommunityMemberListCreateView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_community(self):
        community = generics.get_object_or_404(Community, pk=self.kwargs["community_id"])
        user = self.request.user
        if user.is_admin:
            return community
        membership = community.memberships.filter(
            user=user,
            is_active=True,
            status=CommunityMembership.APPROVED,
        ).first()
        if not membership or membership.role not in [CommunityMembership.OWNER, CommunityMembership.MANAGER]:
            self.permission_denied(self.request)
        return community

    def get_serializer_class(self):
        if self.request.method == "POST":
            return UpdateMembershipRoleSerializer
        return CommunityMembershipSerializer

    def get_queryset(self):
        return self.get_community().memberships.filter(is_active=True).select_related("user")

    def list(self, request, *args, **kwargs):
        community = self.get_community()
        memberships = community.memberships.filter(
            is_active=True,
            status=CommunityMembership.APPROVED,
        ).select_related("user").order_by("user__full_name")
        return Response([
            {
                "id": item.id,
                "user_id": item.user_id,
                "email": item.user.email,
                "full_name": item.user.full_name,
                "role": item.role,
                "member_group": item.member_group,
                "creator_exam_types": item.creator_exam_types,
            }
            for item in memberships
        ])

    def post(self, request, *args, **kwargs):
        community = self.get_community()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = generics.get_object_or_404(
            User, email__iexact=serializer.validated_data["email"], email_verified=True
        )
        creator_exam_types = list(serializer.validated_data.get("creator_exam_types") or [])
        membership, _ = CommunityMembership.objects.update_or_create(
            community=community,
            user=user,
            defaults={
                "role": serializer.validated_data["role"],
                "creator_exam_types": creator_exam_types,
                "member_group": serializer.validated_data["member_group"],
                "status": CommunityMembership.APPROVED,
                "is_active": True,
            },
        )
        return Response(
            CommunityMembershipSerializer(membership, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )


class CommunityJoinRequestsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_community(self, community_id):
        community = generics.get_object_or_404(Community, pk=community_id)
        user = self.request.user
        if user.is_admin:
            return community
        membership = community.memberships.filter(
            user=user,
            is_active=True,
            status=CommunityMembership.APPROVED,
        ).first()
        if not membership or membership.role not in [CommunityMembership.OWNER, CommunityMembership.MANAGER]:
            self.permission_denied(self.request)
        return community

    def get(self, request, community_id):
        community = self.get_community(community_id)
        requests = community.memberships.filter(
            status=CommunityMembership.PENDING,
        ).select_related("user")
        return Response(CommunityMembershipSerializer(requests, many=True, context={"request": request}).data)

    def patch(self, request, community_id, membership_id):
        community = self.get_community(community_id)
        membership = generics.get_object_or_404(
            CommunityMembership,
            pk=membership_id,
            community=community,
            status=CommunityMembership.PENDING,
        )
        action = request.data.get("action")
        if action == "approve":
            membership.status = CommunityMembership.APPROVED
            membership.is_active = True
        elif action == "reject":
            membership.status = CommunityMembership.REJECTED
            membership.is_active = False
        else:
            return Response({"detail": "Invalid action. Use approve or reject."}, status=400)
        membership.save(update_fields=["status", "is_active"])
        return Response(CommunityMembershipSerializer(membership, context={"request": request}).data)


class CommunityInviteListCreateView(generics.ListCreateAPIView):
    """
    List and create shareable invite links for a community.
    Accessible by community owners, managers, or platform admins.
    """
    serializer_class = CommunityInviteSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_community(self):
        community = generics.get_object_or_404(Community, pk=self.kwargs["community_id"])
        user = self.request.user
        if user.is_admin:
            return community
        membership = community.memberships.filter(
            user=user,
            is_active=True,
            status=CommunityMembership.APPROVED,
        ).first()
        if not membership or membership.role not in [CommunityMembership.OWNER, CommunityMembership.MANAGER]:
            self.permission_denied(self.request)
        return community

    def get_queryset(self):
        return self.get_community().invites.filter(is_active=True).select_related("community", "created_by")

    def perform_create(self, serializer):
        community = self.get_community()
        token = secrets.token_urlsafe(16)
        serializer.save(
            community=community,
            token=token,
            created_by=self.request.user,
        )


class CommunityInviteDetailView(generics.RetrieveDestroyAPIView):
    """
    Deactivate or delete an invite link.
    """
    serializer_class = CommunityInviteSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        community = generics.get_object_or_404(Community, pk=self.kwargs["community_id"])
        user = self.request.user
        if not user.is_admin:
            membership = community.memberships.filter(
                user=user,
                is_active=True,
                status=CommunityMembership.APPROVED,
            ).first()
            if not membership or membership.role not in [CommunityMembership.OWNER, CommunityMembership.MANAGER]:
                self.permission_denied(self.request)
        return community.invites.all()

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save(update_fields=["is_active"])


class CommunityInviteInfoView(APIView):
    """
    GET /api/communities/invite-info/<token>/
    Public endpoint for examinees/students/employees who clicked an invite link.
    Returns community overview, domain requirements, and verification requirements.
    """
    permission_classes = [permissions.AllowAny]

    def get(self, request, token):
        invite = generics.get_object_or_404(CommunityInvite, token=token, is_active=True)
        if invite.expires_at and timezone.now() > invite.expires_at:
            return Response(
                {"detail": "This community invite link has expired.", "is_expired": True},
                status=status.HTTP_410_GONE,
            )
        if invite.max_uses and invite.uses_count >= invite.max_uses:
            return Response(
                {"detail": "This community invite link has reached its maximum capacity.", "is_full": True},
                status=status.HTTP_410_GONE,
            )
        return Response({
            "token": invite.token,
            "community_id": invite.community_id,
            "community_name": invite.community.name,
            "organization_type": invite.community.organization_type,
            "title": invite.title or f"Join {invite.community.name}",
            "member_group": invite.member_group,
            "allowed_domain": invite.allowed_domain,
            "requires_domain": bool(invite.allowed_domain),
            "role": invite.role,
        })


class JoinCommunityByInviteView(APIView):
    """
    POST /api/communities/join-by-invite/
    Candidate/student/employee submits the invite token to join the community.
    Validates email verification, domain match, and candidate whitelist.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = AcceptCommunityInviteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        token = serializer.validated_data["token"]

        invite = generics.get_object_or_404(CommunityInvite, token=token, is_active=True)
        user = request.user

        if not user.email_verified:
            return Response(
                {"detail": "Please verify your email address before joining this organization community."},
                status=status.HTTP_403_FORBIDDEN,
            )

        is_valid, error_msg = invite.validate_for_user(user)
        if not is_valid:
            return Response({"detail": error_msg}, status=status.HTTP_400_BAD_REQUEST)

        # Successfully join or upgrade membership
        membership, created = CommunityMembership.objects.update_or_create(
            community=invite.community,
            user=user,
            defaults={
                "role": invite.role,
                "member_group": invite.member_group or "",
                "status": CommunityMembership.APPROVED,
                "is_active": True,
            },
        )
        invite.uses_count += 1
        invite.save(update_fields=["uses_count"])

        return Response(
            {
                "detail": f"Successfully joined {invite.community.name}!",
                "community": CommunitySerializer(invite.community, context={"request": request}).data,
                "membership": CommunityMembershipSerializer(membership, context={"request": request}).data,
            },
            status=status.HTTP_200_OK,
        )
