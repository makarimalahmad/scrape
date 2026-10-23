// Smart Proxy Router: parsing, validasi, dan routing proxy berbasis domain toko
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

  const teksProxy = raw.trim();
  const schemeMatch = teksProxy.match(/^(https?:\/\/)/i);
  const scheme = schemeMatch ? schemeMatch[1].toLowerCase() : "http://";
  const withoutScheme = schemeMatch ? teksProxy.slice(schemeMatch[0].length) : teksProxy;

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
    const url = new URL(teksProxy.includes("://") ? teksProxy : `http://${teksProxy}`);
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
  if (options.disableProxy) return null;

  const explicitProxy = options.proxy ? parseProxy(options.proxy) : null;
  const globalProxy = parseProxy();
  const proxyConfig = explicitProxy || globalProxy;
  if (!proxyConfig) return null;

  if (options.forceProxy) return proxyConfig;

  const rawDomains = process.env.PROXY_DOMAINS || "";
  const domainParts = rawDomains.split(",");
  const proxyDomains = [];
  for (const part of domainParts) {
    const domainBersih = part.trim().toLowerCase();
    if (domainBersih) {
      proxyDomains.push(domainBersih);
    }
  }

  if (proxyDomains.includes("*") || proxyDomains.includes("all")) {
    return proxyConfig;
  }

  const hostname = (url instanceof URL ? url.hostname : new URL(url).hostname)
    .replace(/^www\./, "")
    .toLowerCase();

  for (const domainTarget of proxyDomains) {
    if (hostname === domainTarget || hostname.endsWith(`.${domainTarget}`)) {
      return proxyConfig;
    }
  }

  return null;
}

function toRealBrowserProxy(proxyConfig) {
  if (!proxyConfig || !proxyConfig.server) return undefined;
  try {
    const urlServer = new URL(proxyConfig.server);
    return {
      host: urlServer.hostname,
      port: Number.parseInt(urlServer.port, 10) || (urlServer.protocol === "https:" ? 443 : 80),
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
