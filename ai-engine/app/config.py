import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from pydantic import BaseModel


ROOT_DIR = Path(__file__).resolve().parents[1]
load_dotenv(ROOT_DIR / ".env")


def _parse_csv_env(name: str, default: str) -> list[str]:
    raw_value = os.getenv(name, default)
    return [value.strip() for value in raw_value.split(",") if value.strip()]


def _looks_like_placeholder(value: str) -> bool:
    normalized = value.strip().lower()
    return (
        normalized.startswith("<")
        and normalized.endswith(">")
        or "generate-with" in normalized
        or "change-me" in normalized
        or "changeme" in normalized
        or "replace-with" in normalized
    )


def _validate_required_secret(name: str, value: str, min_length: int = 16) -> None:
    if not value or not value.strip():
        raise ValueError(f"{name} environment variable is missing")

    if _looks_like_placeholder(value):
        raise ValueError(f"{name} contains a placeholder value")

    if len(value.strip()) < min_length:
        raise ValueError(f"{name} must be at least {min_length} characters long")


class Settings(BaseModel):
    app_name: str = "Fraud AI Engine"
    model_version: str = os.getenv("MODEL_VERSION", "random-forest-hybrid-v1")
    model_dir: Path = Path(os.getenv("MODEL_DIR", ROOT_DIR / "model"))
    data_dir: Path = Path(os.getenv("DATA_DIR", ROOT_DIR / "data"))
    model_filename: str = os.getenv("MODEL_FILENAME", "fraud_random_forest.joblib")
    dataset_filename: str = os.getenv("DATASET_FILENAME", "synthetic_transactions.csv")
    metrics_filename: str = os.getenv("METRICS_FILENAME", "model_metrics.json")
    cors_origins: list[str] = _parse_csv_env(
        "AI_CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5000,http://backend:5000",
    )
    medium_risk_threshold: float = float(os.getenv("MEDIUM_RISK_THRESHOLD", "0.40"))
    high_risk_threshold: float = float(os.getenv("HIGH_RISK_THRESHOLD", "0.75"))
    synthetic_rows: int = int(os.getenv("SYNTHETIC_TRAINING_ROWS", "6000"))
    random_state: int = int(os.getenv("MODEL_RANDOM_STATE", "42"))
    ai_engine_api_key: str = os.getenv("AI_ENGINE_API_KEY", "")

    @property
    def model_path(self) -> Path:
        return self.model_dir / self.model_filename

    @property
    def dataset_path(self) -> Path:
        return self.data_dir / self.dataset_filename

    @property
    def metrics_path(self) -> Path:
        return self.model_dir / self.metrics_filename


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    _validate_required_secret("AI_ENGINE_API_KEY", settings.ai_engine_api_key)
    return settings
