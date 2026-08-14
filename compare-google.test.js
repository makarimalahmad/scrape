const assert = require("assert");
const {
  findMatches,
  parseProduct,
  selectCheapestProducts,
} = require("./product-matcher");
const {
  createPairFileName,
  createPairRows,
  describeStatus,
  getRetryDelay,
  isTemporaryScrapeError,
  scrapeWithRetry,
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
  assert(rows.some((row) => row.Status === "Tidak ada pasangan di situs pembanding"));
  assert(rows.some((row) => row.Status === "Produk hanya ada di situs pembanding"));
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
  assert.deepStrictEqual(delays, [5_000, 10_000]);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(getRetryDelay(4), 30_000);
}

function testComparisonStatus() {
  const status = describeStatus(
    { quantity: 34, price: 12910 },
    { quantity: 36, price: 10367 },
    2543,
  );
  assert.strictEqual(status, "Pembanding lebih banyak/sama dan lebih murah");
}

async function main() {
  testGameConfiguration();
  testMainStoresExcludedFromRanking();
  testProductParsing();
  testProximityMatching();
  testPairRowsAndFileName();
  testAllProductsIncluded();
  testTemporaryScrapeErrors();
  await testScrapeRetry();
  testComparisonStatus();
  console.log("Google comparison tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
