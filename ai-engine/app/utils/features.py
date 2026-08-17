from __future__ import annotations

from math import radians, sin, cos, sqrt, atan2, log1p
from typing import Dict

import pandas as pd

from app.config import get_settings
from app.schemas.transaction_schema import GeoLocation, TransactionInput


FEATURE_COLUMNS = [
    "transactionAmount",
    "paymentType",
    "transactionVelocity",
    "ipRisk",
    "deviceRisk",
    "geoDistance",
    "impossibleTravel",
    "hourOfDay",
    "repeatedFailures",
    "newDeviceFlag",
]

FEATURE_LIMITS = {
    "transactionAmount": 100000.0,
    "paymentType": 1.0,
    "transactionVelocity": 10.0,
    "ipRisk": 100.0,
    "deviceRisk": 100.0,
    "geoDistance": 2500.0,
    "impossibleTravel": 1.0,
    "hourOfDay": 23.0,
    "repeatedFailures": 8.0,
    "newDeviceFlag": 1.0,
}


def calculate_distance_km(origin: GeoLocation | None, destination: GeoLocation | None) -> float:
    if origin is None or destination is None:
        return 0.0

    earth_radius_km = 6371.0
    lat_delta = radians(destination.latitude - origin.latitude)
    lon_delta = radians(destination.longitude - origin.longitude)
    lat1 = radians(origin.latitude)
    lat2 = radians(destination.latitude)

    a = (
        sin(lat_delta / 2) ** 2
        + cos(lat1) * cos(lat2) * sin(lon_delta / 2) ** 2
    )
    return earth_radius_km * 2 * atan2(sqrt(a), sqrt(1 - a))


def _bounded(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(float(value), maximum))


def engineer_features(transaction: TransactionInput) -> Dict[str, float]:
    resolved_distance = transaction.geoDistance
    if resolved_distance <= 0 and transaction.previousGeoLocation and transaction.geoLocation:
        resolved_distance = calculate_distance_km(
            transaction.previousGeoLocation,
            transaction.geoLocation,
        )

    velocity_from_score = transaction.velocityScore / 20.0
    resolved_velocity = max(transaction.transactionVelocity, velocity_from_score)

    return {
        "transactionAmount": _bounded(transaction.transactionAmount, 1.0, 10000000.0),
        "paymentType": 1.0 if transaction.paymentType == "CARD" else 0.0,
        "transactionVelocity": _bounded(resolved_velocity, 0.0, 1000.0),
        "ipRisk": _bounded(transaction.ipRisk, 0.0, 100.0),
        "deviceRisk": _bounded(transaction.deviceRisk, 0.0, 100.0),
        "geoDistance": _bounded(resolved_distance, 0.0, 20050.0),
        "impossibleTravel": 1.0 if transaction.impossibleTravel or resolved_distance >= 850 else 0.0,
        "hourOfDay": float(transaction.resolved_hour()),
        "repeatedFailures": float(min(transaction.repeatedFailures, 100)),
        "newDeviceFlag": 1.0 if transaction.newDeviceFlag else 0.0,
    }


def dataframe_from_features(features: Dict[str, float]) -> pd.DataFrame:
    return pd.DataFrame([{column: features[column] for column in FEATURE_COLUMNS}])


def normalize_for_contribution(feature_name: str, value: float) -> float:
    if feature_name == "transactionAmount":
        return min(log1p(max(value, 0.0)) / log1p(FEATURE_LIMITS[feature_name]), 1.0)

    if feature_name == "hourOfDay":
        hour = int(value)
        return 1.0 if hour <= 5 or hour >= 23 else 0.15

    limit = FEATURE_LIMITS.get(feature_name, 1.0)
    if limit <= 0:
        return 0.0

    return min(max(value / limit, 0.0), 1.0)


def risk_level_from_probability(probability: float) -> str:
    settings = get_settings()
    if probability >= settings.high_risk_threshold:
        return "HIGH_RISK"
    if probability >= settings.medium_risk_threshold:
        return "MEDIUM_RISK"
    return "LOW_RISK"


def decision_from_probability(probability: float) -> str:
    risk_level = risk_level_from_probability(probability)
    if risk_level == "HIGH_RISK":
        return "BLOCKED"
    if risk_level == "MEDIUM_RISK":
        return "FLAGGED"
    return "ALLOWED"


def threshold_policy() -> Dict[str, float]:
    settings = get_settings()
    return {
        "mediumRisk": settings.medium_risk_threshold,
        "highRisk": settings.high_risk_threshold,
    }
