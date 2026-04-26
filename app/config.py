"""FounderSignal — Configuration via environment variables."""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from .env file or environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
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
    # Supabase
    # -------------------------------------------------------------------------
    supabase_url: str = ""
    supabase_key: str = ""
    supabase_secret_key: str = Field(default="", validation_alias="SUPABAS_SECRET_KEY")
    db_pass: str = ""
    allow_dev_auth_bypass: bool = False
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

    @property
    def has_supabase(self) -> bool:
        return bool(self.supabase_url and self.supabase_key)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Factory for Settings — cached at module level."""
    return Settings()
