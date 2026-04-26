import logging
from datetime import datetime
from typing import List, Optional, Dict, Any
from google.cloud.firestore_v1.base_query import FieldFilter
from app.services.firebase_admin import get_db

logger = logging.getLogger("foundersignal.persistence")

class SessionManager:
    def __init__(self):
        self.db = get_db()
        self.collection_name = "sessions"
        from app.services.storage import get_storage
        self.local_storage = get_storage()

    def _get_collection(self):
        if not self.db:
            return None
        return self.db.collection(self.collection_name)

    async def save_session(self, user_uid: str, session_data: Dict[str, Any]):
        """Save or update a session for a user."""
        coll = self._get_collection()
        if not coll:
            logger.warning("Firestore DB not available, saving to local disk.")
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

        session_data["user_uid"] = user_uid
        session_data["updated_at"] = datetime.utcnow().isoformat()
        if "created_at" not in session_data:
            session_data["created_at"] = session_data["updated_at"]

        try:
            coll.document(report_id).set(session_data, merge=True)
            logger.info("Saved session %s for user %s", report_id, user_uid)
            return report_id
        except Exception as e:
            logger.error("Failed to save session to Firestore: %s", e)
            return None

    async def get_sessions(self, user_uid: str) -> List[Dict[str, Any]]:
        """Get all sessions for a specific user."""
        coll = self._get_collection()
        if not coll:
            return self.local_storage.list_sessions()

        try:
            docs = coll.where(filter=FieldFilter("user_uid", "==", user_uid)).stream()
            sessions = []
            for doc in docs:
                data = doc.to_dict()
                data["id"] = doc.id
                sessions.append(data)
            
            # Sort by created_at descending in memory
            sessions.sort(key=lambda x: x.get("created_at", ""), reverse=True)
            return sessions

        except Exception as e:
            logger.error("Failed to fetch sessions from Firestore: %s", e)
            return []

    async def get_session_by_id(self, report_id: str) -> Optional[Dict[str, Any]]:
        """Get a single session by its ID."""
        coll = self._get_collection()
        if not coll:
            report = self.local_storage.load_session(report_id)
            return report if report else None

        try:

            doc = coll.document(report_id).get()
            if doc.exists:
                return doc.to_dict()
            return None
        except Exception as e:
            logger.error("Failed to fetch session %s: %s", report_id, e)
            return None

    async def delete_session(self, user_uid: str, report_id: str) -> bool:
        """Delete a session if it belongs to the user."""
        coll = self._get_collection()
        if not coll:
            return False

        try:
            doc_ref = coll.document(report_id)
            doc = doc_ref.get()
            if doc.exists and doc.to_dict().get("user_uid") == user_uid:
                doc_ref.delete()
                return True
            return False
        except Exception as e:
            logger.error("Failed to delete session %s: %s", report_id, e)
            return False

# Singleton instance
persistence = SessionManager()
