const net = require("net");

const normalizeIpAddress = (value) => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().replace(/^::ffff:/, "");
  return net.isIP(normalized) ? normalized : null;
};

const getClientIp = (req) => {
  return (
    normalizeIpAddress(req.ip) ||
    normalizeIpAddress(req.socket?.remoteAddress) ||
    "127.0.0.1"
  );
};

const isPrivateIpAddress = (ipAddress) => {
  const ip = normalizeIpAddress(ipAddress);
  if (!ip) {
    return true;
  }

  if (ip === "127.0.0.1" || ip === "::1" || ip === "0.0.0.0") {
    return true;
  }

  if (ip.startsWith("10.") || ip.startsWith("192.168.")) {
    return true;
  }

  const octets = ip.split(".").map((part) => Number(part));
  if (octets.length === 4) {
    if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) {
      return true;
    }
    if (octets[0] === 169 && octets[1] === 254) {
      return true;
    }
  }

  const lowerIp = ip.toLowerCase();
  return lowerIp.startsWith("fc") || lowerIp.startsWith("fd") || lowerIp.startsWith("fe80");
};

module.exports = {
  getClientIp,
  isPrivateIpAddress,
  normalizeIpAddress
};
