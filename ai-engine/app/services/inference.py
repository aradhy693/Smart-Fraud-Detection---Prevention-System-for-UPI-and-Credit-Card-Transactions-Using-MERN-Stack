from app.schemas.transaction_schema import FraudPrediction, TransactionInput
from app.services.model_service import predict_transaction_fraud


def predict_fraud(transaction: TransactionInput) -> FraudPrediction:
    return predict_transaction_fraud(transaction)
