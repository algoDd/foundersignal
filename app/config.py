"""FounderSignal — Configuration via environment variables."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from .env file or environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # -------------------------------------------------------------------------
    # Server
    # -------------------------------------------------------------------------
    host: str = "0.0.0.0"  # noqa: S104
    port: int = 8000
    debug: bool = False
    log_level: str = "info"

    # -------------------------------------------------------------------------
    # -------------------------------------------------------------------------
    # LLM Provider (agent-agnostic layer)
    # -------------------------------------------------------------------------
    llm_provider: str = "gemini"  # Future: "openai", "anthropic"
    llm_model: str = "gemini-2.5-flash"
    enable_model_verification: bool = False

    # -------------------------------------------------------------------------
    # Core API Keys
    # -------------------------------------------------------------------------
    gemini_api_key: str = ""
    tavily_api_key: str = ""
    openai_api_key: str = ""
    openai_base_url: str | None = None

    # -------------------------------------------------------------------------
    # Partner Integrations (optional — graceful fallback if empty)
    # -------------------------------------------------------------------------
    hera_api_key: str = ""
    peec_api_key: str = ""
    gradium_api_key: str = ""
    pioneer_api_key: str = ""
    pioneer_api_url: str = "https://api.pioneer.ai/v1/chat/completions"
    pioneer_model_id: str = ""
    
    # -------------------------------------------------------------------------
    # Firebase
    # -------------------------------------------------------------------------
    firebase_api_key: str = ""
    firebase_auth_domain: str = ""
    firebase_project_id: str = ""
    firebase_storage_bucket: str = ""
    firebase_messaging_sender_id: str = ""
    firebase_app_id: str = ""
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"


    # -------------------------------------------------------------------------
    # Helpers
    # -------------------------------------------------------------------------
    @property
    def has_hera(self) -> bool:
        return bool(self.hera_api_key)

    @property
    def has_peec(self) -> bool:
        return bool(self.peec_api_key)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Factory for Settings — cached at module level."""
    return Settings()
