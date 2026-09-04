/**
 * Proxy Manager for Price Scraper SDK
 * Handles parsing, validation, and domain-based routing for HTTP proxies.
 */

function parseProxy(input) {
  const raw = input || process.env.PROXY_URL;
  if (!raw) return null;

  if (typeof raw === "object") {
    if (!raw.server) return null;
    return {
      server: raw.server,
      username: raw.username || undefined,
      password: raw.password || undefined,
    };
  }

  if (typeof raw !== "string" || !raw.trim()) return null;

  const str = raw.trim();
  const schemeMatch = str.match(/^(https?:\/\/)/i);
  const scheme = schemeMatch ? schemeMatch[1].toLowerCase() : "http://";
  const withoutScheme = schemeMatch ? str.slice(schemeMatch[0].length) : str;

  // 1. Format dengan autentikasi inline: user:pass@host:port
  if (withoutScheme.includes("@")) {
    try {
      const url = new URL(`${scheme}${withoutScheme}`);
      return {
        server: `${url.protocol}//${url.host}`,
        username: url.username ? decodeURIComponent(url.username) : undefined,
        password: url.password ? decodeURIComponent(url.password) : undefined,
      };
    } catch {}
  }

  // 2. Format dashboard penyedia proxy: host:port:user:pass (misal Decodo)
  const colonParts = withoutScheme.split(":");
  if (colonParts.length === 4) {
    const [host, port, user, pass] = colonParts;
    return {
      server: `${scheme}${host}:${port}`,
      username: user,
      password: pass,
    };
  }

  // 3. Format host:port tanpa autentikasi
  if (colonParts.length === 2 && !isNaN(Number(colonParts[1].split("/")[0]))) {
    return {
      server: `${scheme}${colonParts[0]}:${colonParts[1]}`,
      username: undefined,
      password: undefined,
    };
  }

  // 4. Fallback URL standar resmi
  try {
    const url = new URL(str.includes("://") ? str : `http://${str}`);
    if (!url.hostname) return null;
    return {
      server: `${url.protocol}//${url.host}`,
      username: url.username ? decodeURIComponent(url.username) : undefined,
      password: url.password ? decodeURIComponent(url.password) : undefined,
    };
  } catch {
    return null;
  }
}

function getProxyForUrl(url, options = {}) {
  const explicitProxy = options.proxy ? parseProxy(options.proxy) : null;
  const globalProxy = parseProxy();
  const proxyConfig = explicitProxy || globalProxy;
  if (!proxyConfig) return null;

  if (options.forceProxy) return proxyConfig;

  const rawDomains = process.env.PROXY_DOMAINS || "bangjeff.com";
  const proxyDomains = rawDomains
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);

  if (proxyDomains.includes("*") || proxyDomains.includes("all")) {
    return proxyConfig;
  }

  const hostname = (url instanceof URL ? url.hostname : new URL(url).hostname)
    .replace(/^www\./, "")
    .toLowerCase();

  const matches = proxyDomains.some(
    (d) => hostname === d || hostname.endsWith(`.${d}`),
  );
  if (matches) {
    return proxyConfig;
  }

  return null;
}

function toRealBrowserProxy(proxyConfig) {
  if (!proxyConfig || !proxyConfig.server) return undefined;
  try {
    const u = new URL(proxyConfig.server);
    return {
      host: u.hostname,
      port: Number.parseInt(u.port, 10) || (u.protocol === "https:" ? 443 : 80),
      username: proxyConfig.username || undefined,
      password: proxyConfig.password || undefined,
    };
  } catch {
    return undefined;
  }
}

module.exports = {
  getProxyForUrl,
  parseProxy,
  toRealBrowserProxy,
};
