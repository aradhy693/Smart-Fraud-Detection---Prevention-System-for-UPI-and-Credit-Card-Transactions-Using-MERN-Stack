from app.utils.features import engineer_features
from app.schemas.transaction_schema import TransactionInput


def build_feature_vector(transaction: TransactionInput) -> dict:
    return engineer_features(transaction)
