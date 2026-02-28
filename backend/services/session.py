"""Session management service with in-memory storage."""

import time
import uuid
from dataclasses import dataclass, field
from typing import Any

from config import settings


@dataclass
class Session:
    """Represents a user editing session."""

    id: str
    created_at: float
    updated_at: float
    data: dict[str, Any] = field(default_factory=dict)


class SessionManager:
    """Manages in-memory editing sessions.

    All instances share the same session store so that routers
    can each instantiate SessionManager() independently.
    """

    _sessions: dict[str, Session] = {}

    def __init__(self) -> None:
        pass

    def create_session(self) -> str:
        """Create a new session and return its ID."""
        self._cleanup_expired()
        if len(self._sessions) >= settings.max_sessions:
            self._evict_oldest()
        session_id = uuid.uuid4().hex
        now = time.time()
        self._sessions[session_id] = Session(
            id=session_id,
            created_at=now,
            updated_at=now,
        )
        return session_id

    def get_session(self, session_id: str) -> Session | None:
        """Get a session by ID, returning None if not found or expired."""
        session = self._sessions.get(session_id)
        if session is None:
            return None
        if self._is_expired(session):
            del self._sessions[session_id]
            return None
        session.updated_at = time.time()
        return session

    def delete_session(self, session_id: str) -> bool:
        """Delete a session. Returns True if it existed."""
        return self._sessions.pop(session_id, None) is not None

    def update_session_data(self, session_id: str, data: dict[str, Any]) -> bool:
        """Update session data. Returns False if session not found."""
        session = self.get_session(session_id)
        if session is None:
            return False
        session.data.update(data)
        session.updated_at = time.time()
        return True

    def _is_expired(self, session: Session) -> bool:
        return (time.time() - session.updated_at) > settings.session_ttl_seconds

    def _cleanup_expired(self) -> None:
        expired = [
            sid for sid, s in self._sessions.items() if self._is_expired(s)
        ]
        for sid in expired:
            del self._sessions[sid]

    def _evict_oldest(self) -> None:
        if not self._sessions:
            return
        oldest_id = min(self._sessions, key=lambda k: self._sessions[k].updated_at)
        del self._sessions[oldest_id]
