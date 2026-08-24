require("dotenv").config({ quiet: true });
const fs = require("fs");
const path = require("path");
const { chromium } = require("./playwright");
const {
  DEFAULT_SELECTOR,
  exportCsv,
  normalizeTokopediaUrl,
  scrape,
} = require("./scrape");
const { validateScrapeResults } = require("./validate-results");
const {
  GAME_CONFIGS,
  isMainStoreUrl,
  normalizeHostname,
} = require("./compare-google-config");
const {
  findMatches,
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

function getArgument(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : fallback;
}

function formatPrice(value) {
  return value === null || value === undefined
    ? "-"
    : `Rp ${Math.round(value).toLocaleString("id-ID")}`;
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
  return normalizeTokopediaUrl(value, gameConfig.id);
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
      { browser: options.browser },
    );
    allRows.push(...rows);
    if (validation && typeof validation.confidence === "number") {
      lowestConfidence = Math.min(lowestConfidence, validation.confidence);
    }
  }

  const scrapeFilePath = exportScrapeFile(
    allRows,
    store,
    options.scrapeOutputDirectory,
  );
  return {
    name: store.name || store.store,
    url: primaryUrl.href,
    position: store.position ?? "Utama",
    confidence: lowestConfidence,
    rawProductCount: allRows.length,
    scrapeFilePath,
    products: selectCheapestProducts(allRows, gameConfig.id),
  };
}

function describeStatus(difference) {
  if (difference > 0) return "PEMBANDING_LEBIH_MURAH";
  if (difference < 0) return "UTAMA_LEBIH_MURAH";
  return "HARGA_SAMA";
}

function createPairRows(gameConfig, mainStore, competitor) {
  const rows = [];
  const matchedCompetitorKeys = new Set();

  for (const mainProduct of mainStore.products.values()) {
    const matches = findMatches(mainProduct, competitor.products);

    if (!matches.length) {
      rows.push({
        Game: gameConfig.name,
        "Situs Utama": mainStore.name,
        "Produk Utama": mainProduct.rawName,
        "Jumlah Utama": mainProduct.quantity ?? "-",
        "Harga Utama": formatPrice(mainProduct.price),
        "Harga/Unit Utama": formatPrice(mainProduct.pricePerUnit),
        "Ranking Google Pembanding": competitor.position,
        "Situs Pembanding": competitor.name,
        "Produk Pembanding": "-",
        "Jumlah Pembanding": "-",
        "Harga Pembanding": "-",
        "Harga/Unit Pembanding": "-",
        "Selisih Jumlah": "-",
        "Selisih Harga": "-",
        Status: "TIDAK_ADA_DI_PEMBANDING",
        "URL Utama": mainStore.url,
        "URL Pembanding": competitor.url,
        _difference: Number.NEGATIVE_INFINITY,
      });
      continue;
    }

    const match = matches[0];
    const competitorProduct = match.product;
    const difference = mainProduct.price - competitorProduct.price;
    matchedCompetitorKeys.add(competitorProduct.mapKey);

    rows.push({
      Game: gameConfig.name,
      "Situs Utama": mainStore.name,
      "Produk Utama": mainProduct.rawName,
      "Jumlah Utama": mainProduct.quantity ?? "-",
      "Harga Utama": formatPrice(mainProduct.price),
      "Harga/Unit Utama": formatPrice(mainProduct.pricePerUnit),
      "Ranking Google Pembanding": competitor.position,
      "Situs Pembanding": competitor.name,
      "Produk Pembanding": competitorProduct.rawName,
      "Jumlah Pembanding": competitorProduct.quantity ?? "-",
      "Harga Pembanding": formatPrice(competitorProduct.price),
      "Harga/Unit Pembanding": formatPrice(competitorProduct.pricePerUnit),
      "Selisih Jumlah": match.quantityDifference,
      "Selisih Harga": formatPrice(Math.abs(difference)),
      Status: describeStatus(difference),
      "URL Utama": mainStore.url,
      "URL Pembanding": competitor.url,
      _difference: difference,
    });
  }

  for (const competitorProduct of competitor.products.values()) {
    if (matchedCompetitorKeys.has(competitorProduct.mapKey)) continue;
    rows.push({
      Game: gameConfig.name,
      "Situs Utama": mainStore.name,
      "Produk Utama": "-",
      "Jumlah Utama": "-",
      "Harga Utama": "-",
      "Harga/Unit Utama": "-",
      "Ranking Google Pembanding": competitor.position,
      "Situs Pembanding": competitor.name,
      "Produk Pembanding": competitorProduct.rawName,
      "Jumlah Pembanding": competitorProduct.quantity ?? "-",
      "Harga Pembanding": formatPrice(competitorProduct.price),
      "Harga/Unit Pembanding": formatPrice(competitorProduct.pricePerUnit),
      "Selisih Jumlah": "-",
      "Selisih Harga": "-",
      Status: "HANYA_ADA_DI_PEMBANDING",
      "URL Utama": mainStore.url,
      "URL Pembanding": competitor.url,
      _difference: Number.NEGATIVE_INFINITY,
    });
  }

  rows.sort((first, second) => second._difference - first._difference);
  return rows.map(({ _difference, ...row }, index) => ({
    No: index + 1,
    ...row,
  }));
}

function createPairFileName(mainStore, competitor) {
  const rank = String(competitor.position).padStart(2, "0");
  const mainName = sanitizeFileName(mainStore.name);
  const competitorName = sanitizeFileName(competitor.name);
  return `rank-${rank}-${mainName}-vs-${competitorName}`;
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

function exportComparisonFiles(
  gameConfig,
  mainStores,
  competitors,
  outputDirectory,
) {
  const files = [];

  for (const mainStore of mainStores) {
    const mainStoreDirectory = path.join(
      outputDirectory,
      sanitizeFileName(mainStore.name),
    );
    fs.mkdirSync(mainStoreDirectory, { recursive: true });

    for (const competitor of competitors) {
      const rows = createPairRows(gameConfig, mainStore, competitor);
      if (!rows.length) continue;

      const outputName = path.join(
        mainStoreDirectory,
        createPairFileName(mainStore, competitor),
      );
      const csvPath = exportCsv(rows, outputName);
      const matchedPairCount = rows.filter(
        (row) =>
          row["Produk Utama"] !== "-" && row["Produk Pembanding"] !== "-",
      ).length;
      const unmatchedMainCount = rows.filter(
        (row) => row["Produk Utama"] !== "-" && row["Produk Pembanding"] === "-",
      ).length;
      const unmatchedCompetitorCount = rows.filter(
        (row) => row["Produk Utama"] === "-" && row["Produk Pembanding"] !== "-",
      ).length;
      files.push({
        mainStore: mainStore.name,
        competitor: competitor.name,
        ranking: competitor.position,
        outputRowCount: rows.length,
        matchedPairCount,
        unmatchedMainCount,
        unmatchedCompetitorCount,
        csvPath,
      });
    }
  }

  return files;
}

async function processGame(apiKey, gameConfig, options) {
  console.log(`\n===== ${gameConfig.name} =====`);
  const { ranking, rankingAudit } = await searchGoogle(
    apiKey,
    gameConfig,
    options.limit,
  );
  console.table(ranking);

  const mainStores = [];
  const failedMainStores = [];
  const competitors = [];
  const failedCompetitors = [];
  const scrapes = [];

  const mainResults = await mapWithConcurrency(
    gameConfig.mainStores,
    Math.min(2, options.concurrency),
    async (mainStore) => {
      try {
        return {
          success: true,
          store: await scrapeStore(mainStore, gameConfig, options),
        };
      } catch (error) {
        return { success: false, source: mainStore, error };
      }
    },
  );

  for (const result of mainResults) {
    if (result.success) {
      const store = result.store;
      mainStores.push(store);
      scrapes.push({
        type: "main",
        name: store.name,
        url: store.url,
        success: true,
        productCount: store.products.size,
        rawProductCount: store.rawProductCount,
        confidence: store.confidence,
        scrapeFilePath: store.scrapeFilePath,
      });
      continue;
    }

    const failure = {
      name: result.source.name,
      url: result.source.url,
      success: false,
      error: result.error.message,
    };
    failedMainStores.push(failure);
    scrapes.push({ type: "main", ...failure });
    console.error(`Gagal situs utama ${failure.name}: ${failure.error}`);
  }

  const competitorResults = await mapWithConcurrency(
    ranking,
    options.concurrency,
    async (rankedStore) => {
      try {
        return {
          success: true,
          store: await scrapeStore(rankedStore, gameConfig, options),
        };
      } catch (error) {
        return { success: false, source: rankedStore, error };
      }
    },
  );

  for (const result of competitorResults) {
    if (result.success) {
      const store = result.store;
      competitors.push(store);
      scrapes.push({
        type: "competitor",
        position: store.position,
        name: store.name,
        url: store.url,
        success: true,
        productCount: store.products.size,
        rawProductCount: store.rawProductCount,
        confidence: store.confidence,
        scrapeFilePath: store.scrapeFilePath,
      });
      continue;
    }

    const failure = {
      position: result.source.position,
      name: result.source.store,
      url: result.source.link,
      success: false,
      error: result.error.message,
    };
    failedCompetitors.push(failure);
    scrapes.push({ type: "competitor", ...failure });
    console.error(`Lewati ${failure.name}: ${failure.error}`);
  }

  let error = null;
  let files = [];
  if (!mainStores.length) {
    error = `Semua situs utama ${gameConfig.name} gagal.`;
  } else if (!competitors.length) {
    error = `Semua situs pembanding ${gameConfig.name} gagal.`;
  } else {
    files = exportComparisonFiles(
      gameConfig,
      mainStores,
      competitors,
      options.outputDirectory,
    );
    if (!files.length) error = `Tidak ada produk ${gameConfig.name} yang cocok.`;
  }

  const successfulScrapeCount = scrapes.filter((scrapeResult) =>
    scrapeResult.success).length;
  const allScrapesSuccessful =
    scrapes.length > 0 && successfulScrapeCount === scrapes.length;
  const rankingComplete = ranking.length >= options.limit;
  const usable = error === null;
  const status = !usable
    ? "FAILED"
    : allScrapesSuccessful && rankingComplete
      ? "COMPLETE"
      : "PARTIAL";
  return {
    status,
    success: status === "COMPLETE",
    usable,
    rankingComplete,
    allScrapesSuccessful,
    game: gameConfig.name,
    gameId: gameConfig.id,
    query: gameConfig.query,
    ranking,
    rankingAudit,
    scrapeCount: scrapes.length,
    successfulScrapeCount,
    failedScrapeCount: scrapes.length - successfulScrapeCount,
    scrapes,
    mainStores: mainStores.map((store) => ({
      name: store.name,
      url: store.url,
      success: true,
      productCount: store.products.size,
      rawProductCount: store.rawProductCount,
      confidence: store.confidence,
      scrapeFilePath: store.scrapeFilePath,
    })),
    failedMainStores,
    competitors: competitors.map((store) => ({
      name: store.name,
      url: store.url,
      position: store.position,
      success: true,
      productCount: store.products.size,
      rawProductCount: store.rawProductCount,
      confidence: store.confidence,
      scrapeFilePath: store.scrapeFilePath,
    })),
    failedCompetitors,
    scrapeFileCount: successfulScrapeCount,
    scrapeOutputDirectory: options.scrapeOutputDirectory,
    comparisonFileCount: files.length,
    outputRowCount: files.reduce(
      (total, file) => total + file.outputRowCount,
      0,
    ),
    comparisonCount: files.reduce(
      (total, file) => total + file.matchedPairCount,
      0,
    ),
    unmatchedMainCount: files.reduce(
      (total, file) => total + file.unmatchedMainCount,
      0,
    ),
    unmatchedCompetitorCount: files.reduce(
      (total, file) => total + file.unmatchedCompetitorCount,
      0,
    ),
    files,
    ...(error ? { error } : {}),
  };
}

function createOverallSummary(summaries, generatedAt) {
  const completeGameCount = summaries.filter(
    (summary) => summary.status === "COMPLETE" || summary.success,
  ).length;
  const usableGameCount = summaries.filter(
    (summary) => summary.usable ?? summary.success,
  ).length;
  const partialGameCount = summaries.filter(
    (summary) => summary.status === "PARTIAL",
  ).length;
  const scrapes = summaries.flatMap((summary) =>
    (summary.scrapes || []).map((scrapeResult) => ({
      game: summary.game,
      ...scrapeResult,
    })));
  const successfulScrapeCount = scrapes.filter((scrapeResult) =>
    scrapeResult.success).length;
  const allScrapesSuccessful =
    scrapes.length > 0 && successfulScrapeCount === scrapes.length;
  const status = completeGameCount === summaries.length && summaries.length > 0
    ? "COMPLETE"
    : usableGameCount > 0
      ? "PARTIAL"
      : "FAILED";
  return {
    status,
    success: status === "COMPLETE",
    usable: usableGameCount > 0,
    allScrapesSuccessful,
    generatedAt,
    gameCount: summaries.length,
    successfulGameCount: completeGameCount,
    completeGameCount,
    partialGameCount,
    usableGameCount,
    failedGameCount: summaries.length - usableGameCount,
    scrapeCount: scrapes.length,
    successfulScrapeCount,
    failedScrapeCount: scrapes.length - successfulScrapeCount,
    scrapeFileCount: summaries.reduce(
      (total, summary) => total + (summary.scrapeFileCount || 0),
      0,
    ),
    comparisonFileCount: summaries.reduce(
      (total, summary) => total + (summary.comparisonFileCount || 0),
      0,
    ),
    outputRowCount: summaries.reduce(
      (total, summary) => total + (summary.outputRowCount || 0),
      0,
    ),
    comparisonCount: summaries.reduce(
      (total, summary) => total + (summary.comparisonCount || 0),
      0,
    ),
    scrapes,
    games: summaries,
  };
}

async function main() {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) throw new Error("SERPAPI_KEY belum diatur.");

  const limitValue = Number(getArgument("limit", "10"));
  const limit = Number.isInteger(limitValue)
    ? Math.min(10, Math.max(1, limitValue))
    : 10;
  const gameId = getArgument("game");
  if (!gameId) {
    throw new Error(
      "Pilih game dengan --game all, mobile-legends, free-fire, atau roblox.",
    );
  }
  const selectedGames = gameId === "all"
    ? GAME_CONFIGS
    : GAME_CONFIGS.filter((game) =>
        gameId
          .split(",")
          .map((id) => id.trim().toLowerCase())
          .includes(game.id),
      );
  if (!selectedGames.length) {
    throw new Error(
      `Game tidak valid: ${gameId}. Pilih all, mobile-legends, free-fire, roblox, atau kombinasi koma (contoh: free-fire,roblox).`,
    );
  }

  const headed = process.argv.includes("--headed");
  const attemptsValue = Number(getArgument("attempts", "3"));
  const maxAttempts = Number.isInteger(attemptsValue)
    ? Math.min(5, Math.max(1, attemptsValue))
    : 3;
  const concurrencyValue = Number(getArgument("concurrency", headed ? "1" : "3"));
  const concurrency = headed
    ? 1
    : Number.isInteger(concurrencyValue)
      ? Math.min(4, Math.max(1, concurrencyValue))
      : 3;
  const generatedAt = new Date().toISOString();
  const timestamp = generatedAt.replace(/[:.]/g, "-");
  const date = timestamp.slice(0, 10);
  const runOutputDirectory = createUniqueRunDirectory(
    path.resolve(__dirname, "output"),
    date,
  );
  const comparisonDirectory = path.join(runOutputDirectory, "comparison");
  const scrapeDirectory = path.join(runOutputDirectory, "scrapes");
  fs.mkdirSync(comparisonDirectory);
  fs.mkdirSync(scrapeDirectory);

  const summaries = [];
  const browser = await chromium.launch({ headless: !headed });
  try {
    for (const gameConfig of selectedGames) {
      const outputDirectory = path.join(comparisonDirectory, gameConfig.id);
      const scrapeOutputDirectory = path.join(scrapeDirectory, gameConfig.id);
      fs.mkdirSync(outputDirectory, { recursive: true });
      fs.mkdirSync(scrapeOutputDirectory, { recursive: true });
      let summary;
      try {
        summary = await processGame(apiKey, gameConfig, {
          browser,
          concurrency,
          limit,
          headed,
          maxAttempts,
          timestamp,
          outputDirectory,
          scrapeOutputDirectory,
        });
      } catch (error) {
        summary = {
          status: "FAILED",
          success: false,
          usable: false,
          rankingComplete: false,
          allScrapesSuccessful: false,
          game: gameConfig.name,
          gameId: gameConfig.id,
          query: gameConfig.query,
          ranking: [],
          rankingAudit: null,
          scrapeCount: 0,
          successfulScrapeCount: 0,
          failedScrapeCount: 0,
          scrapes: [],
          mainStores: [],
          failedMainStores: [],
          competitors: [],
          failedCompetitors: [],
          scrapeFileCount: 0,
          scrapeOutputDirectory,
          comparisonFileCount: 0,
          outputRowCount: 0,
          comparisonCount: 0,
          unmatchedMainCount: 0,
          unmatchedCompetitorCount: 0,
          files: [],
          error: error.message,
        };
        console.error(`Gagal ${gameConfig.name}: ${error.message}`);
      }
      summaries.push(summary);
      const gameSummaryPath = path.join(
        comparisonDirectory,
        `summary-${gameConfig.id}-${timestamp}.json`,
      );
      fs.writeFileSync(gameSummaryPath, JSON.stringify(summary, null, 2), "utf8");
    }
  } finally {
    await browser.close();
  }

  const overallSummary = createOverallSummary(summaries, generatedAt);
  const summaryPath = path.join(
    comparisonDirectory,
    `summary-all-${timestamp}.json`,
  );
  fs.writeFileSync(
    summaryPath,
    JSON.stringify(overallSummary, null, 2),
    "utf8",
  );

  console.table(
    summaries.map((summary) => ({
      game: summary.game,
      comparisonFileCount: summary.comparisonFileCount || 0,
      comparisonCount: summary.comparisonCount || 0,
      outputDirectory: summary.files?.[0]
        ? path.dirname(path.dirname(summary.files[0].csvPath))
        : "-",
      error: summary.error || "-",
    })),
  );
  console.log(`Hasil scrape: ${scrapeDirectory}`);
  console.log(`Hasil perbandingan: ${comparisonDirectory}`);
  console.log(`Summary: ${summaryPath}`);

  if (!overallSummary.success) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Gagal: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  classifyTopUpCompetitorResult,
  createOverallSummary,
  createPairFileName,
  createScrapeFileName,
  createUniqueRunDirectory,
  createPairRows,
  describeStatus,
  exportComparisonFiles,
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
