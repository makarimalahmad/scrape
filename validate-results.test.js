const assert = require("assert");
const { validateScrapeResults } = require("./validate-results");

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

testInvalidUnknownSite();
testValidKnownSite();
testBrokenKnownSite();
testValidUnknownSite();
console.log("Validation tests passed.");
