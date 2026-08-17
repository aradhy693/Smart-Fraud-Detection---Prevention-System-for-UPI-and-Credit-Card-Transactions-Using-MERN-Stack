from __future__ import annotations

import time
from threading import Lock
from typing import Any, Dict

import joblib

from app.config import get_settings
from app.schemas.transaction_schema import FraudPrediction, TransactionInput
from app.services.training_service import train_and_persist_model
from app.utils.features import (
    FEATURE_COLUMNS,
    dataframe_from_features,
    decision_from_probability,
    engineer_features,
    normalize_for_contribution,
    risk_level_from_probability,
    threshold_policy,
)


_MODEL_LOCK = Lock()
_MODEL_ARTIFACT: Dict[str, Any] | None = None


def _load_artifact() -> Dict[str, Any]:
    settings = get_settings()
    if not settings.model_path.exists():
        return train_and_persist_model(force=True)["artifact"]

    artifact = joblib.load(settings.model_path)
    if artifact.get("featureColumns") != FEATURE_COLUMNS:
        return train_and_persist_model(force=True)["artifact"]

    return artifact


def get_model_artifact() -> Dict[str, Any]:
    global _MODEL_ARTIFACT
    if _MODEL_ARTIFACT is not None:
        return _MODEL_ARTIFACT

    with _MODEL_LOCK:
        if _MODEL_ARTIFACT is None:
            _MODEL_ARTIFACT = _load_artifact()
        return _MODEL_ARTIFACT


def refresh_model_artifact() -> Dict[str, Any]:
    global _MODEL_ARTIFACT
    with _MODEL_LOCK:
        _MODEL_ARTIFACT = train_and_persist_model(force=True)["artifact"]
        return _MODEL_ARTIFACT


def is_model_ready() -> bool:
    settings = get_settings()
    return settings.model_path.exists()


def _domain_guardrail_probability(features: Dict[str, float]) -> float:
    guardrail_probability = 0.0

    if features["transactionAmount"] >= 50000:
        guardrail_probability = max(guardrail_probability, 0.84)
    elif features["transactionAmount"] >= 25000:
        guardrail_probability = max(guardrail_probability, 0.52)

    if features["transactionVelocity"] >= 6:
        guardrail_probability = max(guardrail_probability, 0.76)
    elif features["transactionVelocity"] >= 3:
        guardrail_probability = max(guardrail_probability, 0.48)

    if features["impossibleTravel"] >= 1:
        guardrail_probability = max(guardrail_probability, 0.82)

    if features["ipRisk"] >= 85:
        guardrail_probability = max(guardrail_probability, 0.78)
    elif features["ipRisk"] >= 60:
        guardrail_probability = max(guardrail_probability, 0.48)

    if features["deviceRisk"] >= 80 or (features["newDeviceFlag"] and features["deviceRisk"] >= 60):
        guardrail_probability = max(guardrail_probability, 0.72)

    if features["repeatedFailures"] >= 4:
        guardrail_probability = max(guardrail_probability, 0.7)
    elif features["repeatedFailures"] >= 2:
        guardrail_probability = max(guardrail_probability, 0.5)

    if features["hourOfDay"] <= 5 and features["transactionAmount"] >= 20000:
        guardrail_probability = max(guardrail_probability, 0.55)

    return guardrail_probability


def _feature_contributions(model: Any, features: Dict[str, float]) -> Dict[str, float]:
    importances = getattr(model, "feature_importances_", [0.0] * len(FEATURE_COLUMNS))
    weighted = {}
    for feature_name, importance in zip(FEATURE_COLUMNS, importances):
        severity = normalize_for_contribution(feature_name, features[feature_name])
        weighted[feature_name] = float(importance) * severity

    total = sum(weighted.values())
    if total <= 0:
        return {feature_name: 0.0 for feature_name in FEATURE_COLUMNS}

    return {
        feature_name: round((value / total) * 100, 2)
        for feature_name, value in sorted(weighted.items(), key=lambda item: item[1], reverse=True)
    }


def predict_transaction_fraud(transaction: TransactionInput) -> FraudPrediction:
    started_at = time.perf_counter()
    artifact = get_model_artifact()
    model = artifact["model"]
    features = engineer_features(transaction)
    frame = dataframe_from_features(features)
    model_probability = float(model.predict_proba(frame)[0][1])
    fraud_probability = max(model_probability, _domain_guardrail_probability(features))
    fraud_probability = max(0.0, min(fraud_probability, 0.99))
    risk_score = round(fraud_probability * 100, 2)
    feature_contributions = _feature_contributions(model, features)

    prediction = FraudPrediction(
        fraudProbability=round(fraud_probability, 4),
        riskScore=risk_score,
        decision=decision_from_probability(fraud_probability),
        riskLevel=risk_level_from_probability(fraud_probability),
        modelVersion=artifact.get("modelVersion", get_settings().model_version),
        thresholdPolicy=threshold_policy(),
        featureContributions=feature_contributions,
        shapExplanation=feature_contributions,
        metrics=artifact.get("metrics"),
    )
    try:
        from app.services.platform_service import record_inference

        record_inference(
            transaction=transaction,
            prediction=prediction,
            latency_ms=(time.perf_counter() - started_at) * 1000,
            features=features,
        )
    except Exception:
        pass

    return prediction
