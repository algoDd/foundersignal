"""Auth routes — Supabase email/password sign-up and sign-in."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.services.supabase_service import get_current_user, get_supabase_service

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


def _to_auth_response(data: dict) -> AuthResponse:
    user = data.get("user") or {}
    session = data.get("session") or data
    return AuthResponse(
        id_token=session["access_token"],
        refresh_token=session["refresh_token"],
        expires_in=str(session["expires_in"]),
        email=user["email"],
        local_id=user["id"],
    )


@router.post("/sign-up", response_model=AuthResponse)
async def sign_up(payload: AuthRequest) -> AuthResponse:
    """Create a Supabase email/password user and return a session token."""
    service = get_supabase_service()
    return _to_auth_response(await service.sign_up(payload.email, payload.password))


@router.post("/sign-in", response_model=AuthResponse)
async def sign_in(payload: AuthRequest) -> AuthResponse:
    """Sign in a Supabase email/password user and return a session token."""
    service = get_supabase_service()
    return _to_auth_response(await service.sign_in(payload.email, payload.password))


@router.get("/me")
async def me(user: dict = Depends(get_current_user)) -> dict:
    """Return the currently authenticated Supabase user."""
    return {
        "uid": user.get("uid"),
        "email": user.get("email"),
    }
