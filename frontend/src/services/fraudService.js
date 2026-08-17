import { api } from "./api";

export const getFraudStats = async () => {
  const response = await api.get("/api/fraud/stats");
  return response.data;
};

export const getTransactions = async () => {
  const response = await api.get("/api/transactions");
  return response.data.transactions || [];
};

export const getTransactionById = async (transactionId) => {
  const transactions = await getTransactions();
  return transactions.find((transaction) =>
    [transaction.transactionId, transaction.transactionReference, transaction._id, transaction.id]
      .filter(Boolean)
      .map(String)
      .includes(String(transactionId))
  );
};

export const getFraudAlerts = async () => {
  const response = await api.get("/api/fraud/alerts");
  return response.data.alerts || [];
};

export const getDashboardBundle = async () => {
  const [statsResponse, transactions, alerts] = await Promise.all([
    getFraudStats(),
    getTransactions(),
    getFraudAlerts()
  ]);

  return {
    stats: statsResponse.stats || {},
    riskTrends: statsResponse.riskTrends || [],
    suspiciousGeolocationActivity: statsResponse.suspiciousGeolocationActivity || [],
    recentAlerts: statsResponse.recentAlerts || [],
    aiConfidenceLevels: statsResponse.aiConfidenceLevels || {
      levels: { low: 0, medium: 0, high: 0 },
      averageConfidence: 0,
      byModelVersion: []
    },
    transactions,
    alerts
  };
};
