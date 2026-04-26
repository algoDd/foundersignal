"""Auth routes — Firebase email/password sign-up and sign-in."""

from __future__ import annotations

import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.config import get_settings
from app.services.firebase_admin import get_current_user

logger = logging.getLogger("foundersignal.routes.auth")

router = APIRouter()


class AuthRequest(BaseModel):
    email: str
    password: str = Field(..., min_length=8, max_length=128)


class AuthResponse(BaseModel):
    id_token: str
    refresh_token: str
    expires_in: str
    email: str
    local_id: str


def _auth_url(path: str) -> str:
    settings = get_settings()
    if not settings.firebase_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Firebase web API key is not configured",
        )
    return f"https://identitytoolkit.googleapis.com/v1/{path}?key={settings.firebase_api_key}"


async def _exchange_email_password(path: str, payload: AuthRequest) -> AuthResponse:
    body = {
        "email": payload.email,
        "password": payload.password,
        "returnSecureToken": True,
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(_auth_url(path), json=body)
            response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        error_payload = exc.response.json() if exc.response.headers.get("content-type", "").startswith("application/json") else {}
        firebase_message = (
            error_payload.get("error", {}).get("message")
            if isinstance(error_payload, dict)
            else None
        )
        logger.warning("Firebase auth request failed: %s", exc.response.text)

        if firebase_message == "CONFIGURATION_NOT_FOUND":
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=(
                    "Firebase Authentication is not configured for this project. "
                    "Check that FIREBASE_API_KEY belongs to the same Firebase project, "
                    "Firebase Authentication is enabled, and Email/Password sign-in is turned on."
                ),
            ) from exc

        if firebase_message in {"EMAIL_NOT_FOUND", "INVALID_PASSWORD", "INVALID_LOGIN_CREDENTIALS"}:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password",
            ) from exc

        if firebase_message == "EMAIL_EXISTS":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An account with this email already exists",
            ) from exc

        if firebase_message == "OPERATION_NOT_ALLOWED":
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Email/password sign-in is disabled in Firebase Authentication",
            ) from exc

        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Firebase auth error: {firebase_message or 'unknown_error'}",
        ) from exc
    except httpx.HTTPError as exc:
        logger.error("Firebase auth transport error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication provider unavailable",
        ) from exc

    data = response.json()
    return AuthResponse(
        id_token=data["idToken"],
        refresh_token=data["refreshToken"],
        expires_in=data["expiresIn"],
        email=data["email"],
        local_id=data["localId"],
    )


@router.post("/sign-up", response_model=AuthResponse)
async def sign_up(payload: AuthRequest) -> AuthResponse:
    """Create a Firebase email/password user and return an ID token."""
    return await _exchange_email_password("accounts:signUp", payload)


@router.post("/sign-in", response_model=AuthResponse)
async def sign_in(payload: AuthRequest) -> AuthResponse:
    """Sign in a Firebase email/password user and return an ID token."""
    return await _exchange_email_password("accounts:signInWithPassword", payload)


@router.get("/me")
async def me(user: dict = Depends(get_current_user)) -> dict:
    """Return the currently authenticated Firebase user."""
    return {
        "uid": user.get("uid"),
        "email": user.get("email"),
    }
