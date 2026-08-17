from __future__ import annotations

import csv
import json
import shutil
import time
import uuid
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean
from threading import RLock
from typing import Any, Dict, Iterable, List

from app.config import get_settings
from app.schemas.transaction_schema import FraudPrediction, TransactionInput
from app.services.training_service import train_and_persist_model
from app.utils.features import FEATURE_COLUMNS, engineer_features, threshold_policy


_PLATFORM_LOCK = RLock()
_PREDICTION_JOBS: Dict[str, Dict[str, Any]] = {}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _platform_dir() -> Path:
    settings = get_settings()
    path = settings.model_dir / "platform"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _data_dir() -> Path:
    settings = get_settings()
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    return settings.data_dir


def _registry_path() -> Path:
    return _platform_dir() / "model_registry.json"


def _inference_log_path() -> Path:
    return _platform_dir() / "inference_log.jsonl"


def _feedback_path() -> Path:
    return _platform_dir() / "feedback_log.jsonl"


def _online_feature_store_path() -> Path:
    return _platform_dir() / "online_feature_store.json"


def _offline_feature_store_path() -> Path:
    return _data_dir() / "offline_feature_store.csv"


def _model_versions_dir() -> Path:
    path = _platform_dir() / "model_versions"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _read_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return default


def _write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True), encoding="utf-8")


def _append_jsonl(path: Path, value: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(value, sort_keys=True) + "\n")


def _read_jsonl(path: Path, limit: int = 500) -> List[Dict[str, Any]]:
    if not path.exists():
        return []
    rows: List[Dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    if limit <= 0:
        return rows
    return rows[-limit:]


def _safe_float(value: Any, fallback: float = 0.0) -> float:
    try:
        number = float(value)
        if number != number:
            return fallback
        return number
    except (TypeError, ValueError):
        return fallback


def _round(value: Any, digits: int = 4) -> float:
    return round(_safe_float(value), digits)


def _prediction_to_dict(prediction: FraudPrediction) -> Dict[str, Any]:
    return prediction.model_dump(mode="json")


def _transaction_to_dict(transaction: TransactionInput) -> Dict[str, Any]:
    return transaction.model_dump(mode="json")


def _model_copy_path(version: str) -> Path:
    sanitized = "".join(character if character.isalnum() or character in "._-" else "_" for character in version)
    return _model_versions_dir() / f"{sanitized}.joblib"


def _build_model_record(artifact: Dict[str, Any], stage: str = "champion") -> Dict[str, Any]:
    settings = get_settings()
    version = str(artifact.get("modelVersion") or settings.model_version)
    model_path = settings.model_path
    version_path = _model_copy_path(version)
    if model_path.exists() and not version_path.exists():
        shutil.copy2(model_path, version_path)

    return {
        "version": version,
        "stage": stage,
        "status": "active" if stage == "champion" else "standby",
        "algorithm": artifact.get("algorithm", "RandomForestClassifier"),
        "trainedAt": artifact.get("trainedAt") or _now(),
        "registeredAt": _now(),
        "modelPath": str(version_path if version_path.exists() else model_path),
        "featureColumns": artifact.get("featureColumns", FEATURE_COLUMNS),
        "metrics": artifact.get("metrics", {}),
        "thresholdPolicy": artifact.get("thresholdPolicy", threshold_policy()),
        "trainedRows": int(artifact.get("trainedRows", 0)),
        "rollbackSafe": True,
    }


def ensure_model_registry(artifact: Dict[str, Any] | None = None) -> Dict[str, Any]:
    from app.services.model_service import get_model_artifact

    with _PLATFORM_LOCK:
        registry = _read_json(_registry_path(), None)
        current_artifact = artifact or get_model_artifact()
        current_version = str(current_artifact.get("modelVersion") or get_settings().model_version)

        if not registry:
            record = _build_model_record(current_artifact, stage="champion")
            registry = {
                "activeChampion": current_version,
                "activeChallenger": None,
                "models": [record],
                "updatedAt": _now(),
            }
            _write_json(_registry_path(), registry)
            return registry

        if not any(model.get("version") == current_version for model in registry.get("models", [])):
            registry["models"].append(_build_model_record(current_artifact, stage="challenger"))
            registry["updatedAt"] = _now()
            _write_json(_registry_path(), registry)

        return registry


def register_trained_model(artifact: Dict[str, Any], stage: str = "challenger") -> Dict[str, Any]:
    with _PLATFORM_LOCK:
        registry = ensure_model_registry(artifact)
        version = str(artifact.get("modelVersion") or get_settings().model_version)
        existing = next((model for model in registry["models"] if model.get("version") == version), None)
        record = _build_model_record(artifact, stage=stage)
        if existing:
            existing.update(record)
        else:
            registry["models"].append(record)

        if stage == "champion":
            registry["activeChampion"] = version
            for model in registry["models"]:
                model["stage"] = "champion" if model.get("version") == version else "challenger"
                model["status"] = "active" if model.get("version") == version else "standby"
        elif not registry.get("activeChallenger"):
            registry["activeChallenger"] = version

        registry["updatedAt"] = _now()
        _write_json(_registry_path(), registry)
        return registry


def promote_model(version: str) -> Dict[str, Any]:
    with _PLATFORM_LOCK:
        registry = ensure_model_registry()
        target = next((model for model in registry["models"] if model.get("version") == version), None)
        if not target:
            raise ValueError("Model version was not found in registry")

        registry["activeChampion"] = version
        registry["activeChallenger"] = None
        for model in registry["models"]:
            is_target = model.get("version") == version
            model["stage"] = "champion" if is_target else "challenger"
            model["status"] = "active" if is_target else "standby"
        registry["updatedAt"] = _now()
        _write_json(_registry_path(), registry)
        return registry


def rollback_model(target_version: str | None = None) -> Dict[str, Any]:
    with _PLATFORM_LOCK:
        registry = ensure_model_registry()
        models = registry.get("models", [])
        if target_version:
            target = next((model for model in models if model.get("version") == target_version), None)
        else:
            challengers = [model for model in models if model.get("version") != registry.get("activeChampion")]
            target = challengers[-1] if challengers else None

        if not target:
            raise ValueError("No rollback target is available")

        return promote_model(target["version"])


def _update_online_feature_store(record: Dict[str, Any]) -> None:
    store = _read_json(_online_feature_store_path(), {})
    key = record["transaction"].get("userId") or "anonymous"
    store[key] = {
        "updatedAt": record["createdAt"],
        "features": record["features"],
        "lastPredictionId": record["predictionId"],
        "lastRiskScore": record["prediction"].get("riskScore", 0),
        "riskLevel": record["prediction"].get("riskLevel", "LOW_RISK"),
    }
    _write_json(_online_feature_store_path(), store)


def _append_offline_feature_store(record: Dict[str, Any]) -> None:
    path = _offline_feature_store_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "predictionId",
        "createdAt",
        "userId",
        "modelVersion",
        "decision",
        "riskLevel",
        "riskScore",
        *FEATURE_COLUMNS,
    ]
    write_header = not path.exists()
    with path.open("a", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        if write_header:
            writer.writeheader()
        row = {
            "predictionId": record["predictionId"],
            "createdAt": record["createdAt"],
            "userId": record["transaction"].get("userId", "anonymous"),
            "modelVersion": record["prediction"].get("modelVersion"),
            "decision": record["prediction"].get("decision"),
            "riskLevel": record["prediction"].get("riskLevel"),
            "riskScore": record["prediction"].get("riskScore"),
        }
        row.update(record["features"])
        writer.writerow(row)


def record_inference(
    transaction: TransactionInput,
    prediction: FraudPrediction,
    latency_ms: float,
    features: Dict[str, float] | None = None,
) -> Dict[str, Any]:
    record = {
        "predictionId": str(uuid.uuid4()),
        "createdAt": _now(),
        "transaction": _transaction_to_dict(transaction),
        "features": features or engineer_features(transaction),
        "prediction": _prediction_to_dict(prediction),
        "latencyMs": round(float(latency_ms), 2),
    }
    with _PLATFORM_LOCK:
        _append_jsonl(_inference_log_path(), record)
        _update_online_feature_store(record)
        _append_offline_feature_store(record)
    return record


def get_prediction_history(limit: int = 100) -> List[Dict[str, Any]]:
    return list(reversed(_read_jsonl(_inference_log_path(), limit=max(1, min(limit, 1000)))))


def get_feedback_history(limit: int = 100) -> List[Dict[str, Any]]:
    return list(reversed(_read_jsonl(_feedback_path(), limit=max(1, min(limit, 1000)))))


def _feature_summary(records: Iterable[Dict[str, Any]]) -> Dict[str, Any]:
    values = {column: [] for column in FEATURE_COLUMNS}
    for record in records:
        features = record.get("features", {})
        for column in FEATURE_COLUMNS:
            values[column].append(_safe_float(features.get(column)))

    return {
        column: {
            "count": len(column_values),
            "mean": round(mean(column_values), 4) if column_values else 0,
            "min": round(min(column_values), 4) if column_values else 0,
            "max": round(max(column_values), 4) if column_values else 0,
        }
        for column, column_values in values.items()
    }


def get_feature_store() -> Dict[str, Any]:
    online_store = _read_json(_online_feature_store_path(), {})
    predictions = _read_jsonl(_inference_log_path(), limit=500)
    return {
        "online": {
            "entityCount": len(online_store),
            "entities": list(online_store.values())[-100:],
        },
        "offline": {
            "path": str(_offline_feature_store_path()),
            "rowCount": len(predictions),
            "featureSummary": _feature_summary(predictions),
        },
        "featureColumns": FEATURE_COLUMNS,
        "updatedAt": _now(),
    }


def _distribution(records: List[Dict[str, Any]], field: str) -> Dict[str, int]:
    counter: Counter[str] = Counter()
    for record in records:
        value = record.get("prediction", {}).get(field, "UNKNOWN")
        counter[str(value)] += 1
    return dict(counter)


def get_drift_report(limit: int = 500) -> Dict[str, Any]:
    records = _read_jsonl(_inference_log_path(), limit=max(1, min(limit, 2000)))
    if not records:
        return {
            "status": "INSUFFICIENT_DATA",
            "dataDrift": [],
            "featureDrift": [],
            "predictionDrift": {"status": "INSUFFICIENT_DATA"},
            "generatedAt": _now(),
        }

    split_index = max(1, len(records) // 2)
    baseline = records[:split_index]
    current = records[split_index:] or records
    baseline_summary = _feature_summary(baseline)
    current_summary = _feature_summary(current)
    feature_drift = []
    for column in FEATURE_COLUMNS:
        base_mean = baseline_summary[column]["mean"]
        current_mean = current_summary[column]["mean"]
        denominator = max(abs(base_mean), 1.0)
        shift = abs(current_mean - base_mean) / denominator
        feature_drift.append({
            "feature": column,
            "baselineMean": base_mean,
            "currentMean": current_mean,
            "relativeShift": round(shift, 4),
            "status": "DRIFT" if shift >= 0.35 else "STABLE",
        })

    risk_scores = [_safe_float(record.get("prediction", {}).get("riskScore")) for record in current]
    high_risk_rate = (
        sum(1 for record in current if record.get("prediction", {}).get("riskLevel") == "HIGH_RISK") / len(current)
        if current
        else 0
    )
    prediction_drift_status = "DRIFT" if high_risk_rate >= 0.45 or any(item["status"] == "DRIFT" for item in feature_drift) else "STABLE"

    return {
        "status": prediction_drift_status,
        "dataDrift": feature_drift,
        "featureDrift": feature_drift,
        "predictionDrift": {
            "status": prediction_drift_status,
            "highRiskRate": round(high_risk_rate, 4),
            "averageRiskScore": round(mean(risk_scores), 4) if risk_scores else 0,
            "decisionDistribution": _distribution(current, "decision"),
            "riskDistribution": _distribution(current, "riskLevel"),
        },
        "generatedAt": _now(),
    }


def get_model_dashboard() -> Dict[str, Any]:
    registry = ensure_model_registry()
    predictions = _read_jsonl(_inference_log_path(), limit=1000)
    latency_values = [_safe_float(record.get("latencyMs")) for record in predictions]
    risk_values = [_safe_float(record.get("prediction", {}).get("riskScore")) for record in predictions]
    by_model: Dict[str, Dict[str, Any]] = defaultdict(lambda: {"count": 0, "avgRiskScore": 0.0, "latencies": []})
    for record in predictions:
        version = record.get("prediction", {}).get("modelVersion", "unknown")
        by_model[version]["count"] += 1
        by_model[version]["avgRiskScore"] += _safe_float(record.get("prediction", {}).get("riskScore"))
        by_model[version]["latencies"].append(_safe_float(record.get("latencyMs")))

    comparison = []
    for version, item in by_model.items():
        count = max(item["count"], 1)
        comparison.append({
            "modelVersion": version,
            "predictionCount": item["count"],
            "averageRiskScore": round(item["avgRiskScore"] / count, 2),
            "averageLatencyMs": round(mean(item["latencies"]), 2) if item["latencies"] else 0,
        })

    return {
        "registry": registry,
        "metrics": {
            "predictionCount": len(predictions),
            "averageLatencyMs": round(mean(latency_values), 2) if latency_values else 0,
            "p95LatencyMs": round(sorted(latency_values)[int(len(latency_values) * 0.95) - 1], 2) if latency_values else 0,
            "averageRiskScore": round(mean(risk_values), 2) if risk_values else 0,
            "thresholdPolicy": threshold_policy(),
        },
        "modelComparison": comparison,
        "drift": get_drift_report(),
        "feedback": {
            "recent": get_feedback_history(limit=20),
            "count": len(_read_jsonl(_feedback_path(), limit=0)),
        },
        "generatedAt": _now(),
    }


def get_platform_health() -> Dict[str, Any]:
    dashboard = get_model_dashboard()
    registry = dashboard["registry"]
    drift_status = dashboard["drift"]["status"]
    latency = dashboard["metrics"]["averageLatencyMs"]
    return {
        "success": True,
        "status": "DEGRADED" if drift_status == "DRIFT" or latency > 1000 else "HEALTHY",
        "activeChampion": registry.get("activeChampion"),
        "activeChallenger": registry.get("activeChallenger"),
        "averageLatencyMs": latency,
        "driftStatus": drift_status,
        "queueDepth": len(_PREDICTION_JOBS),
        "generatedAt": _now(),
    }


def explain_prediction(prediction_id: str) -> Dict[str, Any]:
    records = _read_jsonl(_inference_log_path(), limit=0)
    record = next((item for item in records if item.get("predictionId") == prediction_id), None)
    if not record:
        raise ValueError("Prediction was not found")

    shap = record.get("prediction", {}).get("shapExplanation", {})
    feature_contributions = record.get("prediction", {}).get("featureContributions", {})
    lime = {
        feature: round(_safe_float(value) / 100, 4)
        for feature, value in feature_contributions.items()
    }
    return {
        "predictionId": prediction_id,
        "modelVersion": record.get("prediction", {}).get("modelVersion"),
        "decision": record.get("prediction", {}).get("decision"),
        "shap": shap,
        "lime": lime,
        "featureValues": record.get("features", {}),
        "generatedAt": _now(),
    }


def submit_feedback(payload: Dict[str, Any]) -> Dict[str, Any]:
    record = {
        "feedbackId": str(uuid.uuid4()),
        "createdAt": _now(),
        "predictionId": payload.get("predictionId"),
        "transactionId": payload.get("transactionId"),
        "label": payload.get("label"),
        "analystId": payload.get("analystId"),
        "notes": payload.get("notes", ""),
        "source": payload.get("source", "human-feedback"),
    }
    _append_jsonl(_feedback_path(), record)
    return record


def trigger_retraining(background: bool = False) -> Dict[str, Any]:
    started_at = time.perf_counter()
    result = train_and_persist_model(force=True)
    artifact = result["artifact"]
    registry = register_trained_model(artifact, stage="challenger")
    return {
        "success": True,
        "background": background,
        "modelVersion": artifact.get("modelVersion"),
        "trainedRows": result.get("trainedRows", 0),
        "metrics": artifact.get("metrics", {}),
        "durationMs": round((time.perf_counter() - started_at) * 1000, 2),
        "registry": registry,
    }


def queue_prediction(transaction_payload: Dict[str, Any]) -> Dict[str, Any]:
    from app.services.model_service import predict_transaction_fraud

    job_id = str(uuid.uuid4())
    job = {
        "jobId": job_id,
        "status": "QUEUED",
        "createdAt": _now(),
        "updatedAt": _now(),
        "result": None,
        "error": None,
    }
    _PREDICTION_JOBS[job_id] = job

    try:
        job["status"] = "PROCESSING"
        job["updatedAt"] = _now()
        transaction = TransactionInput(**transaction_payload)
        prediction = predict_transaction_fraud(transaction)
        job["status"] = "COMPLETED"
        job["result"] = _prediction_to_dict(prediction)
        job["updatedAt"] = _now()
    except Exception as exc:
        job["status"] = "FAILED"
        job["error"] = str(exc)
        job["updatedAt"] = _now()

    return job


def get_prediction_job(job_id: str) -> Dict[str, Any] | None:
    return _PREDICTION_JOBS.get(job_id)


def batch_predict(transactions: List[Dict[str, Any]]) -> Dict[str, Any]:
    from app.services.model_service import predict_transaction_fraud

    predictions = []
    failures = []
    for index, item in enumerate(transactions):
        try:
            prediction = predict_transaction_fraud(TransactionInput(**item))
            predictions.append({
                "index": index,
                "prediction": _prediction_to_dict(prediction),
            })
        except Exception as exc:
            failures.append({
                "index": index,
                "error": str(exc),
            })

    return {
        "success": len(failures) == 0,
        "predictionCount": len(predictions),
        "failureCount": len(failures),
        "predictions": predictions,
        "failures": failures,
    }


def streaming_prediction_event(transaction_payload: Dict[str, Any]) -> Dict[str, Any]:
    job = queue_prediction(transaction_payload)
    return {
        "event": "prediction.completed" if job["status"] == "COMPLETED" else "prediction.failed",
        "job": job,
        "emittedAt": _now(),
    }
