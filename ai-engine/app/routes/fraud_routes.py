from fastapi import APIRouter, HTTPException, status, Depends

from app.config import get_settings
from app.dependencies.auth import verify_api_key
from app.schemas.transaction_schema import FraudPrediction, HealthResponse, TrainingResponse, TransactionInput
from app.services.model_service import get_model_artifact, is_model_ready, predict_transaction_fraud, refresh_model_artifact
from app.services.platform_service import ensure_model_registry, register_trained_model

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
def health_check() -> HealthResponse:
    settings = get_settings()
    try:
        model_ready = is_model_ready()
        if not model_ready:
            get_model_artifact()
            model_ready = is_model_ready()
        ensure_model_registry()

        return HealthResponse(
            service=settings.app_name,
            modelReady=model_ready,
            modelVersion=settings.model_version,
            modelPath=str(settings.model_path),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "success": False,
                "message": "AI engine health check failed",
                "error": {"code": "AI_HEALTH_CHECK_FAILED", "details": str(exc)},
            },
        ) from exc


@router.post("/predict", response_model=FraudPrediction, dependencies=[Depends(verify_api_key)])
def predict(transaction: TransactionInput) -> FraudPrediction:
    try:
        return predict_transaction_fraud(transaction)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "success": False,
                "message": "Fraud prediction failed",
                "error": {"code": "AI_PREDICTION_FAILED", "details": str(exc)},
            },
        ) from exc


@router.post("/train", response_model=TrainingResponse, dependencies=[Depends(verify_api_key)])
def train() -> TrainingResponse:
    settings = get_settings()
    try:
        artifact = refresh_model_artifact()
        register_trained_model(artifact, stage="challenger")
        return TrainingResponse(
            modelVersion=artifact["modelVersion"],
            modelPath=str(settings.model_path),
            datasetPath=str(settings.dataset_path),
            trainedRows=int(artifact["trainedRows"]),
            metrics=artifact["metrics"],
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "success": False,
                "message": "Model training failed",
                "error": {"code": "AI_TRAINING_FAILED", "details": str(exc)},
            },
        ) from exc
