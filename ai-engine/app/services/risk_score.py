from app.utils.features import decision_from_probability, risk_level_from_probability


def decision_from_score(score: float) -> str:
    return risk_level_from_probability(score / 100)


def transaction_action_from_score(score: float) -> str:
    return decision_from_probability(score / 100)


def rules_score(features: dict) -> tuple[float, dict[str, float]]:
    score = 0.0
    explanation: dict[str, float] = {}

    if features["transactionAmount"] >= 50000:
        score += 45
        explanation["transactionAmount"] = 45
    elif features["transactionAmount"] >= 25000:
        score += 22
        explanation["transactionAmount"] = 22

    if features["transactionVelocity"] >= 6:
        score += 28
        explanation["transactionVelocity"] = 28
    elif features["transactionVelocity"] >= 3:
        score += 14
        explanation["transactionVelocity"] = 14

    if features["impossibleTravel"]:
        score += 35
        explanation["impossibleTravel"] = 35

    if features["ipRisk"] >= 80:
        score += 25
        explanation["ipRisk"] = 25

    if features["newDeviceFlag"]:
        score += 12
        explanation["newDeviceFlag"] = 12

    return min(score, 100), explanation
