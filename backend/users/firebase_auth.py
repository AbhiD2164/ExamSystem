import json
import logging
from threading import Lock
from django.conf import settings

logger = logging.getLogger(__name__)

try:
    import firebase_admin
    from firebase_admin import auth, credentials
    FIREBASE_ADMIN_AVAILABLE = True
except ImportError:
    firebase_admin = None
    auth = None
    credentials = None
    FIREBASE_ADMIN_AVAILABLE = False


class FirebaseConfigurationError(Exception):
    pass


_firebase_app_lock = Lock()


def get_firebase_app():
    """Initializes or retrieves the Firebase Admin app."""
    if not FIREBASE_ADMIN_AVAILABLE or not getattr(settings, "FIREBASE_PROJECT_ID", None):
        return None

    with _firebase_app_lock:
        try:
            return firebase_admin.get_app()
        except ValueError:
            pass

        if getattr(settings, "FIREBASE_CREDENTIALS_JSON", None):
            try:
                service_account = json.loads(settings.FIREBASE_CREDENTIALS_JSON)
                credential = credentials.Certificate(service_account)
            except (json.JSONDecodeError, OSError, ValueError) as exc:
                raise FirebaseConfigurationError(
                    "FIREBASE_CREDENTIALS_JSON is not a valid service-account credential."
                ) from exc
        elif getattr(settings, "FIREBASE_CREDENTIALS_FILE", None):
            try:
                credential = credentials.Certificate(settings.FIREBASE_CREDENTIALS_FILE)
            except (OSError, ValueError) as exc:
                raise FirebaseConfigurationError(
                    "FIREBASE_CREDENTIALS_FILE could not be loaded."
                ) from exc
        else:
            return None

        return firebase_admin.initialize_app(
            credential,
            {"projectId": settings.FIREBASE_PROJECT_ID},
        )


def generate_firebase_email_verification_link(email):
    """Generates a secure email verification link via Firebase Auth if configured."""
    app = get_firebase_app()
    if not app or not auth:
        return None
    try:
        return auth.generate_email_verification_link(email, app=app)
    except Exception as exc:
        logger.warning("Could not generate Firebase email verification link: %s", exc)
        return None


def generate_firebase_password_reset_link(email):
    """Generates a secure password reset link via Firebase Auth if configured."""
    app = get_firebase_app()
    if not app or not auth:
        return None
    try:
        return auth.generate_password_reset_link(email, app=app)
    except Exception as exc:
        logger.warning("Could not generate Firebase password reset link: %s", exc)
        return None
