const axios = require("axios");
const logger = require("../utils/logger");
const { isPrivateIpAddress, normalizeIpAddress } = require("../utils/network");

const cache = new Map();

const parsePositiveInteger = (value, fallback) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const getCachedLocation = (ipAddress) => {
  const entry = cache.get(ipAddress);
  if (!entry) {
    return null;
  }

  if (Date.now() > entry.expiresAt) {
    cache.delete(ipAddress);
    return null;
  }

  return entry.value;
};

const setCachedLocation = (ipAddress, value) => {
  const ttlMs = parsePositiveInteger(process.env.GEOLOCATION_CACHE_TTL_MS, 10 * 60 * 1000);
  cache.set(ipAddress, {
    value,
    expiresAt: Date.now() + ttlMs
  });
};

const sleep = (milliseconds) =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

const calculateIpRisk = ({ ipAddress, geoData, skipped }) => {
  if (skipped) {
    return 5;
  }

  if (!normalizeIpAddress(ipAddress)) {
    return 45;
  }

  if (!geoData) {
    return 35;
  }

  let risk = 10;
  if (geoData.proxy) risk += 35;
  if (geoData.hosting) risk += 25;
  if (
    !geoData.city ||
    !geoData.country ||
    geoData.city === "Unknown" ||
    geoData.country === "Unknown"
  ) {
    risk += 15;
  }
  if (geoData.country && geoData.country !== "India") risk += 8;

  return Math.max(0, Math.min(risk, 100));
};

const requestIPLocation = async ({ geolocationUrl, normalizedIp, timeoutMs }) => {
  const response = await axios.get(`${geolocationUrl}/${normalizedIp}`, {
    params: {
      fields:
        "status,message,country,city,lat,lon,isp,org,as,query,proxy,hosting,mobile"
    },
    timeout: timeoutMs
  });

  if (response.data.status === "fail") {
    return {
      success: false,
      message: response.data.message || "Unable to fetch IP location",
      data: null
    };
  }

  const data = {
    country: response.data.country || "Unknown",
    city: response.data.city || "Unknown",
    latitude: Number(response.data.lat),
    longitude: Number(response.data.lon),
    isp: response.data.isp || null,
    organization: response.data.org || null,
    autonomousSystem: response.data.as || null,
    query: response.data.query || normalizedIp,
    proxy: Boolean(response.data.proxy),
    hosting: Boolean(response.data.hosting),
    mobile: Boolean(response.data.mobile),
    source: "ip-api"
  };

  return {
    success: true,
    data: {
      ...data,
      ipRisk: calculateIpRisk({ ipAddress: normalizedIp, geoData: data })
    }
  };
};

const fetchIPLocation = async (ipAddress) => {
  try {
    const normalizedIp = normalizeIpAddress(ipAddress);
    if (!normalizedIp || isPrivateIpAddress(normalizedIp)) {
      return {
        success: false,
        message: "Geolocation skipped for private or invalid IP address",
        data: {
          ipRisk: calculateIpRisk({ ipAddress: normalizedIp, skipped: true })
        }
      };
    }

    const cached = getCachedLocation(normalizedIp);
    if (cached) {
      return cached;
    }

    const geolocationUrl = process.env.GEOLOCATION_URL || "http://ip-api.com/json";
    const timeoutMs = parsePositiveInteger(process.env.GEOLOCATION_TIMEOUT_MS, 3500);
    const attempts = parsePositiveInteger(process.env.GEOLOCATION_RETRY_ATTEMPTS, 2);
    let lastError = null;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const result = await requestIPLocation({ geolocationUrl, normalizedIp, timeoutMs });
        if (result.success) {
          setCachedLocation(normalizedIp, result);
        }
        return result;
      } catch (error) {
        lastError = error;
        logger.warn("IP geolocation attempt failed", {
          attempt,
          attempts,
          message: error.message,
          code: error.code
        });

        if (attempt < attempts) {
          await sleep(150 * attempt);
        }
      }
    }

    throw lastError || new Error("Unable to fetch IP location");
  } catch (error) {
    logger.warn("IP geolocation request failed", {
      message: error.message,
      code: error.code
    });
    return {
      success: false,
      message: "Unable to fetch IP location",
      data: {
        ipRisk: calculateIpRisk({ ipAddress, geoData: null })
      }
    };
  }
};

const clearGeoLocationCache = () => cache.clear();

module.exports = { calculateIpRisk, clearGeoLocationCache, fetchIPLocation };
