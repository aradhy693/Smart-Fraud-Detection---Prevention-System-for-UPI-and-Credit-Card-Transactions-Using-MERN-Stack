from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from app.utils.features import FEATURE_COLUMNS


def _sigmoid(value: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-value))


def generate_synthetic_fraud_dataset(
    dataset_path: Path,
    rows: int = 6000,
    random_state: int = 42,
) -> pd.DataFrame:
    rng = np.random.default_rng(random_state)

    payment_type = rng.binomial(1, 0.38, rows)
    base_amount = rng.lognormal(mean=8.05, sigma=1.0, size=rows)
    spike_mask = rng.binomial(1, 0.07, rows)
    transaction_amount = np.clip(base_amount + spike_mask * rng.uniform(25000, 160000, rows), 50, 350000)

    transaction_velocity = np.clip(rng.poisson(1.2, rows) + rng.binomial(1, 0.08, rows) * rng.integers(3, 12, rows), 0, 25)
    ip_risk = np.clip(rng.beta(1.4, 6.5, rows) * 100 + rng.binomial(1, 0.08, rows) * rng.uniform(35, 80, rows), 0, 100)
    device_risk = np.clip(rng.beta(1.6, 7.5, rows) * 100 + rng.binomial(1, 0.1, rows) * rng.uniform(30, 75, rows), 0, 100)
    geo_distance = np.clip(rng.exponential(120, rows) + rng.binomial(1, 0.06, rows) * rng.uniform(850, 4500, rows), 0, 9000)
    impossible_travel = ((geo_distance >= 850) | (rng.random(rows) < 0.018)).astype(int)
    hour_of_day = rng.integers(0, 24, rows)
    repeated_failures = np.clip(rng.poisson(0.25, rows) + rng.binomial(1, 0.05, rows) * rng.integers(2, 8, rows), 0, 15)
    new_device_flag = rng.binomial(1, 0.16, rows)

    night_risk = ((hour_of_day <= 5) | (hour_of_day >= 23)).astype(float)
    amount_risk = np.clip(transaction_amount / 75000, 0, 1)
    velocity_risk = np.clip(transaction_velocity / 8, 0, 1)
    ip_risk_norm = ip_risk / 100
    device_risk_norm = device_risk / 100
    geo_risk_norm = np.clip(geo_distance / 1800, 0, 1)
    failure_risk = np.clip(repeated_failures / 5, 0, 1)

    logits = (
        -3.7
        + 2.45 * amount_risk
        + 2.15 * velocity_risk
        + 1.95 * ip_risk_norm
        + 1.65 * device_risk_norm
        + 1.85 * impossible_travel
        + 1.15 * new_device_flag
        + 0.95 * failure_risk
        + 0.55 * night_risk
        + 0.35 * payment_type
        + 0.45 * geo_risk_norm
    )
    fraud_probability = np.clip(_sigmoid(logits) + rng.normal(0, 0.035, rows), 0.01, 0.99)
    fraud_label = rng.binomial(1, fraud_probability)

    dataset = pd.DataFrame(
        {
            "transactionAmount": transaction_amount.round(2),
            "paymentType": payment_type,
            "transactionVelocity": transaction_velocity,
            "ipRisk": ip_risk.round(2),
            "deviceRisk": device_risk.round(2),
            "geoDistance": geo_distance.round(2),
            "impossibleTravel": impossible_travel,
            "hourOfDay": hour_of_day,
            "repeatedFailures": repeated_failures,
            "newDeviceFlag": new_device_flag,
            "fraudLabel": fraud_label,
        }
    )

    dataset_path.parent.mkdir(parents=True, exist_ok=True)
    dataset[FEATURE_COLUMNS + ["fraudLabel"]].to_csv(dataset_path, index=False)
    return dataset
