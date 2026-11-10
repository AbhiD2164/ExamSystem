"""
core/exceptions.py
Standardized REST Framework custom exception handler for ExMint.
Ensures consistent, unambiguous JSON error responses across all endpoints.
"""
from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status
from django.http import Http404
from django.core.exceptions import PermissionDenied, ObjectDoesNotExist
from datetime import datetime, timezone


def custom_exception_handler(exc, context):
    """
    Standardize all API error outputs to:
    {
        "success": False,
        "status_code": <int>,
        "error": "<Error Type>",
        "detail": "<Human readable message>",
        "field_errors": { ... } (optional if validation error),
        "path": "<request_path>",
        "timestamp": "<iso_timestamp>"
    }
    """
    # Call REST framework's default exception handler first to get standard response
    response = exception_handler(exc, context)

    request = context.get("request")
    path = request.path if request else ""
    now_iso = datetime.now(timezone.utc).isoformat()

    # If DRF couldn't handle it, inspect standard Django exceptions
    if response is None:
        if isinstance(exc, (Http404, ObjectDoesNotExist)):
            return Response(
                {
                    "success": False,
                    "status_code": status.HTTP_404_NOT_FOUND,
                    "error": "Not Found",
                    "detail": str(exc) or "The requested resource was not found on this server.",
                    "path": path,
                    "timestamp": now_iso,
                },
                status=status.HTTP_404_NOT_FOUND,
            )
        elif isinstance(exc, PermissionDenied):
            return Response(
                {
                    "success": False,
                    "status_code": status.HTTP_403_FORBIDDEN,
                    "error": "Permission Denied",
                    "detail": "You do not have permission to perform this action.",
                    "path": path,
                    "timestamp": now_iso,
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        else:
            # Internal server error
            return Response(
                {
                    "success": False,
                    "status_code": status.HTTP_500_INTERNAL_SERVER_ERROR,
                    "error": "Internal Server Error",
                    "detail": "An unexpected error occurred. Please contact the administrator.",
                    "path": path,
                    "timestamp": now_iso,
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    # Standardize DRF handled responses
    data = response.data
    status_code = response.status_code

    error_type = "API Error"
    detail = "An error occurred."
    field_errors = None

    if status_code == 400:
        error_type = "Bad Request / Validation Error"
        if isinstance(data, dict):
            if "detail" in data:
                detail = str(data["detail"])
            else:
                detail = "Please verify your input fields."
                field_errors = data
        elif isinstance(data, list):
            detail = data[0] if data else "Validation failed."
    elif status_code == 401:
        error_type = "Unauthorized"
        detail = data.get("detail", "Authentication credentials were not provided or have expired.") if isinstance(data, dict) else str(data)
    elif status_code == 403:
        error_type = "Forbidden"
        detail = data.get("detail", "You do not have permission to access this resource.") if isinstance(data, dict) else str(data)
    elif status_code == 404:
        error_type = "Not Found"
        detail = data.get("detail", "The requested user, exam, or submission was not found.") if isinstance(data, dict) else str(data)
    elif status_code == 405:
        error_type = "Method Not Allowed"
        detail = data.get("detail", f"Method not allowed on {path}.") if isinstance(data, dict) else str(data)
    else:
        detail = data.get("detail", str(data)) if isinstance(data, dict) else str(data)

    formatted_response = {
        "success": False,
        "status_code": status_code,
        "error": error_type,
        "detail": detail,
        "path": path,
        "timestamp": now_iso,
    }

    if field_errors:
        formatted_response["field_errors"] = field_errors

    response.data = formatted_response
    return response
