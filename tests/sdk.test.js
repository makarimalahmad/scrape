const test = require("node:test");
const assert = require("node:assert/strict");
const sdk = require("../index");

test("SDK exports all high-level and core utilities", () => {
  // High-level
  assert.strictEqual(typeof sdk.scrapeUrl, "function");
  assert.strictEqual(typeof sdk.compareGame, "function");
  assert.strictEqual(typeof sdk.compareUrls, "function");

  // Export Utilities
  assert.strictEqual(typeof sdk.exportXlsx, "function");
  assert.strictEqual(typeof sdk.exportCsv, "function");
  assert.strictEqual(typeof sdk.createScrapeWorkbook, "function");
  assert.strictEqual(typeof sdk.saveInvalidReport, "function");

  // Matching & Normalization
  assert.strictEqual(typeof sdk.matchProducts, "function");
  assert.strictEqual(typeof sdk.parseProduct, "function");
  assert.strictEqual(typeof sdk.parsePrice, "function");
  assert.strictEqual(typeof sdk.selectCheapestProducts, "function");
  assert.strictEqual(typeof sdk.createProductAnchors, "function");
  assert.strictEqual(typeof sdk.createScrapeRows, "function");
  assert.strictEqual(typeof sdk.matchStoreToAnchors, "function");
  assert.strictEqual(typeof sdk.calculateComparison, "function");
  assert.strictEqual(typeof sdk.selectBenchmark, "function");

  // AI & Validation
  assert.strictEqual(typeof sdk.validateScrapeResults, "function");
  assert.strictEqual(typeof sdk.extractWithGroq, "function");

  // Google & Browser
  assert.strictEqual(typeof sdk.searchGoogle, "function");
  assert.strictEqual(typeof sdk.scrapeStore, "function");
  assert.strictEqual(typeof sdk.scrape, "function");

  // Metadata
  assert.ok(Array.isArray(sdk.GAME_CONFIGS));
  assert.strictEqual(sdk.GAME_CONFIGS.length, 3);
  assert.ok(Array.isArray(sdk.MAIN_STORE_DOMAINS));
});

test("SDK parseProduct works correctly", () => {
  const norm = sdk.parseProduct("5 Diamonds", "free-fire");
  assert.strictEqual(norm.quantity, 5);
  assert.strictEqual(norm.category, "diamond");
  assert.strictEqual(norm.key, "5 Diamonds");
  assert.strictEqual(norm.unit, "Diamond");
});
