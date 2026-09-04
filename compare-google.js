require("dotenv").config({ quiet: true });
const fs = require("fs");
const path = require("path");
const {
  DEFAULT_SELECTOR,
  exportCsv,
  normalizeTokopediaUrl,
  scrape,
} = require("./scrape");
const { validateScrapeResults } = require("./validate-results");
const {
  isMainStoreUrl,
  normalizeHostname,
} = require("./compare-google-config");
const {
  selectCheapestProducts,
} = require("./product-matcher");

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
];

const GAME_RESULT_SIGNALS = {
  "mobile-legends": ["mobile legends", "mobilelegends", "mlbb"],
  "free-fire": ["free fire", "freefire", "free fire max"],
  roblox: ["roblox", "robux"],
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
  if (
    NON_STORE_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
    )
  ) {
    return { eligible: false, reason: "non_store_domain" };
  }
  if (isMainStoreUrl(url.href)) {
    return { eligible: false, reason: "main_store" };
  }

  const title = String(result.title || "").toLowerCase();
  const pathname = decodeURIComponent(url.pathname).toLowerCase();
  const editorialPath = /\/(?:blog|blogs|artikel|article|articles|news|berita|guide|panduan|tips?)(?:\/|$)|\/(?:cara|how-to)-/i.test(
    pathname,
  );
  const editorialTitle = /^(?:\d+\s+)?(?:cara|tips?|panduan|tutorial|rekomendasi|daftar)\b|\byang perlu diketahui\b/i.test(
    title,
  );
  if (editorialPath || editorialTitle) {
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
        ranking.push({
          position: ranking.length + 1,
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
    ranking.push({
      position: result.organicPosition,
      title: result.title,
      link: result.link,
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

async function searchGoogle(
  apiKey,
  gameConfig,
  limit,
  fetchFunction = fetch,
) {
  const searchDepth = Math.min(100, Math.max(20, limit * 3));
  const parameters = new URLSearchParams({
    engine: "google",
    q: gameConfig.query,
    location: "Indonesia",
    hl: "id",
    gl: "id",
    device: "desktop",
    num: String(searchDepth),
    filter: "0",
    api_key: apiKey,
  });

  console.log(`Cari ranking organik Google: ${gameConfig.query}`);
  const response = await fetchFunction(
    `https://serpapi.com/search.json?${parameters}`,
  );
  if (!response.ok) throw new Error(`SerpAPI HTTP ${response.status}`);

  const data = await response.json();
  if (data.error) throw new Error(data.error);

  const organicResults = data.organic_results || [];
  const { ranking, decisions } = selectGoogleCompetitors(
    organicResults,
    gameConfig,
    limit,
  );
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
  if (error.retryable === true) return true;
  return /timeout|timed out|tidak selesai dimuat|data harga tidak ditemukan|err_http2_protocol_error|err_timed_out|connection reset|econnreset|socket hang up|network changed|eai_again|econnrefused|navigation failed because page crashed/i.test(
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

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await scrapeFunction(url, DEFAULT_SELECTOR, headed, scrapeOptions);
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
  if (hostname === "golrox.com" && url.pathname.startsWith("/beli-robux") && !url.pathname.includes("/instant")) {
    return new URL("https://golrox.com/beli-robux/instant");
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
  return url;
}

async function scrapeStore(store, gameConfig, options) {
  const targetUrls = Array.isArray(store.urls) && store.urls.length > 0
    ? store.urls
    : [store.url || store.link].filter(Boolean);

  console.log(`Scrape ${gameConfig.name}: ${store.name || store.store}`);
  const allRows = [];
  let lowestConfidence = 100;
  const primaryUrl = normalizeStoreUrl(targetUrls[0], gameConfig);

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
    if (validation && typeof validation.confidence === "number") {
      lowestConfidence = Math.min(lowestConfidence, validation.confidence);
    }
  }

  const scrapeFilePath = options.scrapeOutputDirectory
    ? exportScrapeFile(
        allRows,
        store,
        options.scrapeOutputDirectory,
      )
    : null;
  const usedAiFallback = Boolean(allRows._usedAiFallback || allRows.some((r) => r._usedAiFallback));
  return {
    name: store.name || store.store,
    url: primaryUrl.href,
    position: store.position ?? "Utama",
    confidence: lowestConfidence,
    rawProductCount: allRows.length,
    scrapeFilePath,
    usedAiFallback,
    status: usedAiFallback ? "SUCCESS_FALLBACK" : "SUCCESS",
    reason: usedAiFallback
      ? "Ekstraksi standar DOM belum lengkap, berhasil dipulihkan oleh Groq AI Fallback"
      : null,
    products: selectCheapestProducts(allRows, gameConfig.id, {
      store: store.name || store.store,
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

