const axios = require("axios");
const ThreatIntel = require("../models/ThreatIntel");
const { blindIndex } = require("../security/cryptoUtils");
const logger = require("../utils/logger");
const { isPrivateIpAddress, normalizeIpAddress } = require("../utils/network");

const cache = new Map();
let torExitCache = {
  expiresAt: 0,
  addresses: new Set()
};

const parsePositiveInteger = (value, fallback) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const clampScore = (score) => Math.max(0, Math.min(Math.round(score), 100));

const getThreatLevel = (score) => {
  if (score >= 90) return "CRITICAL";
  if (score >= 70) return "HIGH";
  if (score >= 35) return "MEDIUM";
  return "LOW";
};

const unique = (items) => [...new Set(items.filter(Boolean))];

const getCacheTtlMs = () => parsePositiveInteger(process.env.THREAT_INTEL_CACHE_TTL_MS, 15 * 60 * 1000);

const getTimeoutMs = () => parsePositiveInteger(process.env.THREAT_INTEL_TIMEOUT_MS, 3000);

const getRetryAttempts = () => parsePositiveInteger(process.env.THREAT_INTEL_RETRY_ATTEMPTS, 2);

const sleep = (milliseconds) =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

const getCachedReport = (ipAddress) => {
  const cached = cache.get(ipAddress);
  if (!cached) return null;

  if (Date.now() > cached.expiresAt) {
    cache.delete(ipAddress);
    return null;
  }

  return {
    ...cached.value,
    cacheHit: true,
    checkedAt: new Date().toISOString()
  };
};

const setCachedReport = (ipAddress, value) => {
  cache.set(ipAddress, {
    value,
    expiresAt: Date.now() + getCacheTtlMs()
  });
};

const requestWithRetry = async (requestConfig, provider) => {
  const attempts = getRetryAttempts();
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await axios({
        timeout: getTimeoutMs(),
        ...requestConfig
      });
      return response.data;
    } catch (error) {
      lastError = error;
      logger.warn("Threat intelligence provider failed", {
        provider,
        attempt,
        attempts,
        code: error.code,
        message: error.message
      });

      if (attempt < attempts) {
        await sleep(150 * attempt);
      }
    }
  }

  throw lastError || new Error(`${provider} request failed`);
};

const getConfiguredSet = (envName, fallback = "") =>
  new Set(
    String(process.env[envName] || fallback)
      .split(",")
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean)
  );

const calculateCountryRisk = (countryCode, country) => {
  const highRiskCountries = getConfiguredSet("HIGH_RISK_COUNTRIES", "KP,IR,SY");
  const trustedCountries = getConfiguredSet("TRUSTED_COUNTRIES", "IN,INDIA");
  const normalizedCode = String(countryCode || "").toUpperCase();
  const normalizedCountry = String(country || "").toUpperCase();

  if (highRiskCountries.has(normalizedCode) || highRiskCountries.has(normalizedCountry)) {
    return 35;
  }

  if (!normalizedCode && !normalizedCountry) {
    return 8;
  }

  if (trustedCountries.has(normalizedCode) || trustedCountries.has(normalizedCountry)) {
    return 0;
  }

  return 10;
};

const fetchIpApi = async (ipAddress) => {
  const data = await requestWithRetry(
    {
      method: "GET",
      url: `${process.env.THREAT_IP_API_URL || "http://ip-api.com/json"}/${ipAddress}`,
      params: {
        fields:
          "status,message,country,countryCode,city,lat,lon,timezone,isp,org,as,query,proxy,hosting,mobile"
      }
    },
    "ip-api"
  );

  if (data.status === "fail") {
    throw new Error(data.message || "ip-api failed");
  }

  return {
    provider: "ip-api",
    country: data.country || "Unknown",
    countryCode: data.countryCode || "",
    city: data.city || "Unknown",
    latitude: Number(data.lat),
    longitude: Number(data.lon),
    timezone: data.timezone || "",
    isp: data.isp || "",
    organization: data.org || "",
    asn: data.as || "",
    proxy: Boolean(data.proxy),
    hosting: Boolean(data.hosting),
    mobile: Boolean(data.mobile)
  };
};

const fetchIpWhoIs = async (ipAddress) => {
  const data = await requestWithRetry(
    {
      method: "GET",
      url: `${process.env.THREAT_IPWHOIS_URL || "https://ipwho.is"}/${ipAddress}`
    },
    "ipwho.is"
  );

  if (data.success === false) {
    throw new Error(data.message || "ipwho.is failed");
  }

  return {
    provider: "ipwho.is",
    country: data.country || "Unknown",
    countryCode: data.country_code || "",
    city: data.city || "Unknown",
    latitude: Number(data.latitude),
    longitude: Number(data.longitude),
    timezone: data.timezone?.id || "",
    isp: data.connection?.isp || "",
    organization: data.connection?.org || "",
    asn: data.connection?.asn ? `AS${data.connection.asn}` : "",
    proxy: Boolean(data.security?.proxy),
    hosting: Boolean(data.security?.hosting),
    vpn: Boolean(data.security?.vpn),
    tor: Boolean(data.security?.tor)
  };
};

const fetchAbuseIpDb = async (ipAddress) => {
  if (!process.env.ABUSEIPDB_API_KEY) return null;

  const data = await requestWithRetry(
    {
      method: "GET",
      url: process.env.ABUSEIPDB_URL || "https://api.abuseipdb.com/api/v2/check",
      headers: {
        Key: process.env.ABUSEIPDB_API_KEY,
        Accept: "application/json"
      },
      params: {
        ipAddress,
        maxAgeInDays: parsePositiveInteger(process.env.ABUSEIPDB_MAX_AGE_DAYS, 90)
      }
    },
    "abuseipdb"
  );

  const abuse = data.data || {};
  return {
    provider: "abuseipdb",
    abuseConfidenceScore: Number(abuse.abuseConfidenceScore || 0),
    totalReports: Number(abuse.totalReports || 0),
    countryCode: abuse.countryCode || "",
    isp: abuse.isp || "",
    domain: abuse.domain || "",
    usageType: abuse.usageType || "",
    malicious: Number(abuse.abuseConfidenceScore || 0) >= 75
  };
};

const fetchIpQualityScore = async (ipAddress) => {
  if (!process.env.IPQUALITYSCORE_API_KEY) return null;

  const data = await requestWithRetry(
    {
      method: "GET",
      url: `${process.env.IPQUALITYSCORE_URL || "https://www.ipqualityscore.com/api/json/ip"}/${process.env.IPQUALITYSCORE_API_KEY}/${ipAddress}`,
      params: {
        strictness: 1,
        allow_public_access_points: true,
        fast: true
      }
    },
    "ipqualityscore"
  );

  if (data.success === false) {
    throw new Error(data.message || "IPQualityScore failed");
  }

  return {
    provider: "ipqualityscore",
    fraudScore: Number(data.fraud_score || 0),
    vpn: Boolean(data.vpn),
    tor: Boolean(data.tor),
    proxy: Boolean(data.proxy),
    bot: Boolean(data.bot_status),
    hosting: Boolean(data.hosting),
    countryCode: data.country_code || "",
    city: data.city || "",
    isp: data.ISP || data.isp || "",
    organization: data.organization || "",
    asn: data.ASN ? `AS${data.ASN}` : ""
  };
};

const fetchVirusTotal = async (ipAddress) => {
  if (!process.env.VIRUSTOTAL_API_KEY) return null;

  const data = await requestWithRetry(
    {
      method: "GET",
      url: `${process.env.VIRUSTOTAL_URL || "https://www.virustotal.com/api/v3/ip_addresses"}/${ipAddress}`,
      headers: {
        "x-apikey": process.env.VIRUSTOTAL_API_KEY
      }
    },
    "virustotal"
  );

  const stats = data.data?.attributes?.last_analysis_stats || {};
  return {
    provider: "virustotal",
    maliciousCount: Number(stats.malicious || 0),
    suspiciousCount: Number(stats.suspicious || 0),
    harmlessCount: Number(stats.harmless || 0),
    malicious: Number(stats.malicious || 0) > 0
  };
};

const fetchTorExitNodes = async () => {
  if (Date.now() < torExitCache.expiresAt) {
    return torExitCache.addresses;
  }

  try {
    const data = await requestWithRetry(
      {
        method: "GET",
        url: process.env.TOR_EXIT_NODE_URL || "https://check.torproject.org/exit-addresses",
        responseType: "text"
      },
      "tor-exit-nodes"
    );

    const addresses = new Set(
      String(data)
        .split(/\r?\n/)
        .filter((line) => line.startsWith("ExitAddress "))
        .map((line) => line.split(" ")[1])
        .filter(Boolean)
    );

    torExitCache = {
      addresses,
      expiresAt: Date.now() + parsePositiveInteger(process.env.TOR_EXIT_CACHE_TTL_MS, 60 * 60 * 1000)
    };
    return addresses;
  } catch (error) {
    logger.warn("Unable to refresh TOR exit node list", {
      message: error.message,
      code: error.code
    });
    torExitCache = {
      addresses: torExitCache.addresses || new Set(),
      expiresAt: Date.now() + 5 * 60 * 1000
    };
    return torExitCache.addresses;
  }
};

const mergeProviderData = (providerResults) => {
  const merged = providerResults.reduce(
    (accumulator, result) => {
      if (!result) return accumulator;

      Object.entries(result).forEach(([key, value]) => {
        if (["provider"].includes(key)) return;
        if (typeof value === "boolean") {
          accumulator[key] = Boolean(accumulator[key] || value);
          return;
        }
        if (value !== undefined && value !== null && value !== "" && accumulator[key] === undefined) {
          accumulator[key] = value;
        }
      });
      accumulator.providers.push(result.provider);
      return accumulator;
    },
    { providers: [] }
  );

  return merged;
};

const scoreMergedThreat = ({ ipAddress, merged, context }) => {
  let score = 0;
  const reasons = [];
  const flags = [];
  const knownMaliciousIps = getConfiguredSet("KNOWN_MALICIOUS_IPS");

  if (knownMaliciousIps.has(ipAddress)) {
    score += 100;
    reasons.push("Known Malicious IP");
    flags.push("KNOWN_MALICIOUS_IP");
  }

  if (merged.malicious) {
    score += 65;
    reasons.push("Known Malicious IP");
    flags.push("KNOWN_MALICIOUS_IP");
  }

  if (merged.tor) {
    score += 60;
    reasons.push("TOR Exit Node");
    flags.push("TOR_EXIT_NODE");
  }

  if (merged.vpn) {
    score += 30;
    reasons.push("VPN Detected");
    flags.push("VPN_DETECTED");
  }

  if (merged.proxy) {
    score += 25;
    reasons.push("Proxy Detected");
    flags.push("PROXY_DETECTED");
  }

  if (merged.hosting) {
    score += 25;
    reasons.push("Datacenter IP");
    flags.push("DATACENTER_IP");
  }

  if (Number.isFinite(Number(merged.abuseConfidenceScore)) && Number(merged.abuseConfidenceScore) > 0) {
    const abuseScore = Number(merged.abuseConfidenceScore);
    score += Math.min(abuseScore, 60);
    reasons.push(`AbuseIPDB confidence ${abuseScore}%`);
    flags.push("ABUSE_REPUTATION");
  }

  if (Number.isFinite(Number(merged.fraudScore)) && Number(merged.fraudScore) > 0) {
    const fraudScore = Number(merged.fraudScore);
    score += Math.min(fraudScore, 60);
    reasons.push(`IPQualityScore fraud score ${fraudScore}`);
    flags.push("IPQS_REPUTATION");
  }

  if (Number(merged.maliciousCount || 0) > 0 || Number(merged.suspiciousCount || 0) > 0) {
    score += Math.min(Number(merged.maliciousCount || 0) * 35 + Number(merged.suspiciousCount || 0) * 15, 70);
    reasons.push("VirusTotal malicious or suspicious detections");
    flags.push("VIRUSTOTAL_REPUTATION");
  }

  const countryRisk = calculateCountryRisk(merged.countryCode, merged.country);
  if (countryRisk > 0) {
    score += countryRisk;
    reasons.push("Country Risk");
    flags.push("COUNTRY_RISK");
  }

  const timezoneMismatch =
    Boolean(context?.deviceTimezone && merged.timezone && context.deviceTimezone !== merged.timezone);
  if (timezoneMismatch) {
    score += 12;
    reasons.push("Timezone Validation Failed");
    flags.push("TIMEZONE_MISMATCH");
  }

  if (context?.impossibleTravel) {
    score += 45;
    reasons.push("Impossible Travel");
    flags.push("IMPOSSIBLE_TRAVEL");
  }

  if (Number(context?.geolocationRisk || 0) > 0) {
    score += Math.min(Number(context.geolocationRisk), 25);
    reasons.push("Geolocation Verification Risk");
    flags.push("GEOLOCATION_RISK");
  }

  const clamped = clampScore(score);
  return {
    score: clamped,
    level: getThreatLevel(clamped),
    reasons: unique(reasons),
    flags: unique(flags),
    countryRisk,
    timezoneMismatch
  };
};

const buildPrivateIpReport = (ipAddress) => ({
  ipAddress,
  score: 0,
  level: "LOW",
  reasons: ["Private or internal IP"],
  flags: ["PRIVATE_IP"],
  country: "Internal",
  countryCode: "",
  city: "Internal",
  latitude: null,
  longitude: null,
  timezone: "",
  asn: "",
  isp: "",
  organization: "",
  provider: "local",
  vpn: false,
  tor: false,
  proxy: false,
  hosting: false,
  malicious: false,
  countryRisk: 0,
  timezoneMismatch: false,
  checkedAt: new Date().toISOString(),
  providers: ["local"],
  metadata: {}
});

const normalizeReport = ({ ipAddress, merged, scoring }) => ({
  ipAddress,
  ipHash: blindIndex(ipAddress, "threat-ip"),
  score: scoring.score,
  level: scoring.level,
  reasons: scoring.reasons,
  flags: scoring.flags,
  country: merged.country || "Unknown",
  countryCode: merged.countryCode || "",
  city: merged.city || "Unknown",
  latitude: Number.isFinite(Number(merged.latitude)) ? Number(merged.latitude) : null,
  longitude: Number.isFinite(Number(merged.longitude)) ? Number(merged.longitude) : null,
  timezone: merged.timezone || "",
  asn: merged.asn || "",
  isp: merged.isp || "",
  organization: merged.organization || "",
  provider: merged.providers[0] || "local",
  providers: unique(merged.providers),
  vpn: Boolean(merged.vpn),
  tor: Boolean(merged.tor),
  proxy: Boolean(merged.proxy),
  hosting: Boolean(merged.hosting),
  malicious: Boolean(merged.malicious),
  countryRisk: scoring.countryRisk,
  timezoneMismatch: scoring.timezoneMismatch,
  checkedAt: new Date().toISOString(),
  metadata: {
    abuseConfidenceScore: merged.abuseConfidenceScore || 0,
    totalReports: merged.totalReports || 0,
    ipqsFraudScore: merged.fraudScore || 0,
    vtMalicious: merged.maliciousCount || 0,
    vtSuspicious: merged.suspiciousCount || 0,
    usageType: merged.usageType || "",
    domain: merged.domain || ""
  }
});

const collectProviderSignals = async (ipAddress) => {
  const torExitNodesPromise = fetchTorExitNodes();
  const providerPromises = [
    fetchIpApi(ipAddress).catch(() => null),
    fetchIpWhoIs(ipAddress).catch(() => null),
    fetchAbuseIpDb(ipAddress).catch(() => null),
    fetchIpQualityScore(ipAddress).catch(() => null),
    fetchVirusTotal(ipAddress).catch(() => null)
  ];

  const [torExitNodes, ...providerResults] = await Promise.all([
    torExitNodesPromise,
    ...providerPromises
  ]);

  const merged = mergeProviderData(providerResults);
  if (torExitNodes.has(ipAddress)) {
    merged.tor = true;
    merged.providers.push("torproject");
  }

  return merged;
};

const inferEventType = (report, context = {}) => {
  if (context.fraudStatus === "BLOCKED" && report.level === "CRITICAL") return "CRITICAL_FRAUD";
  if (report.flags.includes("IMPOSSIBLE_TRAVEL")) return "IMPOSSIBLE_TRAVEL";
  if (report.tor) return "TOR_DETECTION";
  if (report.vpn) return "VPN_LOGIN";
  if (report.score >= 70) return "HIGH_THREAT_IP";
  return "IP_REPUTATION";
};

const persistThreatReport = async (report, context = {}) => {
  const record = await ThreatIntel.create({
    ipAddress: report.ipAddress,
    ipHash: report.ipHash,
    eventType: inferEventType(report, context),
    score: report.score,
    level: report.level,
    reasons: report.reasons,
    flags: report.flags,
    country: report.country,
    countryCode: report.countryCode,
    city: report.city,
    latitude: report.latitude,
    longitude: report.longitude,
    timezone: report.timezone,
    asn: report.asn,
    isp: report.isp,
    organization: report.organization,
    provider: report.provider,
    vpn: report.vpn,
    tor: report.tor,
    proxy: report.proxy,
    hosting: report.hosting,
    malicious: report.malicious,
    countryRisk: report.countryRisk,
    timezoneMismatch: report.timezoneMismatch,
    checkedAt: report.checkedAt ? new Date(report.checkedAt) : new Date(),
    metadata: {
      ...report.metadata,
      providers: report.providers,
      context
    }
  });

  return record;
};

const assessIpThreat = async (ipAddress, context = {}, options = {}) => {
  const normalizedIp = normalizeIpAddress(ipAddress);
  if (!normalizedIp) {
    const error = new Error("IP address is invalid");
    error.code = "INVALID_IP_ADDRESS";
    throw error;
  }

  let report = isPrivateIpAddress(normalizedIp)
    ? buildPrivateIpReport(normalizedIp)
    : getCachedReport(normalizedIp);

  if (!report) {
    const merged = await collectProviderSignals(normalizedIp);
    const scoring = scoreMergedThreat({ ipAddress: normalizedIp, merged, context });
    report = normalizeReport({ ipAddress: normalizedIp, merged, scoring });
    setCachedReport(normalizedIp, report);
  } else if (context?.impossibleTravel || context?.geolocationRisk) {
    const merged = {
      ...report,
      providers: report.providers || [report.provider || "cache"]
    };
    const scoring = scoreMergedThreat({ ipAddress: normalizedIp, merged, context });
    report = {
      ...report,
      score: Math.max(report.score, scoring.score),
      level: getThreatLevel(Math.max(report.score, scoring.score)),
      reasons: unique([...report.reasons, ...scoring.reasons]),
      flags: unique([...report.flags, ...scoring.flags]),
      countryRisk: Math.max(report.countryRisk || 0, scoring.countryRisk || 0),
      timezoneMismatch: Boolean(report.timezoneMismatch || scoring.timezoneMismatch)
    };
  }

  if (options.persist !== false) {
    try {
      const record = await persistThreatReport(report, context);
      report.recordId = record._id;
      report.eventType = record.eventType;
    } catch (error) {
      logger.warn("Failed to persist threat intelligence report", {
        ipAddress: normalizedIp,
        message: error.message
      });
    }
  } else {
    report.eventType = inferEventType(report, context);
  }

  return report;
};

const getThreatHistory = async ({ limit = 100 } = {}) =>
  ThreatIntel.find()
    .select("+ipAddress")
    .sort({ checkedAt: -1 })
    .limit(Math.min(Number(limit) || 100, 500));

const getThreatStats = async () => {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [summary, countryAgg, recentCritical] = await Promise.all([
    ThreatIntel.aggregate([
      {
        $group: {
          _id: null,
          totalChecks: { $sum: 1 },
          highThreats: {
            $sum: { $cond: [{ $in: ["$level", ["HIGH", "CRITICAL"]] }, 1, 0] }
          },
          vpnUsage: { $sum: { $cond: ["$vpn", 1, 0] } },
          torUsage: { $sum: { $cond: ["$tor", 1, 0] } },
          proxyUsage: { $sum: { $cond: ["$proxy", 1, 0] } },
          datacenterIps: { $sum: { $cond: ["$hosting", 1, 0] } },
          maliciousIps: { $sum: { $cond: ["$malicious", 1, 0] } },
          averageThreatScore: { $avg: "$score" }
        }
      }
    ]),
    ThreatIntel.aggregate([
      {
        $group: {
          _id: "$country",
          count: { $sum: 1 },
          averageScore: { $avg: "$score" },
          highThreats: {
            $sum: { $cond: [{ $in: ["$level", ["HIGH", "CRITICAL"]] }, 1, 0] }
          }
        }
      },
      { $sort: { averageScore: -1, count: -1 } },
      { $limit: 12 }
    ]),
    ThreatIntel.countDocuments({
      checkedAt: { $gte: since },
      level: { $in: ["HIGH", "CRITICAL"] }
    })
  ]);

  return {
    summary: {
      totalChecks: summary[0]?.totalChecks || 0,
      highThreats: summary[0]?.highThreats || 0,
      vpnUsage: summary[0]?.vpnUsage || 0,
      torUsage: summary[0]?.torUsage || 0,
      proxyUsage: summary[0]?.proxyUsage || 0,
      datacenterIps: summary[0]?.datacenterIps || 0,
      maliciousIps: summary[0]?.maliciousIps || 0,
      averageThreatScore: Number((summary[0]?.averageThreatScore || 0).toFixed(1)),
      recentCritical
    },
    riskCountries: countryAgg.map((entry) => ({
      country: entry._id || "Unknown",
      count: entry.count,
      highThreats: entry.highThreats,
      averageScore: Number((entry.averageScore || 0).toFixed(1))
    }))
  };
};

const getTopRiskThreats = async ({ limit = 20 } = {}) =>
  ThreatIntel.find()
    .select("+ipAddress")
    .sort({ score: -1, checkedAt: -1 })
    .limit(Math.min(Number(limit) || 20, 100));

const clearThreatIntelCache = () => {
  cache.clear();
  torExitCache = {
    expiresAt: 0,
    addresses: new Set()
  };
};

module.exports = {
  assessIpThreat,
  clearThreatIntelCache,
  getThreatHistory,
  getThreatLevel,
  getThreatStats,
  getTopRiskThreats,
  inferEventType,
  persistThreatReport
};
