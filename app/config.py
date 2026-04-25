"""FounderSignal — Configuration via environment variables."""

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

    # -------------------------------------------------------------------------
    # Helpers
    # -------------------------------------------------------------------------
    @property
    def has_hera(self) -> bool:
        return bool(self.hera_api_key)

    @property
    def has_peec(self) -> bool:
        return bool(self.peec_api_key)


def get_settings() -> Settings:
    """Factory for Settings — cached at module level."""
    return Settings()
