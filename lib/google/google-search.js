require("dotenv").config({ quiet: true });
const fs = require("fs");
const path = require("path");
const { DEFAULT_SELECTOR, scrape } = require("../../scrape");
const { exportCsv } = require("../utils/export-csv");
const { normalizeTokopediaUrl } = require("../extractors/parsers");
const { validateScrapeResults } = require("../validation/validate-results");
const {
  isMainStoreUrl,
  normalizeHostname,
} = require("../config/game-config");
const {
  selectCheapestProducts,
} = require("../matcher/product-matcher");

const NON_STORE_DOMAINS = [
  "youtube.com",
  "youtu.be",
  "instagram.com",
  "tiktok.com",
  "facebook.com",
  "fb.com",
  "x.com",
  "twitter.com",
  "linkedin.com",
  "pinterest.com",
  "reddit.com",
  "quora.com",
  "discord.com",
  "discord.gg",
  "twitch.tv",
  "wikipedia.org",
  "fandom.com",
  "play.google.com",
  "apps.apple.com",
  "medium.com",
  "blogspot.com",
  "wordpress.com",
  "kompas.com",
  "detik.com",
  "tribunnews.com",
  "cnnindonesia.com",
  "tempo.co",
  "google.com",
  "google.co.id",
  "kompasiana.com",
  "bca.co.id",
  "bankmandiri.co.id",
  "bri.co.id",
  "bni.co.id",
  "mtcgame.com",
  "eneba.com",
  "g2a.com",
  "kinguin.net",
  "cdkeys.com",
  "gamivo.com",
  "lynk.id",
  "linktr.ee",
  "carrd.co",
  "beacons.ai",
  "speedcash.co.id",
];

function getNonStoreDomains() {
  const custom = (process.env.ADDITIONAL_BLACKLIST_DOMAINS || "")
    .split(",")
    .map((d) => d.trim().replace(/^www\./, "").toLowerCase())
    .filter(Boolean);
  return custom.length ? [...NON_STORE_DOMAINS, ...custom] : NON_STORE_DOMAINS;
}

const GAME_RESULT_SIGNALS = {
  "mobile-legends": ["mobile legends", "mobilelegends", "mlbb"],
  "free-fire": ["free fire", "freefire", "free fire max"],
  "roblox": ["roblox", "robux"],
};

function classifyTopUpCompetitorResult(result, gameConfig) {
  if (!result?.link) return { eligible: false, reason: "missing_url" };

  let url;
  try {
    url = new URL(result.link);
  } catch {
    return { eligible: false, reason: "invalid_url" };
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    return { eligible: false, reason: "invalid_protocol" };
  }

  const hostname = url.hostname.replace(/^www\./, "").toLowerCase();
  const allNonStore = getNonStoreDomains();
  if (
    allNonStore.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
    )
  ) {
    return { eligible: false, reason: "non_store_domain" };
  }
  if (isMainStoreUrl(url.href)) {
    return { eligible: false, reason: "main_store" };
  }

  const title = String(result.title || "").toLowerCase();
  const snippet = String(result.snippet || "").toLowerCase();
  const pathname = decodeURIComponent(url.pathname).toLowerCase();
  const isEditorialSubdomain = /^(?:news|blog|blogs|artikel|article|media|press|m)\./i.test(hostname);
  const editorialPath =
    /\/(?:read|baca|berita|artikel|articles?|news|blog|blogs|post|posts|story|stories|press|press-release|warta|ulasan|kolom|opini|publikasi|tulisan|detail|view|content|feed|entry|entries|lifestyle|tekno|teknologi|gadget|finansial|ekonomi|bisnis|nasional|internasional|hype|community|guide|panduan|tips?|tag|tags)(?:\/|$)/i.test(pathname) ||
    /\/(?:cara|how-to)-/i.test(pathname) ||
    /\/(?:19|20)\d{2}\/(?:0[1-9]|1[0-2])(?:\/(?:0[1-9]|[12]\d|3[01]))?(?:\/|$)/.test(pathname) ||
    /\/(?:read\/)?\d{4,}(?:\/|-[a-z0-9])/i.test(pathname);
  const isMediaDomain =
    /(?:industry\.co\.id|kumparan\.com|suara\.com|liputan6\.com|sindonews\.com|merdeka\.com|jawapos\.com|bisnis\.com|kontan\.co\.id|antaranews\.com|inews\.id|grid\.id|republika\.co\.id|tempo\.co|tirto\.id|katadata\.co\.id|idntimes\.com|beritasatu\.com|pikiran-rakyat\.com|harianhaluan\.com|viva\.co\.id|kaskus\.co\.id|brainly\.co\.id)/i.test(hostname) ||
    /^(?:.*[.-])?(?:tribun|kabar|warta|harian|poskota|koran|jurnal|press|bulletin|times)[.-]/i.test(hostname) ||
    /^(?:.*[.-])?(?:linktr\.ee|lynk\.id|carrd\.co|beacons\.ai|bio\.link|taplink)/i.test(hostname);
  const editorialTitle =
    /^(?:\d+\s+)?(?:cara|tips?|panduan|tutorial|rekomendasi|daftar|inilah|simak|kenapa|mengapa|apa itu|apakah|bocoran|review|ulasan)\b/i.test(title) ||
    /\b(?:yang murah dan|lagi ada diskon|simak (?:di sini|caranya|penjelasannya)|begini cara|inilah (?:daftar|rekomendasi|tempat|cara)|cara mudah|tips dan trik|alasan mengapa|panduan lengkap|bisa hemat|promo heboh|wajib tahu|keuntungan dan kerugian|apakah aman|cara aman|review jujur|yang perlu diketahui)\b/i.test(title) ||
    /\b(?:resmi dari|menurut|dilansir dari|berdasarkan|dikutip dari)\b/i.test(title + " " + snippet) ||
    /\?$/i.test(title.trim());
  if (isEditorialSubdomain || editorialPath || isMediaDomain || editorialTitle) {
    return { eligible: false, reason: "editorial_page" };
  }

  const resultText = [
    hostname,
    pathname,
    title,
    result.snippet,
    result.displayed_link,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/[_/-]+/g, " ");
  const gameSignals = GAME_RESULT_SIGNALS[gameConfig.id] || [
    gameConfig.name.toLowerCase(),
  ];
  if (!gameSignals.some((signal) => resultText.includes(signal))) {
    return { eligible: false, reason: "game_not_relevant" };
  }

  const hasStoreSignal = /\btop\s*up\b|\bdiamonds?\b|\bvouchers?\b|\bgift\s*cards?\b|\brobux\b|\brecharge\b|\bisi\s*ulang\b|\b(?:beli|jual|harga|termurah)\b/i.test(
    resultText,
  );
  return hasStoreSignal
    ? { eligible: true, reason: "eligible_store" }
    : { eligible: false, reason: "transaction_not_detected" };
}

function isTopUpCompetitorResult(result, gameConfig) {
  return classifyTopUpCompetitorResult(result, gameConfig).eligible;
}

function selectGoogleCompetitors(results, gameConfig, limit) {
  const decisions = results.map((result, rawIndex) => {
    const classification = classifyTopUpCompetitorResult(result, gameConfig);
    return {
      ...result,
      organicPosition: result.position ?? rawIndex + 1,
      classification: classification.reason,
      eligible: classification.eligible,
    };
  });
  const seenStores = new Set();
  const ranking = [];

  // 1. Masukkan priority stores (seperti itemku.com) di urutan pertama
  if (Array.isArray(gameConfig.priorityStores)) {
    for (const priority of gameConfig.priorityStores) {
      const primaryUrl = Array.isArray(priority.urls) ? priority.urls[0] : priority.url;
      const store = normalizeHostname(primaryUrl);
      if (!seenStores.has(store)) {
        seenStores.add(store);
        const googleMatch = decisions.find((d) => normalizeHostname(d.link) === store);
        ranking.push({
          position: ranking.length + 1,
          organicPosition: googleMatch ? googleMatch.organicPosition : "-",
          title: priority.name || store,
          link: primaryUrl,
          urls: Array.isArray(priority.urls) ? priority.urls : [priority.url].filter(Boolean),
          store,
          isPriority: true,
        });
      }
    }
  }

  // 2. Masukkan hasil ranking organik Google berikutnya hingga batas limit
  for (const result of decisions) {
    if (!result.eligible) continue;
    const store = normalizeHostname(result.link);
    if (seenStores.has(store)) continue;
    seenStores.add(store);
    const normalizedStoreUrl = normalizeStoreUrl(result.link, gameConfig);
    ranking.push({
      position: ranking.length + 1,
      organicPosition: result.organicPosition,
      title: result.title,
      link: normalizedStoreUrl.href,
      store,
    });
    if (ranking.length === limit) break;
  }

  return { ranking, decisions };
}

function sanitizeFileName(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const ALTERNATIVE_GAME_QUERIES = {
  "mobile-legends": "top up mobile legends",
  "free-fire": "top up ff",
  "roblox": "top up roblox",
};

async function fetchSerpApiSerp(apiKey, query, options = {}) {
  const {
    start = 0,
    searchDepth = 30,
    serpapiFilter = null,
    fetchFunction = fetch,
  } = options;

  const parameters = new URLSearchParams({
    engine: "google",
    q: query,
    location: "Indonesia",
    hl: "id",
    gl: "id",
    device: "desktop",
    num: String(searchDepth),
    api_key: apiKey,
  });

  if (start > 0) {
    parameters.set("start", String(start));
  }
  if (serpapiFilter != null) {
    parameters.set("filter", serpapiFilter);
  }

  const response = await fetchFunction(
    `https://serpapi.com/search.json?${parameters}`,
  );
  if (!response.ok) throw new Error(`SerpAPI HTTP ${response.status}`);

  const data = await response.json();
  if (data.error) throw new Error(data.error);

  return (data.organic_results || []).map((item, index) => ({
    position: item.position ?? (start + index + 1),
    title: item.title || "",
    link: item.link || item.url || "",
    snippet: item.snippet || item.description || "",
  }));
}

async function fetchBrightDataSerp(apiKey, query, options = {}) {
  const {
    start = 0,
    fetchFunction = fetch,
    zone = process.env.BRIGHTDATA_ZONE || "serp_api",
    maxAttempts = 3,
  } = options;

  const encodedQuery = String(query).trim().replace(/\s+/g, "+");
  let searchUrl = `https://www.google.com/search?q=${encodedQuery}&hl=id&gl=id`;
  if (start > 0) {
    searchUrl += `&start=${start}`;
  }

  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetchFunction("https://api.brightdata.com/request", {
        method: "POST",
        signal: AbortSignal.timeout(60000),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          zone,
          url: searchUrl,
          format: "raw",
          data_format: "parsed",
          data_options: { return_mismatch: true },
        }),
      });

      const statusCode = response.headers.get("x-brd-status-code") || String(response.status);
      const errCode = response.headers.get("x-brd-error-code") || "";
      const rawText = await response.text();

      if (!rawText || statusCode !== "200") {
        const errDetail = response.headers.get("x-brd-error") || `HTTP ${statusCode}`;
        lastError = new Error(`Bright Data error (${errDetail})`);
        if (attempt < maxAttempts) {
          const isCooldown = errCode === "failed_query_rejected" || /15 seconds/i.test(errDetail);
          const delayMs = isCooldown ? 16000 : Math.max(3000, 3000 * attempt);
          console.log(
            `[Bright Data] Percobaan ${attempt} gagal (${errDetail}). Menunggu ${delayMs / 1000}s sebelum mencoba ulang...`,
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
        throw lastError;
      }

      const data = JSON.parse(rawText);
      const rawOrganic = Array.isArray(data.organic)
        ? data.organic
        : Array.isArray(data.organic_results)
          ? data.organic_results
          : Array.isArray(data.results)
            ? data.results
            : [];

      return rawOrganic.map((item, index) => ({
        position: (start || 0) + Number(item.rank || item.position || index + 1),
        title: item.title || "",
        link: item.link || item.url || "",
        snippet: item.description || item.snippet || "",
      }));
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        const isCooldown = /15 seconds/i.test(error.message);
        const delayMs = isCooldown ? 16000 : /timeout/i.test(error.message) ? 5000 : 3000 * attempt;
        console.log(
          `[Bright Data] Percobaan ${attempt} terputus (${error.message}). Menunggu ${delayMs / 1000}s...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError || new Error("Gagal mengambil data dari Bright Data SERP API.");
}

async function searchGoogle(
  apiKey,
  gameConfig,
  limit,
  fetchFunction = fetch,
  options = {},
) {
  const resolvedFetch = typeof fetchFunction === "function" ? fetchFunction : fetch;
  const resolvedOptions = typeof fetchFunction === "object" && fetchFunction !== null ? fetchFunction : options;
  let provider = (
    resolvedOptions.provider ||
    process.env.SERP_PROVIDER ||
    (process.env.BRIGHTDATA_API_KEY && !process.env.SERPAPI_KEY ? "brightdata" : "serpapi")
  ).toLowerCase();

  if (provider === "brightdata" && !process.env.BRIGHTDATA_API_KEY && process.env.SERPAPI_KEY) {
    provider = "serpapi";
  }

  const searchDepth = Math.min(100, Math.max(20, limit * 3));
  console.log(`Cari ranking organik Google (${provider}): ${gameConfig.query}`);

  let organicResults = [];
  if (provider === "brightdata") {
    const brightDataKey = apiKey || process.env.BRIGHTDATA_API_KEY || process.env.SERPAPI_KEY;
    if (!brightDataKey) throw new Error("BRIGHTDATA_API_KEY belum diatur.");
    try {
      organicResults = await fetchBrightDataSerp(brightDataKey, gameConfig.query, {
        start: 0,
        fetchFunction: resolvedFetch,
      });
    } catch (brightErr) {
      if (process.env.SERPAPI_KEY) {
        console.warn(`[Bright Data] Gagal (${brightErr.message}). Beralih otomatis ke cadangan SerpApi...`);
        provider = "serpapi";
        organicResults = await fetchSerpApiSerp(process.env.SERPAPI_KEY, gameConfig.query, {
          start: 0,
          searchDepth,
          serpapiFilter: gameConfig.serpapiFilter,
          fetchFunction: resolvedFetch,
        });
      } else {
        throw brightErr;
      }
    }
  } else {
    organicResults = await fetchSerpApiSerp(apiKey, gameConfig.query, {
      start: 0,
      searchDepth,
      serpapiFilter: gameConfig.serpapiFilter,
      fetchFunction: resolvedFetch,
    });
  }

  let { ranking, decisions } = selectGoogleCompetitors(
    organicResults,
    gameConfig,
    limit,
  );

  // Auto-pagination jika limit belum terpenuhi
  let startOffset = 10;
  while (ranking.length < limit && startOffset <= 30) {
    try {
      let nextPageResults = [];
      if (provider === "brightdata") {
        const brightDataKey = apiKey || process.env.BRIGHTDATA_API_KEY || process.env.SERPAPI_KEY;
        try {
          nextPageResults = await fetchBrightDataSerp(brightDataKey, gameConfig.query, {
            start: startOffset,
            fetchFunction: resolvedFetch,
          });
        } catch (brightNextErr) {
          if (process.env.SERPAPI_KEY) {
            console.warn(`[Bright Data Pagination] Gagal (${brightNextErr.message}). Mencoba SerpApi...`);
            nextPageResults = await fetchSerpApiSerp(process.env.SERPAPI_KEY, gameConfig.query, {
              start: startOffset,
              searchDepth,
              serpapiFilter: gameConfig.serpapiFilter,
              fetchFunction: resolvedFetch,
            });
          } else {
            throw brightNextErr;
          }
        }
      } else {
        nextPageResults = await fetchSerpApiSerp(apiKey, gameConfig.query, {
          start: startOffset,
          searchDepth,
          serpapiFilter: gameConfig.serpapiFilter,
          fetchFunction: resolvedFetch,
        });
      }

      if (!nextPageResults.length) break;
      organicResults.push(...nextPageResults);
      const extended = selectGoogleCompetitors(
        organicResults,
        gameConfig,
        limit,
      );
      ranking = extended.ranking;
      decisions = extended.decisions;
      if (ranking.length >= limit) break;
    } catch {
      break;
    }
    startOffset += 10;
  }

  // Fallback query jika hasil organik terlalu sedikit
  const minExpected = Math.min(limit, 5);
  const altQuery = ALTERNATIVE_GAME_QUERIES[gameConfig.id];
  if (ranking.length < minExpected && altQuery && altQuery !== gameConfig.query) {
    console.log(
      `[Google Search] Toko kompetitor organik sedikit (${ranking.length} < ${minExpected}). Mencoba query alternatif: "${altQuery}"...`,
    );
    try {
      let fallbackOrganic = [];
      if (provider === "brightdata") {
        const brightDataKey = apiKey || process.env.BRIGHTDATA_API_KEY || process.env.SERPAPI_KEY;
        try {
          fallbackOrganic = await fetchBrightDataSerp(brightDataKey, altQuery, {
            start: 0,
            fetchFunction: resolvedFetch,
          });
        } catch (brightAltErr) {
          if (process.env.SERPAPI_KEY) {
            fallbackOrganic = await fetchSerpApiSerp(process.env.SERPAPI_KEY, altQuery, {
              start: 0,
              searchDepth,
              fetchFunction: resolvedFetch,
            });
          }
        }
      } else {
        fallbackOrganic = await fetchSerpApiSerp(apiKey, altQuery, {
          start: 0,
          searchDepth,
          fetchFunction: resolvedFetch,
        });
      }

      if (fallbackOrganic.length) {
        const fallbackSelection = selectGoogleCompetitors(
          fallbackOrganic,
          gameConfig,
          limit,
        );
        if (fallbackSelection.ranking.length > ranking.length) {
          ranking = fallbackSelection.ranking;
          decisions = fallbackSelection.decisions;
          organicResults = fallbackOrganic;
        }
      }
    } catch {}
  }

  return {
    ranking,
    rankingAudit: {
      requestedCompetitorCount: limit,
      searchDepth,
      organicResultCount: organicResults.length,
      eligibleCompetitorCount: ranking.length,
      decisions: decisions.map((result) => ({
        position: result.organicPosition,
        title: result.title,
        link: result.link,
        classification: result.classification,
      })),
    },
  };
}

function isTemporaryScrapeError(error) {
  if (error.retryable === false) return false;
  if (
    error.proxyFailed ||
    error.isMaintenance ||
    error.message.includes("[Proxy Error]") ||
    error.message.includes("[Blokir]") ||
    error.message.includes("[Maintenance]")
  ) {
    return false;
  }
  if (error.retryable === true) return true;
  return /timeout|timed out|tidak selesai dimuat|data harga tidak ditemukan|err_ssl_protocol_error|err_http2_protocol_error|err_timed_out|err_connection_reset|err_connection_closed|err_empty_response|connection reset|econnreset|socket hang up|network changed|eai_again|econnrefused|navigation failed because page crashed/i.test(
    error.message,
  );
}

function getRetryDelay(attempt) {
  return Math.min(2_000 * 2 ** (attempt - 1), 15_000);
}

async function mapWithConcurrency(items, concurrency, worker) {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error("Concurrency harus bilangan bulat minimal 1.");
  }

  const results = new Array(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, runWorker));
  return results;
}

async function scrapeWithRetry(
  url,
  headed,
  maxAttempts = 3,
  scrapeFunction = scrape,
  sleepFunction = (delay) => new Promise((resolve) => setTimeout(resolve, delay)),
  scrapeOptions = {},
) {
  let lastError;
  let activeOptions = { ...scrapeOptions };

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await scrapeFunction(url, DEFAULT_SELECTOR, headed, activeOptions);
    } catch (error) {
      lastError = error;
      if (!isTemporaryScrapeError(error) || attempt === maxAttempts) throw error;
      const delay = getRetryDelay(attempt);
      console.log(
        `Scrape sementara belum valid: ${error.message}. Coba ulang ${attempt + 1}/${maxAttempts} dalam ${delay / 1_000} detik...`,
      );
      await sleepFunction(delay);
    }
  }

  throw lastError;
}

function normalizeStoreUrl(value, gameConfig) {
  const url = normalizeTokopediaUrl(value, gameConfig?.id);
  const hostname = url.hostname.replace(/^www\./, "").toLowerCase();
  if (
    hostname === "golrox.com" &&
    (url.pathname.startsWith("/beli-robux") || url.pathname === "/" || url.pathname.includes("roblox")) &&
    !url.pathname.includes("/username")
  ) {
    return new URL("https://golrox.com/beli-robux/username");
  }
  if (
    hostname === "casatopup.com" &&
    (gameConfig?.id === "mobile-legends" || !gameConfig) &&
    (url.pathname.includes("mobile-legends") || url.pathname.includes("mlbb"))
  ) {
    return new URL("https://casatopup.com/id/beli/mobile-legends");
  }
  if (
    hostname === "hiddengame.id" &&
    (url.pathname.startsWith("/games/roblox") || url.pathname.includes("roblox")) &&
    !url.pathname.includes("giftcard")
  ) {
    return new URL("https://hiddengame.id/games/roblox-giftcard");
  }
  if (
    hostname === "ditusi.co.id" &&
    (url.pathname.includes("roblox") || url.pathname.includes("robux")) &&
    !url.pathname.includes("voucher-roblox")
  ) {
    return new URL("https://ditusi.co.id/voucher-roblox-robux");
  }
  if (
    hostname === "lootbar.com" &&
    url.pathname.includes("free-fire") &&
    !url.searchParams.has("region")
  ) {
    url.searchParams.set("region", "ff_id");
    return url;
  }
  if (hostname === "bangjeff.com") {
    const cleanedPath = url.pathname.replace(/^\/(?:en-[a-z]{2}|[a-z]{2}-[a-z]{2}|en|th|my)(?=\/|$)/i, "");
    if (cleanedPath !== url.pathname) {
      url.pathname = cleanedPath || "/";
      return url;
    }
  }
  if (
    hostname === "lapakgaming.com" &&
    (gameConfig?.id === "roblox" || !gameConfig) &&
    url.pathname.includes("roblox")
  ) {
    return new URL("https://www.lapakgaming.com/id-id/roblox");
  }
  if (
    hostname === "funnerlife.id" &&
    (gameConfig?.id === "mobile-legends" || !gameConfig) &&
    url.pathname.includes("/beli/mlbb")
  ) {
    return new URL("https://funnerlife.id/id/beli/mobile-legend");
  }
  return url;
}

async function scrapeStore(store, gameConfig, options) {
  const targetUrls = Array.isArray(store.urls) && store.urls.length > 0
    ? store.urls
    : [store.url || store.link].filter(Boolean);

  const storeName = store.name || store.store;
  console.log(`\n⏳ Scrape: ${storeName} (${gameConfig.name})...`);
  const allRows = [];
  let lowestConfidence = 100;
  const primaryUrl = normalizeStoreUrl(targetUrls[0], gameConfig);

  try {
    for (const rawUrl of targetUrls) {
      const url = normalizeStoreUrl(rawUrl, gameConfig);
      let validation;
      const rows = await scrapeWithRetry(
        url,
        options.headed,
        options.maxAttempts,
        async (...args) => {
          const extractedRows = await scrape(...args);
          validation = validateScrapeResults(url.href, extractedRows, gameConfig.id);
          if (!validation.valid) {
            const error = new Error(
              `${validation.status}, confidence ${validation.confidence}: ${validation.reasons.join(", ")}`,
            );
            error.retryable =
              validation.stats.totalRows < 2 ||
              validation.stats.validPriceRatio < 0.8 ||
              validation.stats.relevantProductRatio < 0.5;
            throw error;
          }
          return extractedRows;
        },
        undefined,
        { browser: options.browser, proxy: options.proxy },
      );
      allRows.push(...rows);
      if (rows._usedProxy) allRows._usedProxy = true;
      if (validation && typeof validation.confidence === "number") {
        lowestConfidence = Math.min(lowestConfidence, validation.confidence);
      }
    }
  } catch (error) {
    console.log(`✗ [Gagal] Toko: ${storeName} (${gameConfig.name}) -> ${error.message}`);
    throw error;
  }

  const scrapeFilePath = options.scrapeOutputDirectory
    ? exportScrapeFile(
        allRows,
        store,
        options.scrapeOutputDirectory,
      )
    : null;
  const usedProxy = Boolean(allRows._usedProxy || allRows.some((r) => r._usedProxy));
  const proxyNote = usedProxy ? " [via Proxy]" : "";
  console.log(`✓ [Berhasil] Toko: ${storeName} (${gameConfig.name}) -> ${allRows.length} produk${proxyNote}`);

  return {
    name: storeName,
    url: primaryUrl.href,
    position: store.position ?? "Utama",
    organicPosition: store.organicPosition ?? null,
    confidence: lowestConfidence,
    rawProductCount: allRows.length,
    scrapeFilePath,
    usedProxy,
    status: "SUCCESS",
    reason: null,
    products: selectCheapestProducts(allRows, gameConfig.id, {
      store: storeName,
      hostname: primaryUrl.hostname,
      url: primaryUrl.href,
      calculateTax: options.calculateTax,
    }),
  };
}

function createScrapeFileName(store) {
  const name = sanitizeFileName(store.name || store.store);
  if (store.position === undefined || store.position === "Utama") {
    return `main-${name}`;
  }
  return `rank-${String(store.position).padStart(2, "0")}-${name}`;
}

function createUniqueRunDirectory(outputRoot, date) {
  fs.mkdirSync(outputRoot, { recursive: true });

  for (let sequence = 1; sequence <= 10_000; sequence += 1) {
    const folderName = sequence === 1 ? date : `${date}(${sequence})`;
    const directory = path.join(outputRoot, folderName);
    try {
      fs.mkdirSync(directory);
      return directory;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
  }

  throw new Error(`Tidak dapat membuat folder output unik untuk ${date}.`);
}

function exportScrapeFile(rows, store, outputDirectory) {
  fs.mkdirSync(outputDirectory, { recursive: true });
  return exportCsv(rows, path.join(outputDirectory, createScrapeFileName(store)));
}

module.exports = {
  classifyTopUpCompetitorResult,
  createScrapeFileName,
  createUniqueRunDirectory,
  exportScrapeFile,
  fetchBrightDataSerp,
  getRetryDelay,
  isTemporaryScrapeError,
  isTopUpCompetitorResult,
  mapWithConcurrency,
  normalizeStoreUrl,
  scrapeStore,
  scrapeWithRetry,
  searchGoogle,
  selectGoogleCompetitors,
};
