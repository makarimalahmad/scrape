const assert = require("assert");
const {
  applyTaxCalculation,
  selectCheapestProducts,
} = require("../lib/matcher/product-matcher");

console.log("--------------------------------------------------");
console.log("TEST SUITE: DICTIONARY PPN & PENYESUAIAN HARGA");
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
// 1. PENYESUAIAN PERSENTASE FLAT (FLAT MULTIPLIER)
// =============================================================================
// Penjelasan:
// Memastikan persentase penyesuaian (misal PPN 11% atau faktor pengali 1.11)
// ditambahkan dengan tepat pada harga toko yang terdaftar.

test("Penyesuaian Flat: perkalian 11% (1.11) pada domain yang cocok", () => {
  const taxDict = {
    "lapakgaming.com": 1.11,
  };
  const payload = {
    rawPrice: 100000,
    domain: "lapakgaming.com",
    game: "mobile-legends",
  };
  const result = applyTaxCalculation(taxDict, payload);
  assert.strictEqual(result, 111000);
});

test("Penyesuaian Flat: toko yang tidak terdaftar tetap menggunakan harga asli", () => {
  const taxDict = {
    "lapakgaming.com": 1.11,
  };
  const payload = {
    rawPrice: 50000,
    domain: "upoint.id",
    game: "mobile-legends",
  };
  const result = applyTaxCalculation(taxDict, payload);
  assert.strictEqual(result, 50000);
});

// =============================================================================
// 2. PENYESUAIAN KHUSUS PER GAME (NESTED SUB-DICTIONARY)
// =============================================================================
// Penjelasan:
// Satu domain toko bisa memiliki aturan pajak/biaya yang berbeda untuk setiap game.
// Contoh: Mobile Legends dikenakan 11%, tetapi Roblox tidak dikenakan penyesuaian.

test("Sub-Dictionary Game: penyesuaian 11% khusus Mobile Legends", () => {
  const taxDict = {
    "codashop.com": {
      "mobile-legends": 1.11,
      "free-fire": 1.11,
    },
  };
  const payload = {
    rawPrice: 20000,
    domain: "codashop.com",
    game: "mobile-legends",
  };
  const result = applyTaxCalculation(taxDict, payload);
  assert.strictEqual(result, 22200);
});

test("Sub-Dictionary Game: penyesuaian 11% khusus Free Fire", () => {
  const taxDict = {
    "codashop.com": {
      "mobile-legends": 1.11,
      "free-fire": 1.11,
    },
  };
  const payload = {
    rawPrice: 50000,
    domain: "codashop.com",
    game: "free-fire",
  };
  const result = applyTaxCalculation(taxDict, payload);
  assert.strictEqual(result, 55500);
});

test("Sub-Dictionary Game: game yang tidak terdaftar di rule tetap harga asli (0%)", () => {
  const taxDict = {
    "codashop.com": {
      "mobile-legends": 1.11,
      "free-fire": 1.11,
    },
  };
  const payload = {
    rawPrice: 65000,
    domain: "codashop.com",
    game: "roblox",
  };
  const result = applyTaxCalculation(taxDict, payload);
  assert.strictEqual(result, 65000, "Harga Roblox harus tetap harga asli");
});

// =============================================================================
// 3. NORMALISASI FORMAT NAMA GAME
// =============================================================================
// Penjelasan:
// Memastikan penulisan nama game fleksibel (huruf besar/kecil, spasi, atau singkatan)
// tetap cocok dengan aturan di dictionary.

test("Normalisasi Game: nama dengan spasi 'Mobile Legends' cocok ke 'mobile-legends'", () => {
  const taxDict = {
    "codashop.com": {
      "mobile-legends": 1.11,
    },
  };
  const payload = {
    rawPrice: 10000,
    domain: "codashop.com",
    game: "Mobile Legends",
  };
  const result = applyTaxCalculation(taxDict, payload);
  assert.strictEqual(result, 11100);
});

test("Normalisasi Game: singkatan populer 'mlbb' cocok ke 'mobile-legends'", () => {
  const taxDict = {
    "codashop.com": {
      "mobile-legends": 1.11,
    },
  };
  const payload = {
    rawPrice: 10000,
    domain: "codashop.com",
    game: "mlbb",
  };
  const result = applyTaxCalculation(taxDict, payload);
  assert.strictEqual(result, 11100);
});

// =============================================================================
// 4. ATURAN PENGGANTI OTOMATIS (DEFAULT FALLBACK)
// =============================================================================
// Penjelasan:
// Jika sub-dictionary menyediakan opsi 'default', game yang tidak disebutkan
// secara spesifik akan menggunakan nilai default tersebut.

test("Fallback Default: menggunakan nilai 'default' jika game spesifik tidak terdaftar", () => {
  const taxDict = {
    "itemku.com": {
      "roblox": 1.05,
      "default": 1.11,
    },
  };
  const mlbbResult = applyTaxCalculation(taxDict, {
    rawPrice: 10000,
    domain: "itemku.com",
    game: "mobile-legends",
  });
  const robloxResult = applyTaxCalculation(taxDict, {
    rawPrice: 10000,
    domain: "itemku.com",
    game: "roblox",
  });
  assert.strictEqual(mlbbResult, 11100, "MLBB harus menggunakan nilai default 1.11");
  assert.strictEqual(robloxResult, 10500, "Roblox harus menggunakan nilai spesifik 1.05");
});

// =============================================================================
// 5. PENCOCOKAN DOMAIN (DENGAN / TANPA AWALAN WWW.)
// =============================================================================
// Penjelasan:
// Memastikan pencocokan domain tidak sensitif terhadap ada tidaknya awalan 'www.'.

test("Domain Matching: dictionary 'codashop.com' mengenali hostname 'www.codashop.com'", () => {
  const taxDict = {
    "codashop.com": 1.11,
  };
  const payload = {
    rawPrice: 10000,
    hostname: "www.codashop.com",
    domain: "codashop.com",
    game: "mobile-legends",
  };
  const result = applyTaxCalculation(taxDict, payload);
  assert.strictEqual(result, 11100);
});

// =============================================================================
// 6. INTEGRASI DENGAN PEMILIH PRODUK TERMURAH (selectCheapestProducts)
// =============================================================================
// Penjelasan:
// Memastikan bahwa kalkulasi pajak otomatis diterapkan pada daftar produk
// sebelum produk termurah dipilih dan dimasukkan ke laporan akhir.

test("Integrasi Matcher: harga hasil scrape otomatis disesuaikan nilai PPN", () => {
  const rawRows = [
    { Produk: "86 Diamonds", Harga: "Rp 20.000" },
    { Produk: "172 Diamonds", Harga: "Rp 40.000" },
  ];

  const taxDict = {
    "codashop.com": {
      "mobile-legends": 1.11,
      "free-fire": 1.11,
    },
  };

  const mlbbProducts = selectCheapestProducts(rawRows, "mobile-legends", {
    hostname: "www.codashop.com",
    url: "https://www.codashop.com/id-id/mobile-legends",
    calculateTax: taxDict,
  });

  const p86 = Array.from(mlbbProducts.values()).find((p) => p.quantity === 86);
  assert.ok(p86, "Produk 86 Diamonds harus ditemukan");
  assert.strictEqual(p86.price, 22200, "20.000 * 1.11 harus menjadi 22.200");
});

// =============================================================================
// 7. FORMAT PENULISAN FLEKSIBEL (STRING %, ANGKA, STRING ANGKA)
// =============================================================================
// Penjelasan:
// Pengguna dapat menulis nilai pajak dalam berbagai format:
// - String persen: "11%", "0.7%", "11.777%"
// - Angka murni: 11, 0.7, 12.11
// - String angka: "11", "0.7", "12.11"
// Sistem harus membaca seluruh format tersebut secara konsisten.

test("Format String Persen: '11%' menghasilkan penambahan biaya 11%", () => {
  const taxDict = { "unipin.com": "11%" };
  const payload = { rawPrice: 100000, domain: "unipin.com", game: "mobile-legends" };
  const result = applyTaxCalculation(taxDict, payload);
  assert.strictEqual(result, 111000);
});

test("Format String Persen: '0.7%' menghasilkan penambahan biaya QRIS 0.7%", () => {
  const taxDict = { "itemku.com": "0.7%" };
  const payload = { rawPrice: 100000, domain: "itemku.com", game: "free-fire" };
  const result = applyTaxCalculation(taxDict, payload);
  assert.strictEqual(result, 100700);
});

test("Format Angka Murni: angka 11 otomatis dianggap 11%", () => {
  const taxDict = { "unipin.com": 11 };
  const payload = { rawPrice: 100000, domain: "unipin.com", game: "free-fire" };
  const result = applyTaxCalculation(taxDict, payload);
  assert.strictEqual(result, 111000);
});

test("Format Angka Murni: angka desimal 0.7 otomatis dianggap 0.7%", () => {
  const taxDict = { "itemku.com": 0.7 };
  const payload = { rawPrice: 100000, domain: "itemku.com", game: "free-fire" };
  const result = applyTaxCalculation(taxDict, payload);
  assert.strictEqual(result, 100700);
});

test("Format String Angka: string '12.11' otomatis dianggap 12.11%", () => {
  const taxDict = { "codashop.com": "12.11" };
  const payload = { rawPrice: 100000, domain: "codashop.com", game: "mobile-legends" };
  const result = applyTaxCalculation(taxDict, payload);
  assert.strictEqual(result, 112110);
});

// =============================================================================
// 8. KETAHANAN TERHADAP INPUT TIDAK VALID (FAIL-SAFE)
// =============================================================================
// Penjelasan:
// Jika konfigurasi bernilai null, string rusak, atau angka negatif, sistem
// tidak boleh crash, melainkan mengembalikan harga asli dengan aman.

test("Ketahanan Input: nilai null, undefined, atau objek kosong mengembalikan harga asli", () => {
  const payload = { rawPrice: 15000, domain: "codashop.com", game: "mobile-legends" };
  assert.strictEqual(applyTaxCalculation(null, payload), 15000);
  assert.strictEqual(applyTaxCalculation(undefined, payload), 15000);
  assert.strictEqual(applyTaxCalculation({}, payload), 15000);
});

test("Ketahanan Input: nilai tidak valid (NaN / angka negatif) mengembalikan harga asli", () => {
  const taxDict = {
    "bad-nan.com": NaN,
    "bad-neg.com": -0.5,
  };
  const r1 = applyTaxCalculation(taxDict, { rawPrice: 10000, domain: "bad-nan.com" });
  const r2 = applyTaxCalculation(taxDict, { rawPrice: 10000, domain: "bad-neg.com" });
  assert.strictEqual(r1, 10000);
  assert.strictEqual(r2, 10000);
});

test("Ketahanan Input: string persentase rusak ('abc%', '%') mengembalikan harga asli", () => {
  const taxDict = {
    "bad-str.com": "abc%",
    "empty-pct.com": "%",
  };
  assert.strictEqual(applyTaxCalculation(taxDict, { rawPrice: 10000, domain: "bad-str.com" }), 10000);
  assert.strictEqual(applyTaxCalculation(taxDict, { rawPrice: 10000, domain: "empty-pct.com" }), 10000);
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
