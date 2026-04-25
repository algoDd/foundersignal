import json
import os
import logging
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from app.models.schemas import FullReport

logger = logging.getLogger("foundersignal.storage")

class SessionStorage:
    def __init__(self, base_path: str = "outputs/sessions"):
        self.base_path = Path(base_path)
        self.base_path.mkdir(parents=True, exist_ok=True)

    def save_session(self, report: FullReport) -> str:
        """Save a report to disk."""
        try:
            file_path = self.base_path / f"{report.report_id}.json"
            with open(file_path, "w") as f:
                f.write(report.model_dump_json(indent=2))
            logger.info(f"Session saved: {report.report_id}")
            return str(file_path)
        except Exception as e:
            logger.error(f"Failed to save session {report.report_id}: {e}")
            return ""

    def load_session(self, report_id: str) -> Optional[FullReport]:
        """Load a report by ID."""
        try:
            file_path = self.base_path / f"{report_id}.json"
            if not file_path.exists():
                return None
            with open(file_path, "r") as f:
                data = json.load(f)
                return FullReport.model_validate(data)
        except Exception as e:
            logger.error(f"Failed to load session {report_id}: {e}")
            return None

    def list_sessions(self) -> List[dict]:
        """List all saved sessions with summaries."""
        sessions = []
        try:
            for file_path in self.base_path.glob("*.json"):
                with open(file_path, "r") as f:
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
            logger.error(f"Failed to list sessions: {e}")
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
            logger.error(f"Failed to delete session {report_id}: {e}")
            return False

_storage_instance = None

def get_storage() -> SessionStorage:
    global _storage_instance
    if _storage_instance is None:
        _storage_instance = SessionStorage()
    return _storage_instance
