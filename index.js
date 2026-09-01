require("dotenv").config({ quiet: true });
const { chromium } = require("./playwright");
const { scrape, exportCsv, saveInvalidReport } = require("./scrape");
const { validateScrapeResults } = require("./validate-results");
const {
  GAME_CONFIGS,
  MAIN_STORE_DOMAINS,
  isMainStoreUrl,
  normalizeHostname,
} = require("./compare-google-config");
const {
  searchGoogle,
  scrapeStore,
  selectGoogleCompetitors,
  classifyTopUpCompetitorResult,
  mapWithConcurrency,
  createPairRows,
  exportComparisonFiles,
} = require("./compare-google");
const {
  createScrapeRows,
  createProductAnchors,
  createScrapeWorkbook,
  matchStoreToAnchors,
  calculateComparison,
  selectBenchmark,
  exportScrapeXlsx,
} = require("./scrape-new");
const {
  findMatches,
  parseProduct,
  parsePrice,
  selectCheapestProducts,
} = require("./product-matcher");
const { extractWithGroq } = require("./ai-extractor");

/**
 * Scrape price data from a single store URL.
 * @param {string} url - Target URL to scrape
 * @param {Object} [options]
 * @param {string} [options.selector] - Optional custom CSS selector
 * @param {boolean} [options.headed=false] - Run with visible browser
 * @param {string} [options.gameId] - Optional game ID for domain validation
 * @param {string} [options.exportCsvPath] - Optional path to export CSV
 * @returns {Promise<{ success: boolean, url: string, products: Array<{ name: string, price: string, rawPrice: number }>, count: number, confidence: number, status: string, error?: string, csvPath?: string, reasons?: string[] }>}
 */
async function scrapeUrl(url, options = {}) {
  try {
    const rawRows = await scrape(
      url,
      options.selector,
      Boolean(options.headed),
      options,
    );
    const validation = validateScrapeResults(
      url,
      rawRows,
      options.gameId || null,
    );

    const products = rawRows.map((r) => {
      const numPrice = Number(String(r.Harga || "").replace(/[^\d]/g, "")) || 0;
      return {
        name: r.Produk,
        price: r.Harga,
        rawPrice: numPrice,
      };
    });

    let csvPath = null;
    if (options.exportCsvPath && rawRows.length > 0) {
      csvPath = exportCsv(rawRows, options.exportCsvPath);
    }

    const usedAiFallback = Boolean(rawRows?._usedAiFallback || rawRows?.some((r) => r._usedAiFallback));
    return {
      success: validation.valid,
      url,
      products,
      count: products.length,
      confidence: validation.confidence,
      status: validation.status,
      usedAiFallback,
      extractionMethod: usedAiFallback ? "ai_fallback" : "standard",
      reasons: validation.reasons,
      csvPath,
    };
  } catch (error) {
    return {
      success: false,
      url,
      products: [],
      count: 0,
      confidence: 0,
      status: "FAILED",
      error: error.message,
    };
  }
}

/**
 * Compare prices directly between 2 specific URLs without using Google SerpAPI.
 * @param {string} mainUrl - Main reference store URL
 * @param {string} competitorUrl - Competitor store URL
 * @param {Object} [options]
 * @param {string} [options.game="mobile-legends"] - Game ID for parsing
 * @param {string} [options.exportCsvPath] - Optional file path to export comparison CSV
 * @returns {Promise<Object>} Comparison result between the two URLs
 */
async function compareUrls(mainUrl, competitorUrl, options = {}) {
  const game = options.game || "mobile-legends";
  const [mainResult, competitorResult] = await Promise.all([
    scrapeUrl(mainUrl, options),
    scrapeUrl(competitorUrl, options),
  ]);

  const mainParsed = selectCheapestProducts(
    mainResult.products.map((p) => ({ Produk: p.name, Harga: p.price })),
    game,
  );
  const competitorParsed = selectCheapestProducts(
    competitorResult.products.map((p) => ({ Produk: p.name, Harga: p.price })),
    game,
  );

  const mainStore = {
    name: new URL(mainUrl).hostname.replace(/^www\./, ""),
    url: mainUrl,
    products: mainParsed,
  };
  const competitorStore = {
    name: new URL(competitorUrl).hostname.replace(/^www\./, ""),
    url: competitorUrl,
    position: 1,
    products: competitorParsed,
  };

  const pairRows = createPairRows({ name: game }, mainStore, competitorStore);

  let csvPath = null;
  if (options.exportCsvPath && pairRows.length > 0) {
    csvPath = exportCsv(pairRows, options.exportCsvPath);
  }

  return {
    game,
    mainStore: mainStore.name,
    competitorStore: competitorStore.name,
    mainUrl,
    competitorUrl,
    mainProductCount: mainParsed.size,
    competitorProductCount: competitorParsed.size,
    comparisonRows: pairRows,
    csvPath,
  };
}

/**
 * Perform a full Google search and competitive price comparison for a supported game.
 * @param {string} gameId - "mobile-legends" | "free-fire" | "roblox"
 * @param {Object} [options]
 * @param {string} [options.apiKey] - SerpAPI Key (defaults to process.env.SERPAPI_KEY)
 * @param {number} [options.limit=10] - Number of top Google organic competitors to scrape
 * @param {number} [options.concurrency=3] - Parallel browser tabs
 * @param {number} [options.maxAttempts=3] - Retry attempts per store
 * @param {boolean} [options.headed=false] - Run headed browser
 * @param {string} [options.exportXlsxDirectory] - Optional folder to export styled Excel (.xlsx) file
 * @returns {Promise<Object>} Structured comparison data with anchors and store pricing
 */
async function compareGame(gameId, options = {}) {
  const apiKey = options.apiKey || process.env.SERPAPI_KEY;
  if (!apiKey) {
    throw new Error("SERPAPI_KEY required for Google comparison.");
  }

  const gameConfig = GAME_CONFIGS.find(
    (g) => g.id.toLowerCase() === String(gameId).trim().toLowerCase(),
  );
  if (!gameConfig) {
    throw new Error(
      `Game ID '${gameId}' tidak valid. Pilih: mobile-legends, free-fire, atau roblox.`,
    );
  }

  const limit = Math.min(10, Math.max(1, options.limit || 10));
  const concurrency = options.headed
    ? 1
    : Math.min(4, Math.max(1, options.concurrency || 3));
  const maxAttempts = Math.min(5, Math.max(1, options.maxAttempts || 3));
  const headed = Boolean(options.headed);

  const searchResult = await searchGoogle(apiKey, gameConfig, limit);
  const competitors = searchResult.ranking;

  const browser = await chromium.launch({ headless: !headed });
  const allStores = [];

  try {
    // 1. Scrape main stores
    for (const mainStore of gameConfig.mainStores) {
      try {
        const storeResult = await scrapeStore(mainStore, gameConfig, {
          browser,
          headed,
          maxAttempts,
          retryDelayMultiplier: 1,
        });
        allStores.push(storeResult);
      } catch (err) {
        allStores.push({
          name: mainStore.name,
          url: mainStore.url,
          success: false,
          error: err.message,
          products: new Map(),
        });
      }
    }

    // 2. Scrape competitor stores in parallel
    const competitorResults = await mapWithConcurrency(
      competitors,
      concurrency,
      async (competitor) => {
        try {
          return await scrapeStore(competitor, gameConfig, {
            browser,
            headed,
            maxAttempts,
            retryDelayMultiplier: 1,
          });
        } catch (err) {
          return {
            name: competitor.store,
            url: competitor.link,
            position: competitor.position,
            success: false,
            error: err.message,
            products: new Map(),
          };
        }
      },
    );

    allStores.push(...competitorResults);
  } finally {
    await browser.close();
  }

  const isStoreSuccess = (s) =>
    Boolean(s && !s.error && s.products && s.products.size > 0);

  const mainStoreResults = allStores.filter(
    (s) => isStoreSuccess(s) && gameConfig.mainStores.some((m) => m.name === s.name),
  );
  const competitorStoreResults = allStores.filter(
    (s) => isStoreSuccess(s) && !gameConfig.mainStores.some((m) => m.name === s.name),
  );

  const comparisonRows = createScrapeRows(
    gameConfig,
    competitors,
    mainStoreResults,
    competitorStoreResults,
  );

  const summary = comparisonRows.map((row) => {
    let cheapestStore = null;
    let cheapestPrice = Number.POSITIVE_INFINITY;

    for (const store of competitorStoreResults) {
      const storeName = store.name || store.store;
      const price = row[storeName];
      if (typeof price === "number" && price > 0 && price < cheapestPrice) {
        cheapestPrice = price;
        cheapestStore = storeName;
      }
    }

    return {
      product: row.Produk,
      cheapestStore: cheapestStore || "-",
      cheapestPrice:
        cheapestPrice === Number.POSITIVE_INFINITY ? "-" : cheapestPrice,
    };
  });

  let xlsxFilePath = null;
  if (options.exportXlsxDirectory && comparisonRows.length > 0) {
    xlsxFilePath = await exportScrapeXlsx(
      gameConfig,
      competitors,
      comparisonRows,
      options.exportXlsxDirectory,
    );
  }

  return {
    game: gameConfig.name,
    gameId: gameConfig.id,
    generatedAt: new Date().toISOString(),
    storeCount: allStores.length,
    successfulStoreCount: allStores.filter(isStoreSuccess).length,
    stores: allStores.map((s) => {
      const success = isStoreSuccess(s);
      let status = "FAILED";
      let reason = s.error || null;
      if (success) {
        status = s.usedAiFallback ? "SUCCESS_FALLBACK" : "SUCCESS";
        reason = s.usedAiFallback
          ? "Ekstraksi standar DOM belum lengkap, berhasil dipulihkan oleh Groq AI Fallback"
          : null;
      } else if (String(s.error || "").toLowerCase().includes("fallback")) {
        status = "FAILED_FALLBACK";
        reason = s.error;
      }
      return {
        name: s.name,
        classification: s.position == null || s.position === "Utama" ? "MAIN_STORE" : "COMPETITOR",
        position: s.position === "Utama" ? null : (s.position || null),
        url: s.url,
        productCount: s.products?.size || 0,
        status,
        reason,
        confidence: s.confidence || 0,
      };
    }),
    comparisonTable: comparisonRows,
    summary,
    xlsxFilePath,
  };
}

module.exports = {
  // Public High-level SDK Facades
  scrapeUrl,
  compareGame,
  compareUrls,

  // Export Utilities (Excel & CSV)
  exportXlsx: exportScrapeXlsx,
  exportCsv,
  createScrapeWorkbook,
  saveInvalidReport,

  // Normalization & Product Matching Engines
  matchProducts: findMatches,
  parseProduct,
  parsePrice,
  selectCheapestProducts,
  createProductAnchors,
  createScrapeRows,
  matchStoreToAnchors,
  calculateComparison,
  selectBenchmark,

  // Validation & AI Engines
  validateScrapeResults,
  extractWithGroq,

  // SerpAPI & Google Ranking
  searchGoogle,
  selectGoogleCompetitors,
  classifyTopUpCompetitorResult,
  scrapeStore,
  createPairRows,
  exportComparisonFiles,

  // Metadata & Configs
  GAME_CONFIGS,
  MAIN_STORE_DOMAINS,
  isMainStoreUrl,
  normalizeHostname,

  // Low-level Browser Scraper
  scrape,
};
