"""Application configuration."""

from pydantic import BaseModel


class Settings(BaseModel):
    """Application settings."""

    app_name: str = "FPB Editor API"
    app_version: str = "0.1.0"
    debug: bool = False
    cors_origins: list[str] = ["http://localhost:5173"]
    api_prefix: str = "/api"

    # Session settings
    session_ttl_seconds: int = 3600
    session_cleanup_interval_seconds: int = 300
    max_sessions: int = 100


settings = Settings()
