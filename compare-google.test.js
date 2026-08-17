const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  findMatches,
  parseProduct,
  selectCheapestProducts,
} = require("./product-matcher");
const {
  createOverallSummary,
  createPairFileName,
  createScrapeFileName,
  createUniqueRunDirectory,
  createPairRows,
  describeStatus,
  getRetryDelay,
  isTemporaryScrapeError,
  isTopUpCompetitorResult,
  mapWithConcurrency,
  normalizeStoreUrl,
  scrapeWithRetry,
  searchGoogle,
  selectGoogleCompetitors,
} = require("./compare-google");
const { GAME_CONFIGS, isMainStoreUrl } = require("./compare-google-config");

function testGameConfiguration() {
  assert.strictEqual(GAME_CONFIGS.length, 3);
  for (const game of GAME_CONFIGS) {
    assert.strictEqual(game.mainStores.length, 2);
    assert.deepStrictEqual(
      game.mainStores.map((store) => store.name),
      ["UPoint", "DuniaGames"],
    );
  }
}

function testMainStoresExcludedFromRanking() {
  assert.strictEqual(isMainStoreUrl("https://upoint.id/top-up/free_fire"), true);
  assert.strictEqual(
    isMainStoreUrl("https://duniagames.co.id/top-up/item/freefire"),
    true,
  );
  assert.strictEqual(
    isMainStoreUrl("https://www.codashop.com/id-id/free-fire"),
    false,
  );
}

function testTopUpCompetitorFiltering() {
  const freeFire = GAME_CONFIGS.find((game) => game.id === "free-fire");
  const roblox = GAME_CONFIGS.find((game) => game.id === "roblox");

  assert.strictEqual(
    isTopUpCompetitorResult(
      {
        link: "https://www.youtube.com/watch?v=example",
        title: "Top Up Free Fire Termurah",
        snippet: "Beli diamond Free Fire",
      },
      freeFire,
    ),
    false,
  );
  assert.strictEqual(
    isTopUpCompetitorResult(
      {
        link: "https://www.instagram.com/storegame/",
        title: "Top Up Roblox",
        snippet: "Jual Robux murah",
      },
      roblox,
    ),
    false,
  );
  assert.strictEqual(
    isTopUpCompetitorResult(
      {
        link: "https://example.com/blog/cara-main-free-fire",
        title: "Cara Bermain Free Fire",
        snippet: "Panduan pemula dan berita game",
      },
      freeFire,
    ),
    false,
  );
  assert.strictEqual(
    isTopUpCompetitorResult(
      {
        link: "https://eraspace.com/artikel/post/6-cara-top-up-roblox",
        title: "6 Cara Top Up Roblox yang Perlu Diketahui",
        snippet: "Harga Robux dan panduan membeli voucher",
      },
      roblox,
    ),
    false,
  );
  assert.strictEqual(
    isTopUpCompetitorResult(
      {
        link: "https://www.codashop.com/id-id/free-fire",
        title: "Top Up Free Fire",
        snippet: "Beli diamond Free Fire",
      },
      freeFire,
    ),
    true,
  );
  assert.strictEqual(
    isTopUpCompetitorResult(
      {
        link: "https://itemku.com/games/roblox",
        title: "Jual Robux Roblox Termurah",
        snippet: "Beli Robux dan Roblox gift card",
      },
      roblox,
    ),
    true,
  );
  assert.strictEqual(
    isTopUpCompetitorResult(
      {
        link: "javascript:alert(1)",
        title: "Top Up Roblox",
      },
      roblox,
    ),
    false,
  );
}

async function testGoogleRankingSelection() {
  const game = GAME_CONFIGS.find((entry) => entry.id === "roblox");
  const organicResults = [
    {
      title: "Cara Top Up Roblox",
      link: "https://example.com/blog/cara-top-up-roblox",
    },
    {
      position: 2,
      title: "Top Up Roblox Store A",
      link: "https://store-a.example/roblox/top-up",
    },
    {
      position: 3,
      title: "Top Up Roblox Store A Lain",
      link: "https://www.store-a.example/roblox/voucher",
    },
    {
      position: 4,
      title: "Beli Robux Store B",
      link: "https://store-b.example/games/roblox",
    },
  ];
  const selected = selectGoogleCompetitors(organicResults, game, 2);
  assert.deepStrictEqual(
    selected.ranking.map((result) => result.position),
    [2, 4],
  );

  let requestedUrl;
  const result = await searchGoogle("token", game, 2, async (url) => {
    requestedUrl = new URL(url);
    return {
      ok: true,
      json: async () => ({ organic_results: organicResults }),
    };
  });
  assert.strictEqual(Number(requestedUrl.searchParams.get("num")), 20);
  assert.strictEqual(result.ranking.length, 2);
  assert.strictEqual(result.rankingAudit.organicResultCount, 4);
  assert.strictEqual(
    result.rankingAudit.decisions[0].classification,
    "editorial_page",
  );
}

function testStoreUrlNormalization() {
  const mobileLegends = GAME_CONFIGS.find(
    (game) => game.id === "mobile-legends",
  );
  const freeFire = GAME_CONFIGS.find((game) => game.id === "free-fire");
  const roblox = GAME_CONFIGS.find((game) => game.id === "roblox");

  assert.strictEqual(
    normalizeStoreUrl(
      "https://www.tokopedia.com/voucher-game/mobile-legends/",
      mobileLegends,
    ).href,
    "https://www.tokopedia.com/digital/voucher-game/mobile-legends-bang-bang",
  );
  assert.strictEqual(
    normalizeStoreUrl(
      "https://www.tokopedia.com/voucher-game/free-fire/",
      freeFire,
    ).href,
    "https://www.tokopedia.com/digital/voucher-game/free-fire",
  );
  assert.strictEqual(
    normalizeStoreUrl("https://tokopedia.com/voucher-game/roblox", roblox).href,
    "https://www.tokopedia.com/digital/voucher-game/roblox",
  );
  assert.strictEqual(
    normalizeStoreUrl("https://www.unipin.com/id/mobile-legends", mobileLegends)
      .href,
    "https://www.unipin.com/id/mobile-legends",
  );
}

function testUniqueRunDirectories() {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "scrape-output-"));
  try {
    const first = createUniqueRunDirectory(outputRoot, "2026-08-17");
    const second = createUniqueRunDirectory(outputRoot, "2026-08-17");
    const third = createUniqueRunDirectory(outputRoot, "2026-08-17");

    assert.strictEqual(path.basename(first), "2026-08-17");
    assert.strictEqual(path.basename(second), "2026-08-17(2)");
    assert.strictEqual(path.basename(third), "2026-08-17(3)");
    assert(fs.statSync(first).isDirectory());
    assert(fs.statSync(second).isDirectory());
    assert(fs.statSync(third).isDirectory());
  } finally {
    fs.rmSync(outputRoot, { recursive: true, force: true });
  }
}

function testProductParsing() {
  assert.strictEqual(
    parseProduct("31+3 Diamonds", "mobile-legends").quantity,
    34,
  );
  assert.strictEqual(
    parseProduct("355+5 Diamond", "free-fire").quantity,
    360,
  );
  assert.strictEqual(
    parseProduct("5 Free Fire Diamonds", "free-fire").quantity,
    5,
  );
  assert.strictEqual(
    parseProduct("Roblox IDR 50.000", "roblox").key,
    parseProduct("50.000 IDR - Gift Card", "roblox").key,
  );
  assert.strictEqual(parseProduct("800 Robux", "roblox").key, "800 Robux");
  assert.strictEqual(
    parseProduct("Weekly Diamond Pass", "roblox").category,
    "other",
  );
  assert.strictEqual(parseProduct("800 Robux", "pubg").category, "other");
  assert.strictEqual(
    parseProduct("400 Robux + (Bonus 100)", "roblox").key,
    "500 Robux",
  );
  assert.strictEqual(
    parseProduct("Roblox Gift Card IDR 50.000", "roblox").key,
    "Roblox IDR 50000",
  );
  assert.strictEqual(
    parseProduct("Rp50.000,- Roblox Gift Card", "roblox").key,
    "Roblox IDR 50000",
  );
}

function testProximityMatching() {
  const mainProducts = selectCheapestProducts(
    [{ Produk: "31+3 Diamonds", Harga: "Rp12.910" }],
    "mobile-legends",
  );
  const competitorProducts = selectCheapestProducts(
    [
      { Produk: "33 Diamonds", Harga: "Rp9.559" },
      { Produk: "36 Diamonds", Harga: "Rp10.367" },
    ],
    "mobile-legends",
  );
  const mainProduct = Array.from(mainProducts.values())[0];
  const matches = findMatches(mainProduct, competitorProducts);

  assert.strictEqual(matches.length, 2);
  assert.strictEqual(matches[0].product.quantity, 33);
  assert.strictEqual(matches[1].product.quantity, 36);
}

function testPairRowsAndFileName() {
  const mainProducts = selectCheapestProducts(
    [{ Produk: "5 Diamonds", Harga: "Rp1.500" }],
    "mobile-legends",
  );
  const competitorProducts = selectCheapestProducts(
    [{ Produk: "5 Diamonds", Harga: "Rp1.400" }],
    "mobile-legends",
  );
  const mainStore = {
    name: "UPoint",
    url: "https://upoint.id/top-up/mobile_legends",
    products: mainProducts,
  };
  const competitor = {
    name: "codashop.com",
    url: "https://www.codashop.com/id-id/mobile-legends",
    position: 1,
    products: competitorProducts,
  };

  const rows = createPairRows(
    { id: "mobile-legends", name: "Mobile Legends" },
    mainStore,
    competitor,
  );

  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0]["Situs Utama"], "UPoint");
  assert.strictEqual(rows[0]["Situs Pembanding"], "codashop.com");
  assert.strictEqual(rows[0].Game, "Mobile Legends");
  assert.strictEqual(
    createPairFileName(mainStore, competitor),
    "rank-01-upoint-vs-codashop-com",
  );
  assert.strictEqual(
    createScrapeFileName({ name: "UPoint", position: "Utama" }),
    "main-upoint",
  );
  assert.strictEqual(
    createScrapeFileName({ store: "mobapay.com", position: 8 }),
    "rank-08-mobapay-com",
  );
}

function testAllProductsIncluded() {
  const mainProducts = selectCheapestProducts(
    [
      { Produk: "800 Robux", Harga: "Rp235.000" },
      { Produk: "50.000 IDR - Gift Card", Harga: "Rp50.000" },
      { Produk: "300.000 IDR - Gift Card", Harga: "Rp300.000" },
    ],
    "roblox",
  );
  const competitorProducts = selectCheapestProducts(
    [
      { Produk: "800 Robux", Harga: "Rp167.684" },
      { Produk: "Roblox Gift Card IDR 50.000", Harga: "Rp51.064" },
      { Produk: "Roblox Gift Card IDR 65.000", Harga: "Rp66.383" },
    ],
    "roblox",
  );
  const rows = createPairRows(
    { id: "roblox", name: "Roblox" },
    { name: "DuniaGames", url: "https://duniagames.co.id", products: mainProducts },
    { name: "tokopedia.com", url: "https://tokopedia.com", position: 10, products: competitorProducts },
  );

  assert.strictEqual(rows.length, 4);
  assert(rows.some((row) => row["Produk Utama"] === "50.000 IDR - Gift Card"));
  assert(rows.some((row) => row.Status === "TIDAK_ADA_DI_PEMBANDING"));
  assert(rows.some((row) => row.Status === "HANYA_ADA_DI_PEMBANDING"));
}

function testTemporaryScrapeErrors() {
  assert.strictEqual(
    isTemporaryScrapeError(new Error("Timeout 90000ms exceeded")),
    true,
  );
  assert.strictEqual(
    isTemporaryScrapeError(new Error("net::ERR_HTTP2_PROTOCOL_ERROR")),
    true,
  );
  assert.strictEqual(
    isTemporaryScrapeError(new Error("SITUS_BELUM_DIDUKUNG")),
    false,
  );
  const retryableValidationError = new Error("DATA_TIDAK_VALID");
  retryableValidationError.retryable = true;
  assert.strictEqual(isTemporaryScrapeError(retryableValidationError), true);
  const repeatedChallengeError = new Error("Cloudflare timeout");
  repeatedChallengeError.retryable = false;
  assert.strictEqual(isTemporaryScrapeError(repeatedChallengeError), false);
  assert.strictEqual(
    isTemporaryScrapeError(new Error("Data harga tidak ditemukan")),
    true,
  );
}

async function testScrapeRetry() {
  let callCount = 0;
  const delays = [];
  const rows = await scrapeWithRetry(
    new URL("https://upoint.id/top-up/roblox"),
    false,
    3,
    async () => {
      callCount += 1;
      if (callCount < 3) throw new Error("Timeout 90000ms exceeded");
      return [{ Produk: "800 Robux", Harga: "Rp235.000" }];
    },
    async (delay) => delays.push(delay),
  );

  assert.strictEqual(callCount, 3);
  assert.deepStrictEqual(delays, [2_000, 4_000]);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(getRetryDelay(4), 15_000);
}

async function testConcurrencyLimit() {
  let activeWorkers = 0;
  let maximumWorkers = 0;
  const results = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
    activeWorkers += 1;
    maximumWorkers = Math.max(maximumWorkers, activeWorkers);
    await new Promise((resolve) => setTimeout(resolve, 5));
    activeWorkers -= 1;
    return value * 2;
  });

  assert.deepStrictEqual(results, [2, 4, 6, 8, 10]);
  assert.strictEqual(maximumWorkers, 2);
}

function testOverallSummary() {
  const summary = createOverallSummary(
    [
      {
        success: true,
        game: "Mobile Legends",
        comparisonFileCount: 4,
        comparisonCount: 100,
        scrapes: [
          { type: "main", name: "DuniaGames", url: "https://dg.example", success: true },
          { type: "competitor", name: "Store A", url: "https://a.example", success: false },
        ],
      },
      {
        success: false,
        game: "Free Fire",
        comparisonFileCount: 0,
        comparisonCount: 0,
        scrapes: [
          { type: "main", name: "UPoint", url: "https://up.example", success: false },
        ],
        error: "Semua situs utama gagal",
      },
      {
        success: true,
        game: "Roblox",
        comparisonFileCount: 3,
        comparisonCount: 25,
        scrapes: [
          { type: "competitor", name: "Store B", url: "https://b.example", success: true },
        ],
      },
    ],
    "2026-08-14T08:00:00.000Z",
  );

  assert.strictEqual(summary.success, false);
  assert.strictEqual(summary.status, "PARTIAL");
  assert.strictEqual(summary.gameCount, 3);
  assert.strictEqual(summary.successfulGameCount, 2);
  assert.strictEqual(summary.failedGameCount, 1);
  assert.strictEqual(summary.comparisonFileCount, 7);
  assert.strictEqual(summary.comparisonCount, 125);
  assert.strictEqual(summary.allScrapesSuccessful, false);
  assert.strictEqual(summary.scrapeCount, 4);
  assert.strictEqual(summary.successfulScrapeCount, 2);
  assert.strictEqual(summary.failedScrapeCount, 2);
  assert.strictEqual(summary.scrapes[0].game, "Mobile Legends");
}

function testComparisonStatus() {
  assert.strictEqual(describeStatus(2543), "PEMBANDING_LEBIH_MURAH");
  assert.strictEqual(describeStatus(-2543), "UTAMA_LEBIH_MURAH");
  assert.strictEqual(describeStatus(0), "HARGA_SAMA");
}

async function main() {
  testGameConfiguration();
  testMainStoresExcludedFromRanking();
  testTopUpCompetitorFiltering();
  await testGoogleRankingSelection();
  testStoreUrlNormalization();
  testUniqueRunDirectories();
  testProductParsing();
  testProximityMatching();
  testPairRowsAndFileName();
  testAllProductsIncluded();
  testTemporaryScrapeErrors();
  await testScrapeRetry();
  await testConcurrencyLimit();
  testOverallSummary();
  testComparisonStatus();
  console.log("Google comparison tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
