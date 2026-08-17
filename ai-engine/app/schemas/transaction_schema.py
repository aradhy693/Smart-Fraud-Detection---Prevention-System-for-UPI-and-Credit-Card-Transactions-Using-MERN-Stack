from datetime import datetime, timezone
from typing import Dict, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


class GeoLocation(BaseModel):
    model_config = ConfigDict(extra="ignore")

    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    city: Optional[str] = Field(default=None, max_length=100)
    country: Optional[str] = Field(default=None, max_length=100)


class TransactionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    userId: str = Field(default="anonymous", min_length=1, max_length=128)
    paymentType: Literal["UPI", "CARD", "CREDIT_CARD"]
    transactionAmount: float = Field(gt=0, le=10000000)
    transactionVelocity: float = Field(default=0, ge=0, le=1000)
    velocityScore: float = Field(default=0, ge=0, le=100)
    ipRisk: float = Field(default=0, ge=0, le=100)
    deviceRisk: float = Field(default=0, ge=0, le=100)
    geoDistance: float = Field(default=0, ge=0, le=20050)
    impossibleTravel: bool = False
    hourOfDay: Optional[int] = Field(default=None, ge=0, le=23)
    repeatedFailures: int = Field(default=0, ge=0, le=100)
    newDeviceFlag: bool = False
    deviceId: Optional[str] = Field(default=None, max_length=128)
    ipAddress: Optional[str] = Field(default=None, max_length=64)
    geoLocation: Optional[GeoLocation] = None
    previousGeoLocation: Optional[GeoLocation] = None
    timestamp: Optional[datetime] = None

    @field_validator("paymentType", mode="before")
    @classmethod
    def normalize_payment_type(cls, value: str) -> str:
        normalized = str(value).strip().upper()
        return "CARD" if normalized == "CREDIT_CARD" else normalized

    def resolved_hour(self) -> int:
        if self.hourOfDay is not None:
            return self.hourOfDay

        event_time = self.timestamp or datetime.now(timezone.utc)
        return event_time.astimezone(timezone.utc).hour


class FraudPrediction(BaseModel):
    success: bool = True
    fraudProbability: float = Field(ge=0, le=1)
    riskScore: float
    decision: Literal["ALLOWED", "FLAGGED", "BLOCKED"]
    riskLevel: Literal["LOW_RISK", "MEDIUM_RISK", "HIGH_RISK"]
    modelVersion: str
    thresholdPolicy: Dict[str, float]
    featureContributions: Dict[str, float]
    shapExplanation: Dict[str, float]
    metrics: Optional[Dict[str, float]] = None


class TrainingResponse(BaseModel):
    success: bool = True
    modelVersion: str
    modelPath: str
    datasetPath: str
    trainedRows: int
    metrics: Dict[str, float]


class HealthResponse(BaseModel):
    success: bool = True
    service: str
    modelReady: bool
    modelVersion: str
    modelPath: str
