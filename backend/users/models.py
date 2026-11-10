"""User accounts, email verification codes, and community membership."""
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.db.models.functions import Lower
from django.utils import timezone
from django.contrib.auth.hashers import check_password, make_password


class UserManager(BaseUserManager):
    def get_by_natural_key(self, username):
        return self.get(email__iexact=username)
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("Email is required")
        email = self.normalize_email(email).lower()
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("role", User.ADMIN)
        extra_fields.setdefault("email_verified", True)
        return self.create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    ADMIN = "admin"
    USER = "user"

    ROLE_CHOICES = [
        (ADMIN, "Admin"),
        (USER, "User"),
    ]

    email = models.EmailField(unique=True)
    last_email_changed_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Timestamp when the email was last changed"
    )
    pending_email = models.EmailField(
        blank=True,
        default="",
        help_text="Pending new email address waiting for verification"
    )
    full_name = models.CharField(max_length=255)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default=USER)
    email_verified = models.BooleanField(default=False)
    
    # Institution & Departmental Hierarchy
    institution_name = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="School, University, or Institution name"
    )
    department = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="Department, Faculty, or Program name"
    )
    student_id_number = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="Official Student ID, Roll Number, or Faculty Employee ID"
    )

    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(default=timezone.now)

    # Kept for compatibility with existing accounts and data migrations.
    can_create_exam = models.BooleanField(default=False)
    can_publish_results = models.BooleanField(default=False)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["full_name"]

    objects = UserManager()

    class Meta:
        verbose_name = "User"
        ordering = ["-date_joined"]
        constraints = [
            models.UniqueConstraint(Lower("email"), name="unique_user_email_ci"),
        ]

    def __str__(self):
        return f"{self.full_name} <{self.email}> [{self.role}]"

    @property
    def is_admin(self):
        return self.role == self.ADMIN

    @property
    def is_examiner(self):
        memberships = self.memberships.filter(
            status=CommunityMembership.APPROVED,
            is_active=True,
        ).only("role", "creator_exam_types")
        return any(
            membership.role in (CommunityMembership.OWNER, CommunityMembership.MANAGER)
            or (
                membership.role == CommunityMembership.EXAM_CREATOR
                and bool(membership.creator_exam_types)
            )
            for membership in memberships
        )

    @property
    def is_student(self):
        return not self.is_admin


class Community(models.Model):
    SCHOOL = "school"
    COLLEGE = "college"
    COMPANY = "company"
    OTHER = "other"
    ORGANIZATION_TYPE_CHOICES = [
        (SCHOOL, "School"),
        (COLLEGE, "College / university"),
        (COMPANY, "Company / employer"),
        (OTHER, "Other organization"),
    ]

    name = models.CharField(max_length=255)
    organization_type = models.CharField(
        max_length=16,
        choices=ORGANIZATION_TYPE_CHOICES,
        default=OTHER,
    )
    country = models.CharField(max_length=100, blank=True)
    time_zone = models.CharField(max_length=64, default="UTC")
    created_by = models.ForeignKey(
        "users.User", on_delete=models.PROTECT, related_name="owned_communities"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class CommunityMembership(models.Model):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    STATUS_CHOICES = [
        (PENDING, "Pending approval"),
        (APPROVED, "Approved"),
        (REJECTED, "Rejected"),
    ]

    OWNER = "owner"
    MANAGER = "manager"
    EXAM_CREATOR = "exam_creator"
    MEMBER = "member"
    ROLE_CHOICES = [
        (OWNER, "Owner"),
        (MANAGER, "Manager"),
        (EXAM_CREATOR, "Exam creator"),
        (MEMBER, "Member"),
    ]

    community = models.ForeignKey(Community, on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="memberships")
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default=MEMBER)
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default=APPROVED)
    member_group = models.CharField(max_length=100, blank=True, default="")
    creator_exam_types = models.JSONField(default=list, blank=True)
    is_active = models.BooleanField(default=True)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["community", "user"], name="unique_community_membership")
        ]


class CommunityInvite(models.Model):
    """
    Shareable group invite link for organizations, colleges, and employers.
    Enables candidates, students, or employees to join official communities.
    """
    community = models.ForeignKey(Community, on_delete=models.CASCADE, related_name="invites")
    token = models.CharField(max_length=64, unique=True, db_index=True)
    title = models.CharField(max_length=255, blank=True, help_text="e.g. Campus Recruitment 2026, CS Dept Batch A")
    role = models.CharField(max_length=20, choices=CommunityMembership.ROLE_CHOICES, default=CommunityMembership.MEMBER)
    member_group = models.CharField(max_length=100, blank=True, default="")
    
    # Optional security restrictions
    allowed_domain = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="Optional domain constraint, e.g. 'iitb.ac.in' or 'google.com'"
    )
    allowed_emails = models.TextField(
        blank=True,
        default="",
        help_text="Optional comma/newline separated emails authorized for this invite"
    )
    max_uses = models.PositiveIntegerField(null=True, blank=True, help_text="Null for unlimited uses")
    uses_count = models.PositiveIntegerField(default=0)
    expires_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="created_invites"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Invite for {self.community.name} ({self.title or self.token[:8]})"

    def get_allowed_email_list(self):
        if not self.allowed_emails:
            return set()
        import re
        raw = re.split(r'[\r\n,\s]+', self.allowed_emails)
        return {e.strip().lower() for e in raw if e and "@" in e}

    def validate_for_user(self, user):
        """
        Validates if a user is eligible to join via this invite.
        Returns (is_valid: bool, error_message: str)
        """
        if not self.is_active:
            return False, "This invite link has been deactivated by the organization."
        if self.expires_at and timezone.now() > self.expires_at:
            return False, "This invite link has expired."
        if self.max_uses and self.uses_count >= self.max_uses:
            return False, "This invite link has reached its maximum participant limit."
        
        user_email = (user.email or "").strip().lower()
        if not user_email:
            return False, "A verified email address is required to join."
        
        if self.allowed_domain:
            domain = self.allowed_domain.strip().lower().lstrip("@")
            if not user_email.endswith(f"@{domain}"):
                return False, f"This group requires an official organization email address ending in @{domain}."

        allowed_list = self.get_allowed_email_list()
        if allowed_list and user_email not in allowed_list:
            return False, "Your email is not on the authorized candidate/participant list for this invite."

        return True, ""


class EmailCode(models.Model):
    VERIFY_EMAIL = "verify_email"
    RESET_PASSWORD = "reset_password"
    CHANGE_EMAIL = "change_email"
    PURPOSE_CHOICES = [
        (VERIFY_EMAIL, "Verify email"),
        (RESET_PASSWORD, "Reset password"),
        (CHANGE_EMAIL, "Change email"),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="email_codes")
    purpose = models.CharField(max_length=20, choices=PURPOSE_CHOICES)
    code_hash = models.CharField(max_length=128)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    def set_code(self, code):
        self.code_hash = make_password(code)

    def matches(self, code):
        return check_password(code, self.code_hash)
