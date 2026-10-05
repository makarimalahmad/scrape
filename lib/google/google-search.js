require("dotenv").config({ quiet: true });
const fs = require("fs");
const path = require("path");
const { DEFAULT_SELECTOR, scrape } = require("../../scrape");
const { exportCsv } = require("../utils/export-csv");
const { validateScrapeResults } = require("../validation/validate-results");
const {
  isMainStoreUrl,
  normalizeHostname,
  normalizeStoreUrl,
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
  "wa.me",
  "whatsapp.com",
  "api.whatsapp.com",
  "t.me",
  "telegram.me",
  "line.me",
  "doku.promo",
  "saweria.co",
  "trakteer.id",
  "sociabuzz.com",
  "ko-fi.com",
  "buymeacoffee.com",
  "tipstree.me",
  "bagibagi.co",
  "nyawer.co",
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

  // Tolak TLD luar negeri yang tidak relevan / spam SEO untuk pasar Indonesia
  if (/\.(?:pl|ru|cz|ro|ua|by|ir|cn|xyz|top|site|online|live|bar|rest|fr|de|it|es|nl|ca|ch|be|at|eu)$/i.test(hostname)) {
    return { eligible: false, reason: "non_store_domain" };
  }

  const title = String(result.title || "").toLowerCase();
  const snippet = String(result.snippet || "").toLowerCase();
  const pathname = decodeURIComponent(url.pathname).toLowerCase();
  const isEditorialSubdomain = /^(?:news|blog|blogs|artikel|article|media|press|m)\./i.test(hostname);
  const editorialPath =
    /\/(?:read\d*|baca\d*|berita|artikel|articles?|news|blog|blogs|post|posts|story|stories|press|press-release|warta|ulasan|kolom|opini|publikasi|tulisan|detail|view|content|feed|entry|entries|lifestyle|tekno|teknologi|gadget|finansial|ekonomi|bisnis|nasional|internasional|hype|community|guide|panduan|tips?|tag|tags)(?:\/|$)/i.test(pathname) ||
    /\/(?:cara|how-to)-/i.test(pathname) ||
    /\/(?:19|20)\d{2}\/(?:0[1-9]|1[0-2])(?:\/(?:0[1-9]|[12]\d|3[01]))?(?:\/|$)/.test(pathname) ||
    /\/(?:read\/?|baca\/?)?\d{4,}(?:\/|-[a-z0-9])/i.test(pathname);
  const isMediaDomain =
    /(?:industry\.co\.id|wartaekonomi\.co\.id|kumparan\.com|suara\.com|liputan6\.com|sindonews\.com|merdeka\.com|jawapos\.com|bisnis\.com|kontan\.co\.id|antaranews\.com|inews\.id|grid\.id|republika\.co\.id|tempo\.co|tirto\.id|katadata\.co\.id|idntimes\.com|beritasatu\.com|pikiran-rakyat\.com|harianhaluan\.com|viva\.co\.id|kaskus\.co\.id|brainly\.co\.id)/i.test(hostname) ||
    /^(?:.*[.-])?(?:tribun|kabar|warta|harian|poskota|koran|jurnal|press|bulletin|times)[.-]/i.test(hostname) ||
    /^(?:.*[.-])?(?:linktr\.ee|lynk\.id|carrd\.co|beacons\.ai|bio\.link|taplink|saweria|trakteer|sociabuzz|ko-fi|buymeacoffee|bagibagi|nyawer)/i.test(hostname);
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

function selectGoogleCompetitors(results, gameConfig, limit, options = {}) {
  const {
    existingRanking = [],
    existingDecisions = [],
    seenStores = new Set(),
  } = options;

  const ranking = [...existingRanking];
  const decisions = [...existingDecisions];

  // 1. Masukkan priority stores (seperti itemku.com) di urutan pertama jika ranking masih kosong
  if (ranking.length === 0 && Array.isArray(gameConfig.priorityStores)) {
    for (const priority of gameConfig.priorityStores) {
      const primaryUrl = Array.isArray(priority.urls) ? priority.urls[0] : priority.url;
      const store = normalizeHostname(primaryUrl);
      if (!seenStores.has(store)) {
        seenStores.add(store);
        const googleMatch = results.find((d) => normalizeHostname(d.link) === store);
        ranking.push({
          position: ranking.length + 1,
          organicPosition: googleMatch ? (googleMatch.position ?? googleMatch.organicPosition ?? "-") : "-",
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
  for (let rawIndex = 0; rawIndex < results.length; rawIndex += 1) {
    const result = results[rawIndex];
    const classification = classifyTopUpCompetitorResult(result, gameConfig);
    decisions.push({
      ...result,
      organicPosition: result.position ?? rawIndex + 1,
      classification: classification.reason,
      eligible: classification.eligible,
    });

    if (!classification.eligible) continue;
    const store = normalizeHostname(result.link);
    if (seenStores.has(store) || isMainStoreUrl(result.link)) continue;
    seenStores.add(store);
    const normalizedStoreUrl = normalizeStoreUrl(result.link, gameConfig);
    ranking.push({
      position: ranking.length + 1,
      organicPosition: result.position ?? ranking.length + 1,
      title: result.title,
      link: normalizedStoreUrl.href,
      store,
    });
    if (ranking.length >= limit) break;
  }

  return { ranking, decisions, seenStores };
}

function sanitizeFileName(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// Query spesifik untuk Google Search (Serper.dev)
const SERPER_GAME_QUERIES = {
  "mobile-legends": "top up diamond mlbb resmi",
  "free-fire": "top up diamond ff resmi",
  "roblox": "top up robux murah",
};

const ALTERNATIVE_GAME_QUERIES = {
  "mobile-legends": [
    "top up diamond mlbb resmi",
    "top up mlbb murah",
    "top up mobile legends",
  ],
  "free-fire": [
    "top up diamond ff resmi",
    "beli diamond ff murah",
    "topup diamond free fire",
  ],
  "roblox": [
    "top up robux murah",
    "voucher roblox indonesia",
    "roblox gift card indonesia",
  ],
};

function getSearchQueryList(gameConfig) {
  const primaryQuery =
    SERPER_GAME_QUERIES[gameConfig.id] || gameConfig.query;

  const altList = ALTERNATIVE_GAME_QUERIES[gameConfig.id] || [];
  const list = [primaryQuery];
  if (gameConfig.query && !list.includes(gameConfig.query)) {
    list.push(gameConfig.query);
  }
  if (SERPER_GAME_QUERIES[gameConfig.id] && !list.includes(SERPER_GAME_QUERIES[gameConfig.id])) {
    list.push(SERPER_GAME_QUERIES[gameConfig.id]);
  }
  for (const alt of altList) {
    if (!list.includes(alt)) {
      list.push(alt);
    }
  }
  return list;
}

async function fetchSerperSerp(apiKey, query, options = {}) {
  const {
    page = 1,
    start = 0,
    gl = "id",
    hl = "id",
    location = "Indonesia",
    fetchFunction = fetch,
  } = options;

  const resolvedPage = options.page || (start > 0 ? Math.floor(start / 10) + 1 : 1);

  const response = await fetchFunction("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      q: query,
      gl,
      hl,
      location,
      page: resolvedPage,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Serper HTTP ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const rawOrganic = Array.isArray(data.organic)
    ? data.organic
    : Array.isArray(data.organic_results)
      ? data.organic_results
      : [];

  return rawOrganic.map((item, index) => ({
    position: item.position ?? ((resolvedPage - 1) * 10 + index + 1),
    title: item.title || "",
    link: item.link || item.url || "",
    snippet: item.snippet || item.description || "",
  }));
}

async function searchGoogle(
  apiKey,
  gameConfig,
  limit,
  fetchFunction = fetch,
  options = {},
) {
  const resolvedFetch = typeof fetchFunction === "function" ? fetchFunction : fetch;
  const serperKey = process.env.SERPER_API_KEY || apiKey;
  if (!serperKey) {
    throw new Error("SERPER_API_KEY belum diatur di environment / .env.");
  }

  // Target kuota kompetitor
  const minCompetitorsEnv = process.env.MIN_COMPETITORS ? Number(process.env.MIN_COMPETITORS) : null;
  const targetCount = limit;
  // Kuota minimal yang diharapkan (default 7, atau limit bila limit < 7 seperti pada test case)
  const minRequired = minCompetitorsEnv || (limit < 7 ? limit : 7);

  console.log(`Cari ranking organik Google (Serper) untuk ${gameConfig.name} (target: ${targetCount} toko, kuota minimum: ${minRequired})`);

  let ranking = [];
  let decisions = [];
  const seenStores = new Set();
  let totalOrganicFetched = 0;

  // 1. Masukkan priority store terlebih dahulu jika ada
  const initialSelection = selectGoogleCompetitors([], gameConfig, targetCount, {
    existingRanking: ranking,
    existingDecisions: decisions,
    seenStores,
    fillFallback: false,
  });
  ranking = initialSelection.ranking;
  decisions = initialSelection.decisions;

  const queriesToTry = getSearchQueryList(gameConfig);

  // 2. Loop melalui variasi kata kunci dan pagination bertahap
  for (let qIdx = 0; qIdx < queriesToTry.length; qIdx += 1) {
    if (ranking.length >= targetCount) break;
    const currentQuery = queriesToTry[qIdx];
    if (qIdx > 0) {
      console.log(
        `[Google Search] Toko kompetitor belum mencapai kuota (${ranking.length}/${minRequired}). Mencoba query alternatif ke-${qIdx + 1}: "${currentQuery}"...`,
      );
    }

    // Paging halaman 1, 2, 3, dan 4 bila belum cukup
    const pageOffsets = [0, 10, 20, 30];
    for (let pIdx = 0; pIdx < pageOffsets.length; pIdx += 1) {
      if (ranking.length >= targetCount) break;
      const startOffset = pageOffsets[pIdx];
      const pageNum = pIdx + 1;

      if (pIdx > 0) {
        console.log(
          `[Google Search] Membaca halaman ${pageNum} (offset ${startOffset}) untuk query "${currentQuery}"...`,
        );
      }

      try {
        const pageResults = await fetchSerperSerp(serperKey, currentQuery, {
          page: pageNum,
          start: startOffset,
          fetchFunction: resolvedFetch,
        });
        if (!Array.isArray(pageResults) || pageResults.length === 0) {
          // Tidak ada hasil lagi di halaman ini, beralih ke query berikutnya
          break;
        }

        totalOrganicFetched += pageResults.length;
        const accumulated = selectGoogleCompetitors(pageResults, gameConfig, targetCount, {
          existingRanking: ranking,
          existingDecisions: decisions,
          seenStores,
        });
        ranking = accumulated.ranking;
        decisions = accumulated.decisions;
      } catch (queryErr) {
        console.warn(`[Google Search] Gagal memuat query "${currentQuery}" (halaman ${pageNum}): ${queryErr.message}`);
        break;
      }

      // Jika kuota minimal sudah tercapai dan mendekati targetCount, hentikan pagination query ini
      if (ranking.length >= targetCount) break;
    }
  }

  return {
    ranking,
    rankingAudit: {
      requestedCompetitorCount: targetCount,
      minimumRequiredCount: minRequired,
      searchDepth: Math.min(100, Math.max(20, targetCount * 3)),
      organicResultCount: totalOrganicFetched,
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
  fetchSerperSerp,
  getRetryDelay,
  isTemporaryScrapeError,
  mapWithConcurrency,
  normalizeStoreUrl,
  scrapeStore,
  scrapeWithRetry,
  searchGoogle,
  selectGoogleCompetitors,
};
