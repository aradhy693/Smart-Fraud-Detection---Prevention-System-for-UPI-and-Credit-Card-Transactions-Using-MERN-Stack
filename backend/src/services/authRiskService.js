const { isPrivateIpAddress } = require("../utils/network");

const scoreRisk = ({ user, loginRisk, deviceContext, req }) => {
  const signals = [];
  let score = 0;

  if (deviceContext?.isNewDevice) {
    score += 35;
    signals.push("NEW_DEVICE");
  }

  if (deviceContext?.trusted === false) {
    score += 15;
    signals.push("UNTRUSTED_DEVICE");
  }

  if (loginRisk?.flags?.includes("IMPOSSIBLE_LOGIN_BEHAVIOR")) {
    score += 55;
    signals.push("IMPOSSIBLE_TRAVEL");
  }

  if (loginRisk?.flags?.includes("UNUSUAL_IP")) {
    score += 20;
    signals.push("UNUSUAL_IP");
  }

  if ((user?.failedLoginAttempts || 0) >= 3) {
    score += 15;
    signals.push("RECENT_FAILED_LOGINS");
  }

  const networkRisk = String(req?.headers?.["x-network-risk"] || "").toUpperCase();
  if (["TOR", "VPN"].includes(networkRisk)) {
    score += 30;
    signals.push(networkRisk);
  }

  if (networkRisk === "MALICIOUS") {
    score += 70;
    signals.push("IP_REPUTATION_MALICIOUS");
  }

  if (req && !isPrivateIpAddress(req.ip || req.socket?.remoteAddress) && loginRisk?.ipAddress !== user?.lastLoginIp) {
    score += 5;
  }

  const clampedScore = Math.min(score, 100);
  const riskLevel = clampedScore >= 75 ? "HIGH" : clampedScore >= 35 ? "MEDIUM" : "LOW";

  return {
    riskScore: clampedScore,
    riskLevel,
    signals,
    requireMfa: riskLevel === "MEDIUM" || user?.mfaEnabled,
    blockSession: riskLevel === "HIGH"
  };
};

module.exports = {
  scoreRisk
};
