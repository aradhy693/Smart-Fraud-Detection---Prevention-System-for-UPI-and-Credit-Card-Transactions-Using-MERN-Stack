from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, status, Depends
from pydantic import BaseModel, Field

from app.dependencies.auth import verify_api_key
from app.schemas.transaction_schema import TransactionInput
from app.services.platform_service import (
    batch_predict,
    ensure_model_registry,
    explain_prediction,
    get_drift_report,
    get_feature_store,
    get_model_dashboard,
    get_platform_health,
    get_prediction_history,
    get_prediction_job,
    promote_model,
    queue_prediction,
    rollback_model,
    streaming_prediction_event,
    submit_feedback,
    trigger_retraining,
)


router = APIRouter(prefix="/ai", tags=["ai-platform"], dependencies=[Depends(verify_api_key)])


class RollbackRequest(BaseModel):
    targetVersion: Optional[str] = Field(default=None, max_length=120)


class FeedbackRequest(BaseModel):
    predictionId: Optional[str] = Field(default=None, max_length=128)
    transactionId: Optional[str] = Field(default=None, max_length=128)
    label: str = Field(pattern="^(FRAUD|LEGITIMATE|FALSE_POSITIVE|CONFIRMED_FRAUD)$")
    analystId: Optional[str] = Field(default=None, max_length=128)
    notes: str = Field(default="", max_length=1000)
    source: str = Field(default="human-feedback", max_length=80)


class BatchPredictionRequest(BaseModel):
    transactions: List[TransactionInput] = Field(min_length=1, max_length=250)


def _handle_value_error(error: ValueError) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail={
            "success": False,
            "message": str(error),
            "error": {"code": "AI_PLATFORM_NOT_FOUND", "details": None},
        },
    )


@router.get("/dashboard")
def ai_dashboard() -> Dict[str, Any]:
    return {"success": True, **get_model_dashboard()}


@router.get("/models")
def model_registry() -> Dict[str, Any]:
    return {"success": True, "registry": ensure_model_registry()}


@router.post("/models/{version}/promote")
def promote_model_version(version: str) -> Dict[str, Any]:
    try:
        return {"success": True, "registry": promote_model(version)}
    except ValueError as error:
        raise _handle_value_error(error) from error


@router.post("/models/rollback")
def rollback_model_version(payload: RollbackRequest) -> Dict[str, Any]:
    try:
        return {"success": True, "registry": rollback_model(payload.targetVersion)}
    except ValueError as error:
        raise _handle_value_error(error) from error


@router.get("/features")
def feature_store() -> Dict[str, Any]:
    return {"success": True, "featureStore": get_feature_store()}


@router.get("/drift")
def drift_report(limit: int = Query(default=500, ge=50, le=2000)) -> Dict[str, Any]:
    return {"success": True, "drift": get_drift_report(limit=limit)}


@router.get("/predictions")
def prediction_history(limit: int = Query(default=100, ge=1, le=1000)) -> Dict[str, Any]:
    return {"success": True, "predictions": get_prediction_history(limit=limit)}


@router.get("/explainability/{prediction_id}")
def explainability(prediction_id: str) -> Dict[str, Any]:
    try:
        return {"success": True, "explanation": explain_prediction(prediction_id)}
    except ValueError as error:
        raise _handle_value_error(error) from error


@router.get("/health")
def platform_health() -> Dict[str, Any]:
    return get_platform_health()


@router.post("/feedback")
def feedback(payload: FeedbackRequest) -> Dict[str, Any]:
    return {"success": True, "feedback": submit_feedback(payload.model_dump())}


@router.post("/retrain")
def retrain(background: bool = False) -> Dict[str, Any]:
    return trigger_retraining(background=background)


@router.post("/batch-predict")
def batch_prediction(payload: BatchPredictionRequest) -> Dict[str, Any]:
    return batch_predict([transaction.model_dump() for transaction in payload.transactions])


@router.post("/predict-async")
def async_prediction(transaction: TransactionInput) -> Dict[str, Any]:
    return {"success": True, "job": queue_prediction(transaction.model_dump())}


@router.get("/prediction-jobs/{job_id}")
def prediction_job(job_id: str) -> Dict[str, Any]:
    job = get_prediction_job(job_id)
    if not job:
        raise _handle_value_error(ValueError("Prediction job was not found"))
    return {"success": True, "job": job}


@router.post("/stream-predict")
def stream_prediction(transaction: TransactionInput) -> Dict[str, Any]:
    return {"success": True, "streamEvent": streaming_prediction_event(transaction.model_dump())}
