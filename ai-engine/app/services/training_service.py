from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict

import joblib
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score, roc_auc_score
from sklearn.model_selection import train_test_split

from app.config import get_settings
from app.services.data_generator import generate_synthetic_fraud_dataset
from app.utils.features import FEATURE_COLUMNS, threshold_policy


def _load_or_create_dataset(dataset_path: Path) -> pd.DataFrame:
    settings = get_settings()
    if not dataset_path.exists():
        return generate_synthetic_fraud_dataset(
            dataset_path=dataset_path,
            rows=settings.synthetic_rows,
            random_state=settings.random_state,
        )

    dataset = pd.read_csv(dataset_path)
    missing_columns = [column for column in FEATURE_COLUMNS + ["fraudLabel"] if column not in dataset.columns]
    if missing_columns:
        return generate_synthetic_fraud_dataset(
            dataset_path=dataset_path,
            rows=settings.synthetic_rows,
            random_state=settings.random_state,
        )

    return dataset[FEATURE_COLUMNS + ["fraudLabel"]]


def _evaluate_model(model: RandomForestClassifier, x_test: pd.DataFrame, y_test: pd.Series) -> Dict[str, float]:
    predicted_labels = model.predict(x_test)
    predicted_probabilities = model.predict_proba(x_test)[:, 1]

    return {
        "accuracy": round(float(accuracy_score(y_test, predicted_labels)), 4),
        "precision": round(float(precision_score(y_test, predicted_labels, zero_division=0)), 4),
        "recall": round(float(recall_score(y_test, predicted_labels, zero_division=0)), 4),
        "f1": round(float(f1_score(y_test, predicted_labels, zero_division=0)), 4),
        "rocAuc": round(float(roc_auc_score(y_test, predicted_probabilities)), 4),
    }


def train_and_persist_model(force: bool = True) -> Dict[str, Any]:
    settings = get_settings()
    settings.model_dir.mkdir(parents=True, exist_ok=True)
    settings.data_dir.mkdir(parents=True, exist_ok=True)

    if settings.model_path.exists() and not force:
        artifact = joblib.load(settings.model_path)
        return {
            "artifact": artifact,
            "metrics": artifact.get("metrics", {}),
            "trainedRows": int(artifact.get("trainedRows", 0)),
        }

    dataset = _load_or_create_dataset(settings.dataset_path)
    x = dataset[FEATURE_COLUMNS]
    y = dataset["fraudLabel"].astype(int)

    x_train, x_test, y_train, y_test = train_test_split(
        x,
        y,
        test_size=0.22,
        random_state=settings.random_state,
        stratify=y,
    )

    model = RandomForestClassifier(
        n_estimators=220,
        max_depth=14,
        min_samples_leaf=3,
        class_weight="balanced_subsample",
        random_state=settings.random_state,
        n_jobs=-1,
    )
    model.fit(x_train, y_train)

    metrics = _evaluate_model(model, x_test, y_test)
    artifact = {
        "model": model,
        "featureColumns": FEATURE_COLUMNS,
        "metrics": metrics,
        "modelVersion": settings.model_version,
        "trainedAt": datetime.now(timezone.utc).isoformat(),
        "trainedRows": int(len(dataset)),
        "thresholdPolicy": threshold_policy(),
    }

    joblib.dump(artifact, settings.model_path)
    settings.metrics_path.write_text(json.dumps(metrics, indent=2), encoding="utf-8")

    return {
        "artifact": artifact,
        "metrics": metrics,
        "trainedRows": int(len(dataset)),
    }
