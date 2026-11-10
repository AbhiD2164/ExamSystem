import re
from datetime import timedelta

from django.core import mail
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from .models import Community, CommunityInvite, CommunityMembership, EmailCode, User


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class AccountFlowTests(APITestCase):
    """
    Email-only registration / verification / password-reset flow.
    No Aadhar, no SMS.
    """

    def test_signup_requires_email_verification_before_login(self):
        response = self.client.post(reverse("auth-register"), {
            "email": "member@example.com",
            "full_name": "Example Member",
            "password": "Agile!Cobalt_River_8472",
        }, format="json")

        self.assertEqual(response.status_code, 201)
        self.assertNotIn("access", response.data)
        user = User.objects.get(email="member@example.com")
        self.assertEqual(user.role, User.USER)
        self.assertFalse(user.email_verified)

        # Login before verification should fail
        self.assertEqual(self.client.post(reverse("auth-login"), {
            "email": user.email,
            "password": "Agile!Cobalt_River_8472",
        }, format="json").status_code, 400)

        # Consume verification email code
        self.assertGreater(len(mail.outbox), 0, "Verification email was not sent")
        code = re.search(r"\b\d{6}\b", mail.outbox[-1].body).group()
        self.client.raise_request_exception = False
        response = self.client.post(reverse("auth-verify-email"), {
            "email": user.email,
            "code": code,
        }, format="json")
        self.client.raise_request_exception = True
        if response.status_code == 500:
            # Print response to debug
            print("VERIFY EMAIL 500 body:", getattr(response, "content", b"")[:500])
        self.assertEqual(response.status_code, 200)
        self.assertTrue(User.objects.get(pk=user.pk).email_verified)
        self.assertIn("access", response.data)

    def test_signup_rejects_duplicate_email_case_insensitively(self):
        User.objects.create_user(
            email="member@example.com",
            password="Agile!Cobalt_River_8472",
            full_name="Existing Member",
        )
        response = self.client.post(reverse("auth-register"), {
            "email": "MEMBER@EXAMPLE.COM",
            "full_name": "Another Member",
            "password": "Agile!Cobalt_River_8472",
        }, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(User.objects.count(), 1)

    def test_password_reset_uses_expiring_email_code(self):
        user = User.objects.create_user(
            email="reset@example.com",
            password="Agile!Cobalt_River_8472",
            full_name="Reset Member",
            role=User.USER,
            email_verified=True,
        )
        self.client.post(reverse("password-reset-request"), {"email": user.email}, format="json")
        code = re.search(r"\b\d{6}\b", mail.outbox[-1].body).group()
        response = self.client.post(reverse("password-reset-confirm"), {
            "email": user.email,
            "code": code,
            "password": "Harbor!Maple_Stone_3928",
        }, format="json")

        self.assertEqual(response.status_code, 200)
        login = self.client.post(reverse("auth-login"), {
            "email": user.email,
            "password": "Harbor!Maple_Stone_3928",
        }, format="json")
        self.assertEqual(login.status_code, 200)

    def test_email_change_cooldown_is_enforced(self):
        """Email changes are locked for 180 days after the last change."""
        user = User.objects.create_user(
            email="cooldown@example.com",
            password="Agile!Cobalt_River_8472",
            full_name="Cooldown User",
            email_verified=True,
            last_email_changed_at=timezone.now() - timedelta(days=10),
        )
        self.client.force_authenticate(user)
        response = self.client.post(reverse("auth-request-email-change"), {
            "new_email": "new@example.com",
        }, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("days", response.data.get("detail", ""))

    def test_community_owner_can_add_verified_member_as_exam_creator(self):
        owner = User.objects.create_user(
            email="owner@example.com",
            password="Agile!Cobalt_River_8472",
            full_name="Community Owner",
            role=User.USER,
            email_verified=True,
        )
        member = User.objects.create_user(
            email="creator@example.com",
            password="Agile!Cobalt_River_8472",
            full_name="Community Creator",
            role=User.USER,
            email_verified=True,
        )
        self.client.force_authenticate(owner)
        response = self.client.post(reverse("community-list-create"), {
            "name": "Unapproved College",
            "country": "US",
            "time_zone": "America/New_York",
        }, format="json")
        self.assertEqual(response.status_code, 403)
        community = Community.objects.create(
            name="North College",
            country="US",
            time_zone="America/New_York",
            created_by=owner,
        )
        CommunityMembership.objects.create(
            community=community,
            user=owner,
            role=CommunityMembership.OWNER,
        )

        response = self.client.post(
            reverse("community-members", args=[community.pk]),
            {
                "email": member.email,
                "role": CommunityMembership.EXAM_CREATOR,
                "member_group": "Training and Placement Cell",
                "creator_exam_types": ["placement"],
            },
            format="json",
        )
        self.assertIn(response.status_code, [200, 201])
        self.assertTrue(member.memberships.filter(
            community=community,
            role=CommunityMembership.EXAM_CREATOR,
        ).exists())

    def test_community_invite_link_allows_eligible_user_to_join(self):
        """Invite token validates domain/email list and creates membership."""
        owner = User.objects.create_user(
            email="invite-owner@example.com",
            password="Agile!Cobalt_River_8472",
            full_name="Invite Owner",
            email_verified=True,
        )
        candidate = User.objects.create_user(
            email="candidate@college.edu",
            password="Agile!Cobalt_River_8472",
            full_name="Eligible Candidate",
            email_verified=True,
        )
        community = Community.objects.create(name="College of Invites", created_by=owner)
        CommunityMembership.objects.create(
            community=community, user=owner, role=CommunityMembership.OWNER,
        )
        invite = CommunityInvite.objects.create(
            community=community,
            token="test-invite-token-abc123",
            role=CommunityMembership.MEMBER,
            allowed_domain="college.edu",
            is_active=True,
        )

        # Public invite info endpoint
        info_response = self.client.get(
            reverse("community-invite-info", args=[invite.token])
        )
        self.assertEqual(info_response.status_code, 200)
        self.assertEqual(info_response.data["community_name"], "College of Invites")
        self.assertTrue(info_response.data["requires_domain"])

        # Eligible user joins
        self.client.force_authenticate(candidate)
        join_response = self.client.post(
            reverse("community-join-by-invite"),
            {"token": invite.token},
            format="json",
        )
        self.assertEqual(join_response.status_code, 200)
        self.assertTrue(
            CommunityMembership.objects.filter(
                community=community,
                user=candidate,
                status=CommunityMembership.APPROVED,
            ).exists()
        )
        invite.refresh_from_db()
        self.assertEqual(invite.uses_count, 1)

    def test_invite_domain_restriction_blocks_wrong_email(self):
        """Users whose email doesn't match the allowed domain cannot join."""
        owner = User.objects.create_user(
            email="domain-owner@example.com",
            password="Agile!Cobalt_River_8472",
            full_name="Domain Owner",
            email_verified=True,
        )
        outsider = User.objects.create_user(
            email="outsider@otherdomain.com",
            password="Agile!Cobalt_River_8472",
            full_name="Outsider",
            email_verified=True,
        )
        community = Community.objects.create(name="Domain Restricted", created_by=owner)
        invite = CommunityInvite.objects.create(
            community=community,
            token="domain-restricted-token-xyz",
            role=CommunityMembership.MEMBER,
            allowed_domain="college.edu",
            is_active=True,
        )
        self.client.force_authenticate(outsider)
        response = self.client.post(
            reverse("community-join-by-invite"),
            {"token": invite.token},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("college.edu", response.data.get("detail", ""))
        self.assertFalse(CommunityMembership.objects.filter(community=community, user=outsider).exists())

    def test_community_membership_is_pending_until_admin_approval(self):
        owner = User.objects.create_user(
            email="approval-owner@example.com",
            password="Agile!Cobalt_River_8472",
            full_name="Community Owner",
            email_verified=True,
        )
        member = User.objects.create_user(
            email="approval-member@example.com",
            password="Agile!Cobalt_River_8472",
            full_name="Requested Member",
            email_verified=True,
        )
        community = Community.objects.create(name="Approval College", created_by=owner)
        CommunityMembership.objects.create(
            community=community,
            user=owner,
            role=CommunityMembership.OWNER,
        )

        self.client.force_authenticate(member)
        response = self.client.post(reverse("community-join", args=[community.pk]))
        self.assertIn(response.status_code, [200, 201, 202])
        membership = CommunityMembership.objects.get(community=community, user=member)
        self.assertEqual(membership.status, CommunityMembership.PENDING)
        self.assertFalse(membership.is_active)

        self.client.force_authenticate(owner)
        response = self.client.get(reverse("community-join-requests", args=[community.pk]))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        response = self.client.patch(
            reverse("community-join-request-detail", args=[community.pk, membership.pk]),
            {"action": "approve"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        membership.refresh_from_db()
        self.assertEqual(membership.status, CommunityMembership.APPROVED)
        self.assertTrue(membership.is_active)

    def test_platform_admin_creates_an_employer_community(self):
        admin = User.objects.create_superuser(
            email="platform-admin@example.com",
            password="Agile!Cobalt_River_8472",
            full_name="Platform Admin",
        )
        self.client.force_authenticate(admin)
        response = self.client.post(reverse("community-list-create"), {
            "name": "Example Employer",
            "organization_type": "company",
            "country": "US",
            "time_zone": "America/New_York",
        }, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        community = Community.objects.get(pk=response.data["id"])
        self.assertEqual(community.organization_type, Community.COMPANY)
        self.assertEqual(response.data["membership_role"], CommunityMembership.OWNER)
