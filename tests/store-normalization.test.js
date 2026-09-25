const assert = require("assert");
const { normalizeStoreUrl, classifyTopUpCompetitorResult, isTemporaryScrapeError } = require("../lib/google/google-search");
const { parseRobloxProduct, parseDiamondProduct } = require("../lib/matcher/product-matcher");
const { validateScrapeResults } = require("../lib/validation/validate-results");

console.log("--------------------------------------------------");
console.log("TEST SUITE: NORMALISASI SISTEM & PRODUCT MATCHER");
console.log("--------------------------------------------------");

let testsPassed = 0;
let testsFailed = 0;

/**
 * Runner pengujian sederhana:
 * Menjalankan fungsi pengujian, mencatat status [PASS] atau [FAIL],
 * dan menghitung total pengujian yang berhasil atau gagal.
 */
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

// =============================================================================
// 1. NORMALISASI URL TOKO KE KATALOG RESMI
// =============================================================================
// Penjelasan:
// Di hasil pencarian Google, link toko sering kali merujuk ke halaman varian
// (misal server luar negeri atau halaman checkout alternatif). Fungsi normalizeStoreUrl
// bertugas mengarahkan scraper ke halaman katalog utama agar daftar harga lengkap.

test("Normalisasi URL: mengalihkan URL varian server ke katalog utama", () => {
  const input = "https://casatopup.com/id/beli/mobile-legends-global";
  const normalized = normalizeStoreUrl(input, { id: "mobile-legends" });
  assert.strictEqual(normalized.href, "https://casatopup.com/id/beli/mobile-legends");
});

test("Normalisasi URL: URL katalog resmi tidak mengalami perubahan", () => {
  const input = "https://casatopup.com/id/beli/mobile-legends";
  const normalized = normalizeStoreUrl(input, { id: "mobile-legends" });
  assert.strictEqual(normalized.href, "https://casatopup.com/id/beli/mobile-legends");
});

test("Normalisasi URL: mengarahkan rute varian produk ke form katalog utama", () => {
  const input = "https://golrox.com/beli-robux";
  const normalized = normalizeStoreUrl(input, { id: "roblox" });
  assert.strictEqual(normalized.href, "https://golrox.com/beli-robux/username");
});

// =============================================================================
// 2. PENYARINGAN DOMAIN BUKAN TOKO (BLACKLIST)
// =============================================================================
// Penjelasan:
// Hasil pencarian Google kadang menampilkan link bio atau agregator non-toko
// (misalnya lynk.id atau linktr.ee). Scraper harus langsung menolaknya sebelum dibuka.

test("Filter Domain: menolak domain link bio (lynk.id)", () => {
  const result = {
    link: "https://lynk.id/topuprobux",
    title: "Beli Robux Murah",
  };
  const decision = classifyTopUpCompetitorResult(result, { id: "roblox", name: "Roblox" });
  assert.strictEqual(decision.eligible, false);
  assert.strictEqual(decision.reason, "non_store_domain");
});

test("Filter Domain: menolak domain agregator (linktr.ee)", () => {
  const result = {
    link: "https://linktr.ee/topupgame",
    title: "Top Up Game",
  };
  const decision = classifyTopUpCompetitorResult(result, { id: "roblox", name: "Roblox" });
  assert.strictEqual(decision.eligible, false);
  assert.strictEqual(decision.reason, "non_store_domain");
});

// =============================================================================
// 3. DETEKSI & PENOLAKAN ARTIKEL BLOG / BERITA (HEURISTIC)
// =============================================================================
// Penjelasan:
// Google sering memunculkan portal berita atau artikel tips/panduan.
// Pengujian ini memastikan scraper tidak membuang waktu membuka artikel berita.

test("Filter Artikel: menolak URL dengan struktur rute berita (/read/)", () => {
  const result = {
    link: "https://beritagame.com/read/84920/top-up-free-fire-promo",
    title: "Top Up Free Fire Promo",
  };
  const decision = classifyTopUpCompetitorResult(result, { id: "free-fire", name: "Free Fire" });
  assert.strictEqual(decision.eligible, false);
  assert.strictEqual(decision.reason, "editorial_page");
});

test("Filter Artikel: menolak URL dengan pola arsip tanggal (/2024/05/)", () => {
  const result = {
    link: "https://bloggame.id/2024/05/top-up-roblox-termurah",
    title: "Beli Robux Murah",
  };
  const decision = classifyTopUpCompetitorResult(result, { id: "roblox", name: "Roblox" });
  assert.strictEqual(decision.eligible, false);
  assert.strictEqual(decision.reason, "editorial_page");
});

test("Filter Artikel: menolak judul yang terindikasi artikel panduan atau rekomendasi", () => {
  const result = {
    link: "https://portalgame.id/top-up-ml",
    title: "Inilah Rekomendasi Tempat Top Up Diamond MLBB Termurah",
  };
  const decision = classifyTopUpCompetitorResult(result, { id: "mobile-legends", name: "Mobile Legends" });
  assert.strictEqual(decision.eligible, false);
  assert.strictEqual(decision.reason, "editorial_page");
});

// =============================================================================
// 4. PENCOCOKAN PRODUK ROBLOX (PRODUCT MATCHER)
// =============================================================================
// Penjelasan:
// Memastikan varian produk Roblox (Robux angka murni, Gift Card IDR, dan Gift Card asing)
// dikelompokkan ke kategori yang benar dan tidak saling tertukar.

test("Matcher Roblox: Roblox Gift Card IDR masuk ke kategori roblox-idr-card", () => {
  const product = parseRobloxProduct("Roblox Gift Card IDR 50.000");
  assert.strictEqual(product.category, "roblox-idr-card");
  assert.strictEqual(product.key, "Roblox IDR 50000");
});

test("Matcher Roblox: penulisan ringkas '50K' dinormalisasi ke nominal penuh", () => {
  const product = parseRobloxProduct("Roblox Gift Card IDR 50K");
  assert.strictEqual(product.category, "roblox-idr-card");
  assert.strictEqual(product.key, "Roblox IDR 50000");
});

test("Matcher Roblox: mata uang asing (SAR / USD) dipisahkan dari IDR", () => {
  const product = parseRobloxProduct("Roblox Gift Card 50 SAR");
  assert.strictEqual(product.category, "roblox-sar-card");
  assert.strictEqual(product.key, "Roblox SAR 50");
});

test("Matcher Roblox: teks '800 Robux' dikelompokkan ke kategori robux", () => {
  const product = parseRobloxProduct("800 Robux");
  assert.strictEqual(product.category, "robux");
  assert.strictEqual(product.key, "800 Robux");
});

test("Matcher Roblox: nominal angka murni '800' otomatis dikenali sebagai 800 Robux", () => {
  const product = parseRobloxProduct("800");
  assert.strictEqual(product.category, "robux");
  assert.strictEqual(product.key, "800 Robux");
});

test("Matcher Roblox: format singkatan '500 RBX' cocok ke '500 Robux'", () => {
  const product = parseRobloxProduct("500 RBX");
  assert.strictEqual(product.category, "robux");
  assert.strictEqual(product.key, "500 Robux");
  assert.strictEqual(product.quantity, 500);
});

test("Matcher Roblox: format prefix 'RBX 2000' cocok ke '2000 Robux'", () => {
  const product = parseRobloxProduct("RBX 2000");
  assert.strictEqual(product.category, "robux");
  assert.strictEqual(product.key, "2000 Robux");
  assert.strictEqual(product.quantity, 2000);
});

test("Validator Roblox: produk dengan format RBX (Lootbar) diakui sebagai data valid", () => {
  const rows = [
    { Produk: "500 RBX", Harga: "Rp 80.309" },
    { Produk: "1000 RBX", Harga: "Rp 160.618" },
    { Produk: "RBX 2000", Harga: "Rp 321.236" },
    { Produk: "4500 RBX", Harga: "Rp 803.090" },
  ];
  const validation = validateScrapeResults("https://www.lootbar.com/id/top-up/roblox-robux", rows, "roblox");
  assert.strictEqual(validation.valid, true);
  assert.strictEqual(validation.status, "VALID");
});

// =============================================================================
// 5. PENCOCOKAN PRODUK DIAMOND (MLBB & FREE FIRE)
// =============================================================================
// Penjelasan:
// Memastikan produk diamond reguler dipisahkan dari promo bonus pembelian pertama (First Top-up)
// agar perbandingan harga tetap adil dan setara (apple-to-apple).

test("Matcher Diamond: promo pembelian pertama diberi penanda (First Top-up)", () => {
  const product = parseDiamondProduct("1000 Diamonds First Top-up");
  assert.strictEqual(product.category, "diamond-first-topup");
  assert.strictEqual(product.key, "1000 Diamonds (First Top-up)");
  assert.strictEqual(product.quantity, 1000);
});

test("Matcher Diamond: teks bahasa Indonesia 'Pembelian Pertama' dikenali sebagai First Top-up", () => {
  const product = parseDiamondProduct("1000 Diamonds Pembelian Pertama");
  assert.strictEqual(product.category, "diamond-first-topup");
  assert.strictEqual(product.key, "1000 Diamonds (First Top-up)");
  assert.strictEqual(product.quantity, 1000);
});

test("Matcher Diamond: paket diamond reguler tidak diberi label First Top-up", () => {
  const product = parseDiamondProduct("1000 Diamonds");
  assert.strictEqual(product.category, "diamond");
  assert.strictEqual(product.key, "1000 Diamonds");
  assert.strictEqual(product.quantity, 1000);
});

// =============================================================================
// 6. KLASIFIKASI ERROR SCRAPER (RETRY POLICY)
// =============================================================================
// Penjelasan:
// Scraper harus membedakan error sementara yang layak di-retry (seperti koneksi lambat/timeout)
// dengan error permanen (seperti HTTP 403, toko maintenance, atau proxy gagal) agar hemat waktu.

test("Kebijakan Error: status maintenance toko langsung dilewati (non-retryable)", () => {
  const err = new Error("[Maintenance] Toko sedang pemeliharaan sistem");
  err.retryable = false;
  err.isMaintenance = true;
  assert.strictEqual(isTemporaryScrapeError(err), false);
});

test("Kebijakan Error: blokir akses HTTP 403 langsung dilewati (non-retryable)", () => {
  const err = new Error("[Blokir] Akses terblokir (HTTP 403)");
  err.retryable = false;
  assert.strictEqual(isTemporaryScrapeError(err), false);
});

test("Kebijakan Error: kegagalan proxy ditandai non-retryable", () => {
  const err = new Error("[Proxy Error] Kuota proxy habis");
  err.proxyFailed = true;
  assert.strictEqual(isTemporaryScrapeError(err), false);
});

test("Kebijakan Error: gangguan timeout koneksi tetap dicoba ulang (retryable)", () => {
  const err = new Error("Koneksi ke situs timeout (ERR_TIMED_OUT)");
  assert.strictEqual(isTemporaryScrapeError(err), true);
});

// =============================================================================
// RINGKASAN AKHIR
// =============================================================================
console.log("--------------------------------------------------");
console.log(`HASIL: ${testsPassed} Lolos, ${testsFailed} Gagal`);
console.log("--------------------------------------------------");

if (testsFailed > 0) {
  process.exit(1);
}
