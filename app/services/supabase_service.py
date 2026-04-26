"""Supabase auth and persistence helpers."""

from __future__ import annotations

import logging
from typing import Any

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import get_settings

logger = logging.getLogger("foundersignal.supabase")

security = HTTPBearer(auto_error=False)


class SupabaseService:
    """Thin wrapper around Supabase Auth and PostgREST APIs."""

    def __init__(self) -> None:
        settings = get_settings()
        self.url = settings.supabase_url.rstrip("/")
        self.anon_key = settings.supabase_key
        self.service_role_key = settings.supabase_secret_key

    @property
    def enabled(self) -> bool:
        return bool(self.url and self.anon_key)

    @property
    def persistence_enabled(self) -> bool:
        return bool(self.url and self.service_role_key)

    def _auth_headers(self, bearer_token: str | None = None) -> dict[str, str]:
        headers = {
            "apikey": self.anon_key,
            "Content-Type": "application/json",
        }
        if bearer_token:
            headers["Authorization"] = f"Bearer {bearer_token}"
        return headers

    def _service_headers(self) -> dict[str, str]:
        return {
            "apikey": self.service_role_key,
            "Authorization": f"Bearer {self.service_role_key}",
            "Content-Type": "application/json",
        }

    async def sign_up(self, email: str, password: str) -> dict[str, Any]:
        """Create a Supabase user and return a session when available."""
        self._ensure_auth_configured()
        payload = {"email": email, "password": password}
        data = await self._post("/auth/v1/signup", payload, auth_mode=True)

        if data.get("access_token") and data.get("user"):
            return data

        # If email confirmation is enabled, Supabase may return a user without a session.
        # We try a direct sign-in to preserve the existing frontend contract.
        try:
            return await self.sign_in(email, password)
        except HTTPException as exc:
            if exc.status_code == status.HTTP_401_UNAUTHORIZED:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail=(
                        "Supabase sign-up succeeded, but no session was created. "
                        "Disable email confirmation in Supabase Auth or confirm the email before signing in."
                    ),
                ) from exc
            raise

    async def sign_in(self, email: str, password: str) -> dict[str, Any]:
        """Exchange email/password for a Supabase access token."""
        self._ensure_auth_configured()
        payload = {"email": email, "password": password}
        return await self._post("/auth/v1/token?grant_type=password", payload, auth_mode=True)

    async def get_user(self, token: str) -> dict[str, Any]:
        """Fetch the current user from Supabase Auth using the bearer token."""
        self._ensure_auth_configured()
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.get(
                    f"{self.url}/auth/v1/user",
                    headers=self._auth_headers(token),
                )
                response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            logger.warning("Supabase /user request failed: %s", exc.response.text)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication credentials",
                headers={"WWW-Authenticate": "Bearer"},
            ) from exc
        except httpx.HTTPError as exc:
            logger.error("Supabase auth transport error: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Authentication provider unavailable",
            ) from exc

        return response.json()

    async def upsert_session(self, session_data: dict[str, Any]) -> dict[str, Any]:
        """Upsert a session into Supabase Postgres."""
        self._ensure_persistence_configured()
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                response = await client.post(
                    f"{self.url}/rest/v1/sessions",
                    params={"on_conflict": "report_id"},
                    headers={
                        **self._service_headers(),
                        "Prefer": "resolution=merge-duplicates,return=representation",
                    },
                    json=session_data,
                )
                response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            logger.error("Supabase session upsert failed: %s", exc.response.text)
            raise
        return response.json()[0] if response.json() else session_data

    async def list_sessions(self, user_uid: str) -> list[dict[str, Any]]:
        """Fetch sessions for a user in reverse chronological order."""
        self._ensure_persistence_configured()
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                response = await client.get(
                    f"{self.url}/rest/v1/sessions",
                    params={
                        "select": "*",
                        "user_id": f"eq.{user_uid}",
                        "order": "updated_at.desc",
                    },
                    headers=self._service_headers(),
                )
                response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            logger.error("Supabase list sessions failed: %s", exc.response.text)
            raise
        return response.json()

    async def get_session(self, user_uid: str, report_id: str) -> dict[str, Any] | None:
        """Fetch a single user-owned session by report_id."""
        self._ensure_persistence_configured()
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                response = await client.get(
                    f"{self.url}/rest/v1/sessions",
                    params={
                        "select": "*",
                        "report_id": f"eq.{report_id}",
                        "user_id": f"eq.{user_uid}",
                        "limit": "1",
                    },
                    headers=self._service_headers(),
                )
                response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            logger.error("Supabase get session failed: %s", exc.response.text)
            raise

        rows = response.json()
        return rows[0] if rows else None

    async def delete_session(self, user_uid: str, report_id: str) -> bool:
        """Delete a user-owned session by report_id."""
        self._ensure_persistence_configured()
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                response = await client.delete(
                    f"{self.url}/rest/v1/sessions",
                    params={
                        "report_id": f"eq.{report_id}",
                        "user_id": f"eq.{user_uid}",
                    },
                    headers={**self._service_headers(), "Prefer": "return=minimal"},
                )
                response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            logger.error("Supabase delete session failed: %s", exc.response.text)
            return False
        return True

    async def _post(self, path: str, payload: dict[str, Any], auth_mode: bool = False) -> dict[str, Any]:
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.post(
                    f"{self.url}{path}",
                    headers=self._auth_headers() if auth_mode else self._service_headers(),
                    json=payload,
                )
                response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            detail = self._map_auth_error(exc) if auth_mode else "Supabase request failed"
            raise detail from exc
        except httpx.HTTPError as exc:
            logger.error("Supabase transport error: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Supabase is unavailable",
            ) from exc
        return response.json()

    def _map_auth_error(self, exc: httpx.HTTPStatusError) -> HTTPException:
        payload = {}
        if exc.response.headers.get("content-type", "").startswith("application/json"):
            payload = exc.response.json()
        code = payload.get("code") or payload.get("error_code")
        message = payload.get("msg") or payload.get("message") or "unknown_error"
        logger.warning("Supabase auth request failed: %s", exc.response.text)

        if code in {"invalid_credentials", "email_not_confirmed"} or message in {
            "Invalid login credentials",
            "Email not confirmed",
        }:
            return HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password",
            )
        if code == "user_already_exists" or "already registered" in message.lower():
            return HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An account with this email already exists",
            )
        return HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Supabase auth error: {message}",
        )

    def _ensure_auth_configured(self) -> None:
        if not self.enabled:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Supabase auth is not configured",
            )

    def _ensure_persistence_configured(self) -> None:
        if not self.persistence_enabled:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Supabase persistence is not configured",
            )


_supabase_service: SupabaseService | None = None


def get_supabase_service() -> SupabaseService:
    """Return a cached Supabase service instance."""
    global _supabase_service
    if _supabase_service is None:
        _supabase_service = SupabaseService()
    return _supabase_service


async def get_current_user(token: HTTPAuthorizationCredentials = Depends(security)) -> dict[str, Any]:
    """Validate a Supabase bearer token and return a normalized user dict."""
    if token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    settings = get_settings()
    service = get_supabase_service()
    if not service.enabled:
        if settings.allow_dev_auth_bypass and settings.debug:
            logger.warning("Bypassing auth in debug mode: Supabase not configured.")
            return {"uid": "dev_user_123", "email": "dev@foundersignal.com"}
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service is not configured",
        )

    user = await service.get_user(token.credentials)
    return {
        "uid": user.get("id"),
        "email": user.get("email"),
        "raw_user": user,
    }
