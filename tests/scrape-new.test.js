const assert = require("assert");
const { selectCheapestProducts } = require("../product-matcher");
const {
  calculateComparison,
  createScrapeRows,
  createScrapeWorkbook,
  createProductAnchors,
  matchStoreToAnchors,
  selectBenchmark,
} = require("../scrape-new");

function createStore(name, position, rows, game = "mobile-legends") {
  return {
    name,
    position,
    url: `https://${name.toLowerCase()}.example`,
    products: selectCheapestProducts(rows, game),
  };
}

function testAnchorsAndOneToOneMatching() {
  const upoint = createStore("UPoint", "Utama", [
    { Produk: "5 Diamonds", Harga: "Rp1.500" },
    { Produk: "11 Diamonds", Harga: "Rp3.500" },
  ]);
  const duniaGames = createStore("DuniaGames", "Utama", [
    { Produk: "5 Diamonds", Harga: "Rp1.600" },
    { Produk: "12 Diamonds", Harga: "Rp3.600" },
    { Produk: "50 Diamonds", Harga: "Rp14.000" },
  ]);
  const anchors = createProductAnchors([upoint, duniaGames]);

  assert.strictEqual(anchors.length, 3);
  assert.deepStrictEqual(
    anchors.map((anchor) => anchor.reference.quantity),
    [5, 11, 50],
  );
  assert.strictEqual(anchors[1].mainProducts.get("DuniaGames").quantity, 12);

  const competitor = createStore("Store A", 1, [
    { Produk: "6 Diamonds", Harga: "Rp1.400" },
  ]);
  const { matches } = matchStoreToAnchors(anchors, competitor);
  assert.strictEqual(matches.size, 1);
}

function testBenchmarksAndComparison() {
  const entries = [
    {
      store: { name: "Store B", position: 4 },
      product: { price: 1_200 },
    },
    {
      store: { name: "Store A", position: 2 },
      product: { price: 1_000 },
    },
    {
      store: { name: "Store C", position: 8 },
      product: { price: 1_200 },
    },
  ];

  assert.strictEqual(selectBenchmark(entries, "lowest").store.name, "Store A");
  assert.strictEqual(selectBenchmark(entries, "highest").store.name, "Store B");
  assert.deepStrictEqual(
    calculateComparison({ price: 1_100 }, entries[1]),
    { difference: 100, percentage: "9.0909%" },
  );
  assert.deepStrictEqual(calculateComparison(null, entries[1]), {
    difference: "-",
    percentage: "-",
  });
}

function testScrapeRowsPreserveGoogleRanks() {
  const game = { id: "mobile-legends", name: "Mobile Legends" };
  const ranking = [
    { position: 1, store: "store-a.com" },
    { position: 3, store: "failed-store.com" },
    { position: 7, store: "store-b.com" },
  ];
  const upoint = createStore("UPoint", "Utama", [
    { Produk: "5 Diamonds", Harga: "Rp1.100" },
    { Produk: "11 Diamonds", Harga: "Rp3.300" },
  ]);
  const duniaGames = createStore("DuniaGames", "Utama", [
    { Produk: "5 Diamonds", Harga: "Rp1.150" },
    { Produk: "11 Diamonds", Harga: "Rp3.000" },
  ]);
  const storeA = createStore("store-a.com", 1, [
    { Produk: "5 Diamonds", Harga: "Rp1.000" },
    { Produk: "11 Diamonds", Harga: "Rp3.100" },
  ]);
  const storeB = createStore("store-b.com", 7, [
    { Produk: "5 Diamonds", Harga: "Rp1.200" },
    { Produk: "11 Diamonds", Harga: "Rp2.900" },
    { Produk: "100 Diamonds", Harga: "Rp20.000" },
  ]);
  const rows = createScrapeRows(
    game,
    ranking,
    [upoint, duniaGames],
    [storeA, storeB],
  );

  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[0].Produk, "5 Diamonds");
  assert.strictEqual(rows[0]["store-a.com"], 1_000);
  assert.strictEqual(rows[0]["failed-store.com"], "-");
  assert.strictEqual(rows[0]["store-b.com"], 1_200);
  assert.strictEqual(rows[0]["Harga Terendah | UPoint"], 1_100);
  assert.strictEqual(rows[0]["Harga Terendah | UPoint Selisih"], 100);
  assert.strictEqual(rows[0]["Harga Terendah | UPoint %"], "9.0909%");
  assert.strictEqual(rows[0]["Harga Tertinggi | UPoint"], 1_100);
  assert.strictEqual(rows[0]["Harga Tertinggi | UPoint Selisih"], -100);
  assert.strictEqual(rows[1]["Harga Terendah | DuniaGames Selisih"], 100);
  assert.deepStrictEqual(Object.keys(rows[0]), [
    "Produk",
    "store-a.com",
    "failed-store.com",
    "store-b.com",
    "Harga Terendah | UPoint",
    "Harga Terendah | UPoint Selisih",
    "Harga Terendah | UPoint %",
    "Harga Terendah | DuniaGames",
    "Harga Terendah | DuniaGames Selisih",
    "Harga Terendah | DuniaGames %",
    "Harga Tertinggi | UPoint",
    "Harga Tertinggi | UPoint Selisih",
    "Harga Tertinggi | UPoint %",
    "Harga Tertinggi | DuniaGames",
    "Harga Tertinggi | DuniaGames Selisih",
    "Harga Tertinggi | DuniaGames %",
  ]);

  const { worksheet } = createScrapeWorkbook(game, ranking, rows);
  assert.strictEqual(worksheet.getCell("A1").value, "Produk");
  assert.strictEqual(worksheet.getCell("B1").value, "store-a.com");
  assert.strictEqual(worksheet.getCell("E1").value, null);
  assert.strictEqual(worksheet.getCell("F1").value, "Harga terendah");
  assert.strictEqual(worksheet.getCell("L1").value, null);
  assert.strictEqual(worksheet.getCell("M1").value, "Harga tertinggi");
  assert.strictEqual(worksheet.getCell("F2").value, "UPoint");
  assert.strictEqual(worksheet.getCell("I2").value, "DuniaGames");
  assert(Math.abs(worksheet.getCell("H3").value - 0.090909) < 1e-10);
  assert.strictEqual(worksheet.getColumn(5).width, 3);
  assert.strictEqual(worksheet.autoFilter, null);
  assert.strictEqual(
    worksheet.getColumn(2).numFmt,
    '"Rp. "#,##0;[Red]-"Rp. "#,##0',
  );
  assert.strictEqual(
    worksheet.getColumn(6).numFmt,
    '"Rp. "#,##0;[Red]-"Rp. "#,##0',
  );
  assert.strictEqual(worksheet.getColumn(8).numFmt, "0.0000%");
  assert.strictEqual(worksheet.getColumn(15).numFmt, "0.0000%");
}

function main() {
  testAnchorsAndOneToOneMatching();
  testBenchmarksAndComparison();
  testScrapeRowsPreserveGoogleRanks();
  console.log("New scraper tests passed.");
}

main();
