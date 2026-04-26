import json
import logging
from pathlib import Path
from typing import Any, List, Optional

logger = logging.getLogger("foundersignal.storage")

class SessionStorage:
    def __init__(self, base_path: str = "outputs/sessions"):
        self.base_path = Path(base_path)
        self.base_path.mkdir(parents=True, exist_ok=True)

    def save_session(self, session_data: dict[str, Any]) -> str:
        """Save arbitrary session data to disk."""
        try:
            report_id = session_data.get("report_id")
            if not report_id:
                logger.error("Cannot save session without report_id")
                return ""

            file_path = self.base_path / f"{report_id}.json"
            with open(file_path, "w", encoding="utf-8") as f:
                json.dump(session_data, f, indent=2)
            logger.info("Session saved: %s", report_id)
            return str(file_path)
        except Exception as e:
            logger.error("Failed to save session: %s", e)
            return ""

    def load_session(self, report_id: str) -> Optional[dict[str, Any]]:
        """Load a session by ID."""
        try:
            file_path = self.base_path / f"{report_id}.json"
            if not file_path.exists():
                return None
            with open(file_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.error("Failed to load session %s: %s", report_id, e)
            return None

    def list_sessions(self) -> List[dict]:
        """List all saved sessions with summaries."""
        sessions = []
        try:
            for file_path in self.base_path.glob("*.json"):
                with open(file_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    # Extract a lightweight summary
                    sessions.append({
                        "id": data.get("report_id"),
                        "idea": data.get("input", {}).get("idea", "")[:100],
                        "created_at": data.get("created_at"),
                        "score": data.get("validation_score", {}).get("overall_score") if data.get("validation_score") else None
                    })
            # Sort by date descending
            sessions.sort(key=lambda x: x["created_at"] or "", reverse=True)
            return sessions
        except Exception as e:
            logger.error("Failed to list sessions: %s", e)
            return []

    def delete_session(self, report_id: str) -> bool:
        """Delete a session."""
        try:
            file_path = self.base_path / f"{report_id}.json"
            if file_path.exists():
                file_path.unlink()
                return True
            return False
        except Exception as e:
            logger.error("Failed to delete session %s: %s", report_id, e)
            return False

_storage_instance = None

def get_storage() -> SessionStorage:
    global _storage_instance
    if _storage_instance is None:
        _storage_instance = SessionStorage()
    return _storage_instance
