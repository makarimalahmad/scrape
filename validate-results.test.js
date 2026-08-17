const assert = require("assert");
const {
  normalizeMobapayProductName,
  normalizeTokopediaUrl,
  parseBlibliOptionText,
  parseDuniaGamesCardText,
  parseRobloxProductCard,
  parseUniPinCardText,
  parseUPointCardText,
} = require("./scrape");
const { validateScrapeResults } = require("./validate-results");

function testKnownSiteCardParsers() {
  assert.deepStrictEqual(parseUPointCardText("5 Diamonds\nFrom\n1.579"), {
    Produk: "5 Diamonds",
    Harga: "Rp 1.579",
  });
  assert.deepStrictEqual(
    parseDuniaGamesCardText("3 Diamonds\n1.195", "3 Diamonds"),
    { Produk: "3 Diamonds", Harga: "Rp 1.195" },
  );
  assert.deepStrictEqual(
    parseUniPinCardText("5 Diamonds + 0 Bonus\nIDR 1.425"),
    { Produk: "5 Diamonds + 0 Bonus", Harga: "IDR 1.425" },
  );
  assert.strictEqual(parseUPointCardText("Pilih denom terlebih dahulu Rp 0"), null);
  assert.strictEqual(parseUniPinCardText("Total IDR 0"), null);
  assert.strictEqual(
    normalizeMobapayProductName("11 +1", "/mlbb"),
    "11 +1 Diamonds",
  );
  assert.strictEqual(
    normalizeMobapayProductName("Weekly Diamond Pass", "/mlbb"),
    "Weekly Diamond Pass",
  );
  assert.strictEqual(
    normalizeMobapayProductName("60 UC", "/pubg"),
    "60 UC",
  );
  assert.strictEqual(
    normalizeTokopediaUrl(
      "https://www.tokopedia.com/voucher-game/free-fire/",
    ).href,
    "https://www.tokopedia.com/digital/voucher-game/free-fire",
  );
  assert.strictEqual(
    normalizeTokopediaUrl(
      "https://www.tokopedia.com/voucher-game/mobile-legends/",
    ).href,
    "https://www.tokopedia.com/digital/voucher-game/mobile-legends-bang-bang",
  );
  assert.deepStrictEqual(
    parseBlibliOptionText("310 Diamonds + Bonus 35 Diamonds\nRp54.390"),
    {
      Produk: "310 Diamonds + Bonus 35 Diamonds",
      Harga: "Rp54.390",
    },
  );
  assert.strictEqual(parseBlibliOptionText("Produk belum dipilih"), null);
  assert.deepStrictEqual(
    parseRobloxProductCard("24.000 22.500 Rp 3,599 jt"),
    { Produk: "24000 Robux", Harga: "Rp 3.599.000" },
  );
  assert.deepStrictEqual(parseRobloxProductCard("5.250 4.500 Rp 900 rb"), {
    Produk: "5250 Robux",
    Harga: "Rp 900.000",
  });
  assert.deepStrictEqual(parseRobloxProductCard("1,000 800 IDR 180.000"), {
    Produk: "1000 Robux",
    Harga: "Rp 180.000",
  });
  assert.strictEqual(parseRobloxProductCard("Roblox Premium"), null);
}

function testInvalidUnknownSite() {
  const rows = [{ Produk: "abungan", Harga: "$0.17" }];
  const result = validateScrapeResults(
    "https://unknown-store.example/mobile-legends",
    rows,
  );

  assert.strictEqual(result.valid, false);
  assert.strictEqual(result.status, "SITUS_BELUM_DIDUKUNG");
}

function testValidKnownSite() {
  const rows = [
    { Produk: "5 Diamonds + 0", Harga: "IDR 1.425" },
    { Produk: "11 Diamonds + 1", Harga: "IDR 3.325" },
  ];
  const result = validateScrapeResults(
    "https://www.unipin.com/id/mobile-legends",
    rows,
  );

  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.status, "VALID");
}

function testBrokenKnownSite() {
  const rows = [
    { Produk: "Tabungan", Harga: "Rp29.317" },
    { Produk: "8% OFF", Harga: "Rp182.095" },
  ];
  const result = validateScrapeResults(
    "https://www.lootbar.com/id/top-up/mobile-legends-bang-bang",
    rows,
  );

  assert.strictEqual(result.valid, false);
  assert.strictEqual(result.status, "DATA_TIDAK_VALID");
}

function testNumericNoiseRejected() {
  const rows = [
    { Produk: "1", Harga: "1000" },
    { Produk: "2", Harga: "2000" },
    { Produk: "3", Harga: "3000" },
    { Produk: "4", Harga: "4000" },
  ];
  const result = validateScrapeResults(
    "https://unknown-store.example/mobile-legends",
    rows,
    "mobile-legends",
  );

  assert.strictEqual(result.valid, false);
}

function testMobapayMobileLegendsRows() {
  const rows = [
    { Produk: "50 +50 Diamonds", Harga: "Rp. 14.053" },
    { Produk: "150 +150 Diamonds", Harga: "Rp. 41.919" },
    { Produk: "Weekly Diamond Pass", Harga: "Rp. 27.000" },
    { Produk: "Weekly Elite Bundle", Harga: "Rp. 14.053" },
    { Produk: "5 Diamonds", Harga: "Rp. 1.410" },
    { Produk: "11 +1 Diamonds", Harga: "Rp. 3.290" },
  ];
  const result = validateScrapeResults(
    "https://www.mobapay.com/mlbb",
    rows,
    "mobile-legends",
  );

  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.stats.relevantProductRatio, 1);
}

function testWrongGameProductsRejected() {
  const rows = [
    { Produk: "5 Diamonds", Harga: "Rp 1.500" },
    { Produk: "12 Diamonds", Harga: "Rp 3.500" },
    { Produk: "50 Diamonds", Harga: "Rp 14.000" },
    { Produk: "Weekly Diamond Pass", Harga: "Rp 28.000" },
  ];
  const result = validateScrapeResults(
    "https://new-store.example/roblox",
    rows,
    "roblox",
  );

  assert.strictEqual(result.valid, false);
}

function testValidUnknownSite() {
  const rows = [
    { Produk: "5 Diamonds", Harga: "Rp 1.500" },
    { Produk: "12 Diamonds", Harga: "Rp 3.500" },
    { Produk: "50 Diamonds", Harga: "Rp 14.000" },
    { Produk: "Weekly Diamond Pass", Harga: "Rp 28.000" },
  ];
  const result = validateScrapeResults(
    "https://new-store.example/mobile-legends",
    rows,
  );

  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.status, "VALID");
}

testKnownSiteCardParsers();
testInvalidUnknownSite();
testValidKnownSite();
testBrokenKnownSite();
testNumericNoiseRejected();
testMobapayMobileLegendsRows();
testWrongGameProductsRejected();
testValidUnknownSite();
console.log("Validation tests passed.");
