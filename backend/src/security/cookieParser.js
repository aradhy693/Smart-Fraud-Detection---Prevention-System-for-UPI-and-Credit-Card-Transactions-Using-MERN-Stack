const parseCookieHeader = (cookieHeader) => {
  if (!cookieHeader || typeof cookieHeader !== "string") {
    return {};
  }

  return cookieHeader.split(";").reduce((cookies, part) => {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex === -1) {
      return cookies;
    }

    const key = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();
    if (!key) {
      return cookies;
    }

    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = value;
    }

    return cookies;
  }, {});
};

const getCookieValue = (req, name) => {
  if (!name) {
    return null;
  }

  const parsedCookies = req?.cookies || parseCookieHeader(req?.headers?.cookie);
  return parsedCookies[name] || null;
};

module.exports = {
  getCookieValue,
  parseCookieHeader
};
