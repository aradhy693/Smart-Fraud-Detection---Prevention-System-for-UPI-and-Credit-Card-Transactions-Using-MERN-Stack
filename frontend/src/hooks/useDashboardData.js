import { useCallback, useEffect, useMemo, useState } from "react";
import { getApiErrorMessage } from "../services/api";
import { getDashboardBundle } from "../services/fraudService";

const emptyBundle = {
  stats: {},
  riskTrends: [],
  suspiciousGeolocationActivity: [],
  recentAlerts: [],
  aiConfidenceLevels: {
    levels: { low: 0, medium: 0, high: 0 },
    averageConfidence: 0,
    byModelVersion: []
  },
  transactions: [],
  alerts: []
};

export default function useDashboardData(enabled) {
  const [data, setData] = useState(emptyBundle);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!enabled) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const bundle = await getDashboardBundle();
      setData(bundle);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return useMemo(
    () => ({
      data,
      error,
      loading,
      refresh,
      setData
    }),
    [data, error, loading, refresh]
  );
}
