from app.services.training_service import train_and_persist_model


def main() -> None:
    result = train_and_persist_model(force=True)
    metrics = result["metrics"]
    print("Fraud model trained successfully")
    print(f"Rows: {result['trainedRows']}")
    print(f"Accuracy: {metrics['accuracy']}")
    print(f"Precision: {metrics['precision']}")
    print(f"Recall: {metrics['recall']}")
    print(f"F1: {metrics['f1']}")
    print(f"ROC-AUC: {metrics['rocAuc']}")


if __name__ == "__main__":
    main()
