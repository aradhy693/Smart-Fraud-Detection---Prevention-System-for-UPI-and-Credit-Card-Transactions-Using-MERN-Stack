def explain_prediction(feature_contributions: dict[str, float]) -> dict[str, float]:
    return {
        feature_name: round(float(contribution), 2)
        for feature_name, contribution in feature_contributions.items()
    }
