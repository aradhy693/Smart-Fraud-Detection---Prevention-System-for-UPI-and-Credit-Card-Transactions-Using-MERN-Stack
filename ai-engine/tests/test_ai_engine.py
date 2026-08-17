import os
import pytest

# Set dummy API key before importing FastAPI app to satisfy startup check
os.environ["AI_ENGINE_API_KEY"] = "test-api-key-for-fastapi"

from fastapi.testclient import TestClient
from app.config import get_settings
from app.main import app

client = TestClient(app)


def test_health_endpoint_remains_public():
    # Health endpoint should remain public (no X-AI-API-Key header required)
    response = client.get("/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["modelReady"] is True
    assert payload["modelVersion"] == "random-forest-hybrid-v1"


def test_predict_allows_low_risk_transaction_with_valid_key():
    response = client.post(
        "/predict",
        headers={"X-AI-API-Key": "test-api-key-for-fastapi"},
        json={
            "userId": "user-1",
            "paymentType": "UPI",
            "transactionAmount": 650,
            "transactionVelocity": 0,
            "ipRisk": 4,
            "deviceRisk": 3,
            "geoDistance": 2,
            "impossibleTravel": False,
            "hourOfDay": 14,
            "repeatedFailures": 0,
            "newDeviceFlag": False,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["decision"] == "ALLOWED"
    assert payload["riskLevel"] == "LOW_RISK"
    assert 0 <= payload["fraudProbability"] < 0.4


def test_predict_blocks_high_risk_transaction_with_valid_key():
    response = client.post(
        "/predict",
        headers={"X-AI-API-Key": "test-api-key-for-fastapi"},
        json={
            "userId": "user-1",
            "paymentType": "CARD",
            "transactionAmount": 95000,
            "transactionVelocity": 9,
            "ipRisk": 91,
            "deviceRisk": 84,
            "geoDistance": 2100,
            "impossibleTravel": True,
            "hourOfDay": 2,
            "repeatedFailures": 5,
            "newDeviceFlag": True,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["decision"] == "BLOCKED"
    assert payload["riskLevel"] == "HIGH_RISK"
    assert payload["fraudProbability"] >= 0.75
    assert payload["featureContributions"]["transactionAmount"] > 0


def test_predict_rejects_invalid_payload_even_with_valid_key():
    response = client.post(
        "/predict",
        headers={"X-AI-API-Key": "test-api-key-for-fastapi"},
        json={
            "paymentType": "UPI",
            "transactionAmount": -50,
        },
    )

    assert response.status_code == 422
    payload = response.json()
    assert payload["success"] is False
    assert payload["error"]["code"] == "VALIDATION_ERROR"


def test_train_endpoint_returns_metrics_with_valid_key():
    response = client.post(
        "/train",
        headers={"X-AI-API-Key": "test-api-key-for-fastapi"}
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    for metric_name in ["accuracy", "precision", "recall", "f1", "rocAuc"]:
        assert metric_name in payload["metrics"]
        assert 0 <= payload["metrics"][metric_name] <= 1


def test_predict_missing_api_key_returns_401():
    response = client.post(
        "/predict",
        json={
            "userId": "user-1",
            "paymentType": "UPI",
            "transactionAmount": 650,
        },
    )
    assert response.status_code == 401
    payload = response.json()
    assert payload["success"] is False
    assert payload["message"] == "API key is missing"
    assert payload["error"]["code"] == "UNAUTHORIZED"


def test_predict_wrong_api_key_returns_401():
    response = client.post(
        "/predict",
        headers={"X-AI-API-Key": "wrong-api-key"},
        json={
            "userId": "user-1",
            "paymentType": "UPI",
            "transactionAmount": 650,
        },
    )
    assert response.status_code == 401
    payload = response.json()
    assert payload["success"] is False
    assert payload["message"] == "Invalid API key"
    assert payload["error"]["code"] == "UNAUTHORIZED"


def test_ai_engine_api_key_placeholder_is_rejected(monkeypatch):
    get_settings.cache_clear()
    monkeypatch.setenv("AI_ENGINE_API_KEY", "<generate-with-secrets.token_hex-32>")

    with pytest.raises(ValueError, match="placeholder"):
        get_settings()

    get_settings.cache_clear()
    monkeypatch.setenv("AI_ENGINE_API_KEY", "test-api-key-for-fastapi")
    get_settings()
