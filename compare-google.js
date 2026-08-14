const fs = require("fs");
const path = require("path");
const { exportCsv, scrape, validateUrl } = require("./scrape");
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

const DEFAULT_SELECTOR =
  '.denom, article, li, label, button, [role="radio"], [class*="product"], [class*="item"], [class*="card"], [class*="denom"]';

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

async function searchGoogle(apiKey, gameConfig, limit) {
  const parameters = new URLSearchParams({
    engine: "google",
    q: gameConfig.query,
    location: "Indonesia",
    hl: "id",
    gl: "id",
    device: "desktop",
    num: "10",
    api_key: apiKey,
  });

  console.log(`Cari ranking Google: ${gameConfig.query}`);
  const response = await fetch(`https://serpapi.com/search.json?${parameters}`);
  if (!response.ok) throw new Error(`SerpAPI HTTP ${response.status}`);

  const data = await response.json();
  if (data.error) throw new Error(data.error);

  return (data.organic_results || [])
    .filter((result) => result.link && !isMainStoreUrl(result.link))
    .slice(0, limit)
    .map((result, index) => ({
      position: result.position ?? index + 1,
      title: result.title,
      link: result.link,
      store: normalizeHostname(result.link),
    }));
}

function isTemporaryScrapeError(error) {
  return /timeout|timed out|err_http2_protocol_error|err_timed_out|connection reset|econnreset|socket hang up|network changed|eai_again|econnrefused|navigation failed because page crashed/i.test(
    error.message,
  );
}

function getRetryDelay(attempt) {
  return Math.min(5_000 * 2 ** (attempt - 1), 30_000);
}

async function scrapeWithRetry(
  url,
  headed,
  maxAttempts = 3,
  scrapeFunction = scrape,
  sleepFunction = (delay) => new Promise((resolve) => setTimeout(resolve, delay)),
) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await scrapeFunction(url, DEFAULT_SELECTOR, headed);
    } catch (error) {
      lastError = error;
      if (!isTemporaryScrapeError(error) || attempt === maxAttempts) throw error;
      const delay = getRetryDelay(attempt);
      console.log(
        `Koneksi sementara gagal: ${error.message}. Coba ulang ${attempt + 1}/${maxAttempts} dalam ${delay / 1_000} detik...`,
      );
      await sleepFunction(delay);
    }
  }

  throw lastError;
}

async function scrapeStore(store, gameConfig, headed, maxAttempts) {
  const url = validateUrl(store.url || store.link);
  console.log(`Scrape ${gameConfig.name}: ${store.name || store.store}`);
  const rows = await scrapeWithRetry(url, headed, maxAttempts);
  const validation = validateScrapeResults(url.href, rows);

  if (!validation.valid) {
    throw new Error(
      `${validation.status}, confidence ${validation.confidence}: ${validation.reasons.join(", ")}`,
    );
  }

  return {
    name: store.name || store.store,
    url: url.href,
    position: store.position ?? "Utama",
    confidence: validation.confidence,
    products: selectCheapestProducts(rows, gameConfig.id),
  };
}

function describeStatus(mainProduct, competitorProduct, difference) {
  if (
    competitorProduct.quantity !== null &&
    mainProduct.quantity !== null &&
    competitorProduct.quantity >= mainProduct.quantity &&
    competitorProduct.price < mainProduct.price
  ) {
    return "Pembanding lebih banyak/sama dan lebih murah";
  }
  if (difference > 0) return "Situs utama lebih mahal";
  if (difference < 0) return "Situs utama lebih murah";
  return "Harga sama";
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
        Status: "Tidak ada pasangan di situs pembanding",
        "URL Utama": mainStore.url,
        "URL Pembanding": competitor.url,
        _difference: Number.NEGATIVE_INFINITY,
      });
      continue;
    }

    for (const match of matches) {
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
        "Harga/Unit Pembanding": formatPrice(
          competitorProduct.pricePerUnit,
        ),
        "Selisih Jumlah": match.quantityDifference,
        "Selisih Harga": formatPrice(Math.abs(difference)),
        Status: describeStatus(mainProduct, competitorProduct, difference),
        "URL Utama": mainStore.url,
        "URL Pembanding": competitor.url,
        _difference: difference,
      });
    }
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
      Status: "Produk hanya ada di situs pembanding",
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
      files.push({
        mainStore: mainStore.name,
        competitor: competitor.name,
        ranking: competitor.position,
        comparisonCount: rows.length,
        csvPath,
      });
    }
  }

  return files;
}

async function processGame(apiKey, gameConfig, options) {
  console.log(`\n===== ${gameConfig.name} =====`);
  const ranking = await searchGoogle(apiKey, gameConfig, options.limit);
  console.table(ranking);

  const mainStores = [];
  for (const mainStore of gameConfig.mainStores) {
    try {
      mainStores.push(
        await scrapeStore(
          mainStore,
          gameConfig,
          options.headed,
          options.maxAttempts,
        ),
      );
    } catch (error) {
      console.error(`Gagal situs utama ${mainStore.name}: ${error.message}`);
    }
  }

  if (!mainStores.length) {
    throw new Error(`Semua situs utama ${gameConfig.name} gagal.`);
  }

  const competitors = [];
  const failedCompetitors = [];
  for (const rankedStore of ranking) {
    try {
      competitors.push(
        await scrapeStore(
          rankedStore,
          gameConfig,
          options.headed,
          options.maxAttempts,
        ),
      );
    } catch (error) {
      failedCompetitors.push({
        position: rankedStore.position,
        store: rankedStore.store,
        url: rankedStore.link,
        error: error.message,
      });
      console.error(`Lewati ${rankedStore.store}: ${error.message}`);
    }
  }

  if (!competitors.length) {
    throw new Error(`Semua situs pembanding ${gameConfig.name} gagal.`);
  }

  const files = exportComparisonFiles(
    gameConfig,
    mainStores,
    competitors,
    options.outputDirectory,
  );
  if (!files.length) {
    throw new Error(`Tidak ada produk ${gameConfig.name} yang cocok.`);
  }

  return {
    game: gameConfig.name,
    query: gameConfig.query,
    ranking,
    mainStores: mainStores.map((store) => ({
      name: store.name,
      url: store.url,
      productCount: store.products.size,
      confidence: store.confidence,
    })),
    competitors: competitors.map((store) => ({
      name: store.name,
      url: store.url,
      position: store.position,
      productCount: store.products.size,
      confidence: store.confidence,
    })),
    failedCompetitors,
    comparisonFileCount: files.length,
    comparisonCount: files.reduce(
      (total, file) => total + file.comparisonCount,
      0,
    ),
    files,
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
      "Pilih game dengan --game mobile-legends, --game free-fire, atau --game roblox.",
    );
  }
  const selectedGame = GAME_CONFIGS.find((game) => game.id === gameId);
  if (!selectedGame) {
    throw new Error(
      `Game tidak valid: ${gameId}. Pilih mobile-legends, free-fire, atau roblox.`,
    );
  }

  const headed = process.argv.includes("--headed");
  const attemptsValue = Number(getArgument("attempts", "3"));
  const maxAttempts = Number.isInteger(attemptsValue)
    ? Math.min(5, Math.max(1, attemptsValue))
    : 3;
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const date = timestamp.slice(0, 10);
  const outputDirectory = path.resolve(
    __dirname,
    "output",
    date,
    "comparison",
    selectedGame.id,
    timestamp,
  );
  fs.mkdirSync(outputDirectory, { recursive: true });

  const summaries = [];
  for (const gameConfig of [selectedGame]) {
    try {
      summaries.push(
        await processGame(apiKey, gameConfig, {
          limit,
          headed,
          maxAttempts,
          timestamp,
          outputDirectory,
        }),
      );
    } catch (error) {
      summaries.push({
        game: gameConfig.name,
        query: gameConfig.query,
        error: error.message,
      });
      console.error(`Gagal ${gameConfig.name}: ${error.message}`);
    }
  }

  const summaryPath = path.join(
    outputDirectory,
    `summary-${selectedGame.id}-${timestamp}.json`,
  );
  fs.writeFileSync(summaryPath, JSON.stringify(summaries, null, 2), "utf8");

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
  console.log(`Summary: ${summaryPath}`);

  if (summaries.some((summary) => summary.error)) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Gagal: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  createPairFileName,
  createPairRows,
  describeStatus,
  exportComparisonFiles,
  getRetryDelay,
  isTemporaryScrapeError,
  scrapeWithRetry,
  searchGoogle,
};
