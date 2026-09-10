const assert = require("assert");
const {
  applyTaxCalculation,
  selectCheapestProducts,
  extractDomain,
} = require("../lib/matcher/product-matcher");

console.log("==================================================");
console.log("🧪 MENJALANKAN TEST SUITE: DICTIONARY PPN / TAX");
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
// 1. Uji Multiplier Datar (Flat Multiplier)
// -------------------------------------------------------------
test("Multiplikasi flat 11% (1.11) pada domain yang cocok", () => {
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

test("Toko yang tidak terdaftar di dictionary tidak terkena PPN (harga asli)", () => {
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

// -------------------------------------------------------------
// 2. Uji Nested Sub-Dictionary per Game (Kasus Codashop)
// -------------------------------------------------------------
test("Nested Sub-Dictionary: Codashop 11% untuk MLBB", () => {
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

test("Nested Sub-Dictionary: Codashop 11% untuk Free Fire", () => {
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

test("Nested Sub-Dictionary: Codashop 0% (tidak kena PPN) untuk Roblox jika tidak didefinisikan", () => {
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
  assert.strictEqual(result, 65000, "Harga Roblox harus tetap harga asli (tidak terkena PPN)");
});

// -------------------------------------------------------------
// 3. Uji Normalisasi Nama Game (Spasi vs Dash vs Singkatan)
// -------------------------------------------------------------
test("Normalisasi Game: 'Mobile Legends' cocok dengan rule 'mobile-legends'", () => {
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

test("Normalisasi Game: 'mlbb' cocok dengan rule 'mobile-legends'", () => {
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

test("Normalisasi Game: 'Free Fire' cocok dengan rule 'free-fire'", () => {
  const taxDict = {
    "codashop.com": {
      "free-fire": 1.11,
    },
  };
  const payload = {
    rawPrice: 10000,
    domain: "codashop.com",
    game: "Free Fire",
  };
  const result = applyTaxCalculation(taxDict, payload);
  assert.strictEqual(result, 11100);
});

// -------------------------------------------------------------
// 4. Uji Sub-Dictionary dengan Default Fallback
// -------------------------------------------------------------
test("Sub-Dictionary: fallback ke 'default' jika game spesifik tidak ditemukan", () => {
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

// -------------------------------------------------------------
// 5. Uji Variasi Domain & URL (dengan/tanpa www.)
// -------------------------------------------------------------
test("Domain Matching: dictionary 'codashop.com' mencakup hostname 'www.codashop.com'", () => {
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

test("Domain Matching: dictionary 'www.codashop.com' mencakup domain 'codashop.com'", () => {
  const taxDict = {
    "www.codashop.com": 1.11,
  };
  const payload = {
    rawPrice: 10000,
    domain: "codashop.com",
    hostname: "codashop.com",
    game: "mobile-legends",
  };
  const result = applyTaxCalculation(taxDict, payload);
  assert.strictEqual(result, 11100);
});

// -------------------------------------------------------------
// 6. Uji Integrasi dengan selectCheapestProducts
// -------------------------------------------------------------
test("Integrasi selectCheapestProducts: harga hasil scrape otomatis disesuaikan PPN", () => {
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

  // Scrape untuk MLBB
  const mlbbProducts = selectCheapestProducts(rawRows, "mobile-legends", {
    hostname: "www.codashop.com",
    url: "https://www.codashop.com/id-id/mobile-legends",
    calculateTax: taxDict,
  });

  const p86 = Array.from(mlbbProducts.values()).find((p) => p.quantity === 86);
  assert.ok(p86, "Produk 86 Diamonds harus ditemukan");
  assert.strictEqual(p86.price, 22200, "20.000 * 1.11 harus menjadi 22.200");

  // Scrape produk yang sama untuk Roblox (tidak kena PPN)
  const robloxRows = [
    { Produk: "800 Robux", Harga: "Rp 150.000" },
  ];
  const robloxProducts = selectCheapestProducts(robloxRows, "roblox", {
    hostname: "www.codashop.com",
    url: "https://www.codashop.com/id-id/roblox",
    calculateTax: taxDict,
  });

  const r800 = Array.from(robloxProducts.values()).find((p) => p.quantity === 800);
  assert.ok(r800, "Produk 800 Robux harus ditemukan");
  assert.strictEqual(r800.price, 150000, "Roblox tidak ada di rule Codashop, jadi harga harus tetap 150.000");
});

// -------------------------------------------------------------
// 7. Uji Edge Cases & Ketahanan Terhadap Error
// -------------------------------------------------------------
test("Edge Case: calculateTax bernilai null / undefined / kosong mengembalikan harga asli", () => {
  const payload = { rawPrice: 15000, domain: "codashop.com", game: "mobile-legends" };
  assert.strictEqual(applyTaxCalculation(null, payload), 15000);
  assert.strictEqual(applyTaxCalculation(undefined, payload), 15000);
  assert.strictEqual(applyTaxCalculation({}, payload), 15000);
});

test("Edge Case: nilai invalid / NaN / negatif ditolak secara aman", () => {
  const taxDict = {
    "error-store.com": NaN,
    "negative-store.com": -0.5,
  };
  const r1 = applyTaxCalculation(taxDict, { rawPrice: 10000, domain: "error-store.com" });
  const r2 = applyTaxCalculation(taxDict, { rawPrice: 10000, domain: "negative-store.com" });
  assert.strictEqual(r1, 10000, "NaN harus mengembalikan harga asli");
  assert.strictEqual(r2, 10000, "Angka negatif harus mengembalikan harga asli");
});

console.log("==================================================");
console.log(`HASIL: ${testsPassed} Berhasil, ${testsFailed} Gagal`);
console.log("==================================================");

if (testsFailed > 0) {
  process.exit(1);
}
