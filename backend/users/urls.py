"""
users/urls.py — Auth routes (no DRF default login/logout browsable views).
"""
from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    RegisterView,
    LoginView,
    LogoutView,
    MeView,
    PasswordChangeView,
    RequestEmailChangeView,
    ConfirmEmailChangeView,
    UserListView,
    UserDetailView,
    VerifyEmailView,
    ResendVerificationView,
    PasswordResetRequestView,
    PasswordResetConfirmView,
    CommunityListCreateView,
    CommunityMemberListCreateView,
    CommunityJoinView,
    CommunityJoinRequestsView,
    CommunityInviteListCreateView,
    CommunityInviteDetailView,
    CommunityInviteInfoView,
    JoinCommunityByInviteView,
)

urlpatterns = [
    # Auth
    path("register/", RegisterView.as_view(), name="auth-register"),
    path("verify-email/", VerifyEmailView.as_view(), name="auth-verify-email"),
    path("resend-verification/", ResendVerificationView.as_view(), name="auth-resend-verification"),
    path("password-reset/request/", PasswordResetRequestView.as_view(), name="password-reset-request"),
    path("password-reset/confirm/", PasswordResetConfirmView.as_view(), name="password-reset-confirm"),
    path("login/", LoginView.as_view(), name="auth-login"),
    path("logout/", LogoutView.as_view(), name="auth-logout"),
    path("token/refresh/", TokenRefreshView.as_view(), name="token-refresh"),

    # Current user
    path("me/", MeView.as_view(), name="auth-me"),
    path("change-password/", PasswordChangeView.as_view(), name="auth-change-password"),
    path("request-email-change/", RequestEmailChangeView.as_view(), name="auth-request-email-change"),
    path("confirm-email-change/", ConfirmEmailChangeView.as_view(), name="auth-confirm-email-change"),

    # Admin user management
    path("users/", UserListView.as_view(), name="user-list"),
    path("users/<int:pk>/", UserDetailView.as_view(), name="user-detail"),
    path("communities/", CommunityListCreateView.as_view(), name="community-list-create"),
    path("communities/<int:community_id>/members/", CommunityMemberListCreateView.as_view(), name="community-members"),
    path("communities/<int:community_id>/join/", CommunityJoinView.as_view(), name="community-join"),
    path("communities/<int:community_id>/join-requests/", CommunityJoinRequestsView.as_view(), name="community-join-requests"),
    path("communities/<int:community_id>/join-requests/<int:membership_id>/", CommunityJoinRequestsView.as_view(), name="community-join-request-detail"),
    path("communities/<int:community_id>/invites/", CommunityInviteListCreateView.as_view(), name="community-invites"),
    path("communities/<int:community_id>/invites/<int:pk>/", CommunityInviteDetailView.as_view(), name="community-invite-detail"),
    path("communities/invite-info/<str:token>/", CommunityInviteInfoView.as_view(), name="community-invite-info"),
    path("communities/join-by-invite/", JoinCommunityByInviteView.as_view(), name="community-join-by-invite"),
]
