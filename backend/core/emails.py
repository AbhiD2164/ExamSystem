"""
core/emails.py
Transactional Email Notification Helper for ExMint LMS.
Supports Supabase SMTP, Brevo, Resend, and standard Django Email Backends.
"""
import logging
from django.core.mail import send_mail
from django.conf import settings

logger = logging.getLogger(__name__)


def send_exam_notification_email(recipient_email: str, recipient_name: str, exam_title: str, start_time: str, duration: int):
    """Notify student about an enrolled or assigned exam."""
    subject = f"Upcoming Exam Notice: {exam_title} | ExMint LMS"
    message = (
        f"Hello {recipient_name},\n\n"
        f"You have been registered for the following examination on the ExMint LMS platform:\n\n"
        f"Exam: {exam_title}\n"
        f"Start Date & Time: {start_time}\n"
        f"Duration: {duration} minutes\n\n"
        f"Please ensure you join with a functioning webcam and microphone on modern Chromium/Firefox browsers.\n\n"
        f"Best regards,\n"
        f"ExMint Examination Board"
    )
    try:
        send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[recipient_email],
            fail_silently=True,
        )
        logger.info(f"Exam notification sent to {recipient_email}")
        return True
    except Exception as e:
        logger.warning(f"Failed to send email to {recipient_email}: {e}")
        return False


def send_results_published_email(recipient_email: str, recipient_name: str, exam_title: str, score: float, total: float):
    """Notify student that their exam result and AI evaluation feedback are now accessible."""
    subject = f"Results Published: {exam_title} | ExMint LMS"
    message = (
        f"Dear {recipient_name},\n\n"
        f"Your results for the examination '{exam_title}' have been officially evaluated and published.\n\n"
        f"Score: {score} / {total}\n\n"
        f"Log in to your ExMint student portal to review the comprehensive question-by-question breakdown, "
        f"semantic evaluation rubrics, and examiner feedback.\n\n"
        f"Best regards,\n"
        f"ExMint Examination Board"
    )
    try:
        send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[recipient_email],
            fail_silently=True,
        )
        return True
    except Exception as e:
        logger.warning(f"Failed to send result email to {recipient_email}: {e}")
        return False
