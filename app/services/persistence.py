import logging
from datetime import datetime
from typing import List, Optional, Dict, Any

import httpx

from app.services.supabase_service import get_supabase_service

logger = logging.getLogger("foundersignal.persistence")

class SessionManager:
    def __init__(self):
        self.supabase = get_supabase_service()
        from app.services.storage import get_storage
        self.local_storage = get_storage()

    def _is_missing_sessions_table(self, error: Exception) -> bool:
        """Detect Supabase schema-cache errors for the sessions table."""
        if not isinstance(error, httpx.HTTPStatusError):
            return False

        try:
            payload = error.response.json()
        except ValueError:
            return False

        return payload.get("code") == "PGRST205" and "public.sessions" in payload.get("message", "")

    def _log_schema_hint(self) -> None:
        """Log a direct hint for the required Supabase migration."""
        logger.error(
            "Supabase sessions table is missing. Run the migration at "
            "'supabase/migrations/20260426_create_sessions.sql' in your Supabase project."
        )

    async def save_session(self, user_uid: str, session_data: Dict[str, Any]):
        """Save or update a session for a user."""
        if not self.supabase.persistence_enabled:
            logger.warning("Supabase DB not available, saving to local disk.")
            try:
                self.local_storage.save_session(session_data)
                return session_data.get("report_id")
            except Exception as e:
                logger.error("Local save failed: %s", e)
                return None


        report_id = session_data.get("report_id")
        if not report_id:
            logger.error("No report_id provided in session_data")
            return None

        session_data["user_id"] = user_uid
        session_data["updated_at"] = datetime.utcnow().isoformat()
        if "created_at" not in session_data:
            session_data["created_at"] = session_data["updated_at"]

        try:
            await self.supabase.upsert_session(session_data)
            logger.info("Saved session %s for user %s", report_id, user_uid)
            return report_id
        except Exception as e:
            logger.error("Failed to save session to Supabase: %s", e)
            if self._is_missing_sessions_table(e):
                self._log_schema_hint()
            try:
                self.local_storage.save_session(session_data)
                logger.warning("Saved session %s to local disk fallback.", report_id)
                return report_id
            except Exception as local_error:
                logger.error("Local fallback save failed: %s", local_error)
                return None

    async def get_sessions(self, user_uid: str) -> List[Dict[str, Any]]:
        """Get all sessions for a specific user."""
        if not self.supabase.persistence_enabled:
            return self.local_storage.list_sessions()

        try:
            sessions = await self.supabase.list_sessions(user_uid)
            for session in sessions:
                session["id"] = session.get("report_id")
            sessions.sort(key=lambda x: x.get("created_at", ""), reverse=True)
            return sessions

        except Exception as e:
            logger.error("Failed to fetch sessions from Supabase: %s", e)
            if self._is_missing_sessions_table(e):
                self._log_schema_hint()
            return self.local_storage.list_sessions()

    async def get_session_by_id(self, user_uid: str, report_id: str) -> Optional[Dict[str, Any]]:
        """Get a single session by its ID."""
        if not self.supabase.persistence_enabled:
            report = self.local_storage.load_session(report_id)
            return report if report else None

        try:
            return await self.supabase.get_session(user_uid, report_id)
        except Exception as e:
            logger.error("Failed to fetch session %s: %s", report_id, e)
            if self._is_missing_sessions_table(e):
                self._log_schema_hint()
            report = self.local_storage.load_session(report_id)
            return report if report else None

    async def delete_session(self, user_uid: str, report_id: str) -> bool:
        """Delete a session if it belongs to the user."""
        if not self.supabase.persistence_enabled:
            return False

        try:
            return await self.supabase.delete_session(user_uid, report_id)
        except Exception as e:
            logger.error("Failed to delete session %s: %s", report_id, e)
            return False

# Singleton instance
persistence = SessionManager()
