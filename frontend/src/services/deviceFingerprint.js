const textEncoder = new TextEncoder();

const toHex = (buffer) =>
  Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

const hashValue = async (value) => {
  if (!globalThis.crypto?.subtle) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }

    return hash.toString(16).padStart(64, "0").slice(-64);
  }

  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(value));
  return toHex(digest);
};

const getCanvasFingerprint = () => {
  if (!HTMLCanvasElement.prototype.getContext.toString().includes("[native code]")) {
    return "canvas-unavailable";
  }

  try {
    const canvas = document.createElement("canvas");
    canvas.width = 240;
    canvas.height = 60;
    const context = canvas.getContext("2d");
    if (!context) {
      return "canvas-unavailable";
    }

    context.textBaseline = "top";
    context.font = "16px Arial";
    context.fillStyle = "#102030";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#f5f5f5";
    context.fillText("Smart Fraud Detection Device Trust", 8, 12);
    context.strokeStyle = "#38bdf8";
    context.beginPath();
    context.arc(210, 28, 18, 0, Math.PI * 2);
    context.stroke();

    return canvas.toDataURL();
  } catch {
    return "canvas-unavailable";
  }
};

const detectBrowser = () => {
  const userAgent = navigator.userAgent;
  if (userAgent.includes("Edg/")) return "Microsoft Edge";
  if (userAgent.includes("Chrome/")) return "Chrome";
  if (userAgent.includes("Firefox/")) return "Firefox";
  if (userAgent.includes("Safari/")) return "Safari";
  return "Unknown";
};

const detectOs = () => {
  const platform = navigator.userAgent;
  if (/Windows/i.test(platform)) return "Windows";
  if (/Mac OS|Macintosh/i.test(platform)) return "macOS";
  if (/Android/i.test(platform)) return "Android";
  if (/iPhone|iPad|iPod/i.test(platform)) return "iOS";
  if (/Linux/i.test(platform)) return "Linux";
  return "Unknown";
};

export const collectDeviceMetadata = () => ({
  browser: detectBrowser(),
  os: detectOs(),
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Unknown",
  screenResolution: `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`,
  language: navigator.language || "Unknown",
  userAgent: navigator.userAgent,
  canvas: getCanvasFingerprint()
});

export const encodeDeviceMetadata = (metadata) => {
  const json = JSON.stringify(metadata);
  const bytes = textEncoder.encode(json);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

export const getDeviceHeaders = async () => {
  const metadata = collectDeviceMetadata();
  const fingerprint = await hashValue(
    [
      metadata.browser,
      metadata.os,
      metadata.timezone,
      metadata.screenResolution,
      metadata.language,
      metadata.userAgent,
      metadata.canvas
    ].join("|")
  );

  return {
    "X-Device-Fingerprint": fingerprint,
    "X-Device-Metadata": encodeDeviceMetadata(metadata)
  };
};
