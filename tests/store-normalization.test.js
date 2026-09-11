const assert = require("assert");
const { normalizeStoreUrl, classifyTopUpCompetitorResult } = require("../lib/google/google-search");
const { parseRobloxProduct, parseDiamondProduct } = require("../lib/matcher/product-matcher");

console.log("==================================================");
console.log("🧪 MENJALANKAN TEST SUITE: STORE NORMALIZATION & MATCHER");
console.log("==================================================");

let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
    testsFailed++;
  }
}

// -------------------------------------------------------------
// 1. Uji Normalisasi URL Casatopup (Mobile Legends)
// -------------------------------------------------------------
test("Casatopup: mobile-legends-global dinormalisasi ke /id/beli/mobile-legends", () => {
  const input = "https://casatopup.com/id/beli/mobile-legends-global";
  const normalized = normalizeStoreUrl(input, { id: "mobile-legends" });
  assert.strictEqual(normalized.href, "https://casatopup.com/id/beli/mobile-legends");
});

test("Casatopup: /id/beli/mobile-legends tetap tidak berubah", () => {
  const input = "https://casatopup.com/id/beli/mobile-legends";
  const normalized = normalizeStoreUrl(input, { id: "mobile-legends" });
  assert.strictEqual(normalized.href, "https://casatopup.com/id/beli/mobile-legends");
});

// -------------------------------------------------------------
// 2. Uji Normalisasi URL Golrox (Roblox)
// -------------------------------------------------------------
test("Golrox: /beli-robux dinormalisasi ke /beli-robux/username", () => {
  const input = "https://golrox.com/beli-robux";
  const normalized = normalizeStoreUrl(input, { id: "roblox" });
  assert.strictEqual(normalized.href, "https://golrox.com/beli-robux/username");
});

test("Golrox: /beli-robux/instant dialihkan ke /beli-robux/username", () => {
  const input = "https://golrox.com/beli-robux/instant";
  const normalized = normalizeStoreUrl(input, { id: "roblox" });
  assert.strictEqual(normalized.href, "https://golrox.com/beli-robux/username");
});

test("Golrox: /beli-robux/username tetap tidak berubah", () => {
  const input = "https://golrox.com/beli-robux/username";
  const normalized = normalizeStoreUrl(input, { id: "roblox" });
  assert.strictEqual(normalized.href, "https://golrox.com/beli-robux/username");
});

// -------------------------------------------------------------
// 3. Uji Normalisasi URL Funnerlife (Mobile Legends)
// -------------------------------------------------------------
test("Funnerlife: /id/beli/mlbb dinormalisasi ke /id/beli/mobile-legend", () => {
  const input = "https://funnerlife.id/id/beli/mlbb";
  const normalized = normalizeStoreUrl(input, { id: "mobile-legends" });
  assert.strictEqual(normalized.href, "https://funnerlife.id/id/beli/mobile-legend");
});

// -------------------------------------------------------------
// 4. Uji Blacklist Domain Non-Store (lynk.id, linktr.ee)
// -------------------------------------------------------------
test("Blacklist: lynk.id ditolak sebagai non_store_domain", () => {
  const result = {
    link: "https://lynk.id/topuprobux",
    title: "Beli Robux Murah",
  };
  const decision = classifyTopUpCompetitorResult(result, { id: "roblox", name: "Roblox" });
  assert.strictEqual(decision.eligible, false);
  assert.strictEqual(decision.reason, "non_store_domain");
});

test("Blacklist: linktr.ee ditolak sebagai non_store_domain", () => {
  const result = {
    link: "https://linktr.ee/topupgame",
    title: "Top Up Game",
  };
  const decision = classifyTopUpCompetitorResult(result, { id: "roblox", name: "Roblox" });
  assert.strictEqual(decision.eligible, false);
  assert.strictEqual(decision.reason, "non_store_domain");
});

test("Blacklist: speedcash.co.id ditolak sebagai non_store_domain", () => {
  const result = {
    link: "https://www.speedcash.co.id/top-up-roblox",
    title: "Top Up Roblox Murah",
  };
  const decision = classifyTopUpCompetitorResult(result, { id: "roblox", name: "Roblox" });
  assert.strictEqual(decision.eligible, false);
  assert.strictEqual(decision.reason, "non_store_domain");
});

test("Editorial Heuristic: industry.co.id artikel berita ditolak sebagai editorial_page", () => {
  const result = {
    link: "https://www.industry.co.id/read/152496/top-up-diamond-mlbb-mobile-legends-yang-murah-dan-aman-lagi-ada-diskon",
    title: "Top Up Diamond MLBB Mobile Legends yang Murah Dan Aman Lagi Ada Diskon",
  };
  const decision = classifyTopUpCompetitorResult(result, { id: "mobile-legends", name: "Mobile Legends" });
  assert.strictEqual(decision.eligible, false);
  assert.strictEqual(decision.reason, "editorial_page");
});

test("Editorial Heuristic: URL dengan rute /read/ dan nomor artikel ditolak", () => {
  const result = {
    link: "https://beritagame.com/read/84920/top-up-free-fire-promo",
    title: "Top Up Free Fire",
  };
  const decision = classifyTopUpCompetitorResult(result, { id: "free-fire", name: "Free Fire" });
  assert.strictEqual(decision.eligible, false);
  assert.strictEqual(decision.reason, "editorial_page");
});

test("Editorial Heuristic: URL berbasis tanggal /2024/05/ ditolak", () => {
  const result = {
    link: "https://bloggame.id/2024/05/top-up-roblox-termurah",
    title: "Beli Robux Murah",
  };
  const decision = classifyTopUpCompetitorResult(result, { id: "roblox", name: "Roblox" });
  assert.strictEqual(decision.eligible, false);
  assert.strictEqual(decision.reason, "editorial_page");
});

test("Editorial Heuristic: Judul artikel panduan/tips ditolak", () => {
  const result = {
    link: "https://portalgame.id/top-up-ml",
    title: "Inilah Rekomendasi Tempat Top Up Diamond MLBB Termurah",
  };
  const decision = classifyTopUpCompetitorResult(result, { id: "mobile-legends", name: "Mobile Legends" });
  assert.strictEqual(decision.eligible, false);
  assert.strictEqual(decision.reason, "editorial_page");
});

// -------------------------------------------------------------
// 4. Uji Roblox Product Matcher (TopupGGWP & SpeedCash)
// -------------------------------------------------------------
test("Matcher: Roblox Gift Card IDR 50.000 cocok ke kategori roblox-idr-card", () => {
  const product = parseRobloxProduct("Roblox Gift Card IDR 50.000");
  assert.strictEqual(product.category, "roblox-idr-card");
  assert.strictEqual(product.key, "Roblox IDR 50000");
});

test("Matcher: Roblox Gift Card IDR 100.000 cocok ke kategori roblox-idr-card", () => {
  const product = parseRobloxProduct("Roblox Gift Card IDR 100.000");
  assert.strictEqual(product.category, "roblox-idr-card");
  assert.strictEqual(product.key, "Roblox IDR 100000");
});

test("Matcher: 800 Robux cocok ke kategori robux", () => {
  const product = parseRobloxProduct("800 Robux");
  assert.strictEqual(product.category, "robux");
  assert.strictEqual(product.key, "800 Robux");
});

test("Matcher: Bare number 800 dari Golrox cocok ke kategori robux", () => {
  const product = parseRobloxProduct("800");
  assert.strictEqual(product.category, "robux");
  assert.strictEqual(product.key, "800 Robux");
});

test("Matcher: SpeedCash Roblox (USD) 10 masuk kategori roblox-usd-card", () => {
  const product = parseRobloxProduct("Roblox (USD) 10");
  assert.strictEqual(product.category, "roblox-usd-card");
  assert.strictEqual(product.key, "Roblox USD 10");
});

// -------------------------------------------------------------
// 5. Uji First Top-up Diamond Matcher
// -------------------------------------------------------------
test("Matcher: 1000 Diamonds First Top-up diberi label (First Top-up)", () => {
  const product = parseDiamondProduct("1000 Diamonds First Top-up");
  assert.strictEqual(product.category, "diamond-first-topup");
  assert.strictEqual(product.key, "1000 Diamonds (First Top-up)");
  assert.strictEqual(product.quantity, 1000);
});

test("Matcher: 1000 Diamonds Pembelian Pertama diberi label (First Top-up)", () => {
  const product = parseDiamondProduct("1000 Diamonds Pembelian Pertama");
  assert.strictEqual(product.category, "diamond-first-topup");
  assert.strictEqual(product.key, "1000 Diamonds (First Top-up)");
  assert.strictEqual(product.quantity, 1000);
});

test("Matcher: 1000 Diamonds biasa tetap tanpa label", () => {
  const product = parseDiamondProduct("1000 Diamonds");
  assert.strictEqual(product.category, "diamond");
  assert.strictEqual(product.key, "1000 Diamonds");
  assert.strictEqual(product.quantity, 1000);
});

console.log("==================================================");
console.log(`HASIL: ${testsPassed} Berhasil, ${testsFailed} Gagal`);
console.log("==================================================");

if (testsFailed > 0) {
  process.exit(1);
}
