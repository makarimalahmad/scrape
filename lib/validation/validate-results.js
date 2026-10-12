const KNOWN_DOMAINS = [
  "bangjeff.com",
  "blibli.com",
  "casatopup.com",
  "codashop.com",
  "dana.id",
  "ditusi.co.id",
  "duniagames.co.id",
  "funnerlife.id",
  "gogogo.com",
  "gogogo.id",
  "golrox.com",
  "gopay.co.id",
  "hiddengame.id",
  "itemku.com",
  "kiosgamer.co.id",
  "lapakgaming.com",
  "lootbar.com",
  "mobapay.com",
  "ourastore.com",
  "roblox.com",
  "shopee.co.id",
  "tokopedia.com",
  "topup.ebelanja.id",
  "topup.ggwp.id",
  "topupgim.com",
  "topupnolimit.com",
  "unipin.com",
  "upoint.id",
  "vcgamers.com",
  "vexagame.com",
  "vocagame.com",
  "vygaming.id",
];

const PRODUCT_PATTERN =
  /(?:diamond|\bdm\b|berlian|pass|booyah|evo\s*vault|pack|bundle|membership|member|card|voucher|robux|\brbx\b|\brblx\b|r\$|roblox|\buc\b|point|token|crystal|gold|coin|credit|starlight|twilight|weekly|monthly|top\s*up)/i;

const NUMERIC_PACKAGE_PATTERN = /^\d[\d.,]*(?:\s*\+\s*\d[\d.,]*)?$/;

const NOISE_PATTERN =
  /^(?:subtotal|total harga|kamu hemat|tabungan|\d+%\s*off|berlaku untuk pesanan|instan|menit kirim|waktu kirim|ulasan|rating|terjual|stok|biaya|pajak|discount|diskon|copyright|all rights reserved|pilih denom|dana|gopay|ovo|linkaja|shopeepay|astrapay|qris|iqiyi|wetv|vidio|viu|netflix|spotify)/i;

const PRICE_PATTERN =
  /^(?:(?:Rp\.?|IDR|USD|US\$|\$|RM)\s*)?\d[\d.,]*$/i;

function normalizeHostname(url) {
  return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
}

// Periksa apakah domain termasuk dalam daftar toko resmi yang didukung
function isKnownDomain(hostname) {
  for (const domain of KNOWN_DOMAINS) {
    if (hostname === domain || hostname.endsWith(`.${domain}`)) {
      return true;
    }
  }
  return false;
}

// Validasi format harga apakah berupa angka positif yang wajar
function isValidPrice(value, game = null) {
  const price = String(value || "").replace(/\s+/g, " ").trim();
  if (!PRICE_PATTERN.test(price)) return false;
  if (game && ["mobile-legends", "free-fire"].includes(game)) {
    if (/US\$|USD|\$|EUR|€|GBP|£|TRY|TL|RM|SGD/i.test(price)) return false;
  }
  const digits = price.replace(/[^\d]/g, "");
  const num = digits.length > 0 ? Number(digits) : 0;
  if (num <= 0) return false;
  if (game && ["mobile-legends", "free-fire"].includes(game) && num < 500) return false;
  return true;
}

// Periksa apakah teks produk relevan secara umum
function isRelevantProduct(value) {
  const product = String(value || "").replace(/\s+/g, " ").trim();
  return PRODUCT_PATTERN.test(product) || NUMERIC_PACKAGE_PATTERN.test(product);
}

// Periksa apakah produk sesuai dengan game yang sedang discrape
function isProductRelevantForGame(value, game) {
  const product = String(value || "").replace(/\s+/g, " ").trim();
  if (!game) return isRelevantProduct(product);
  if (/^(?:[5-9]|\d{2,})[\d.,]*(?:\s*\+\s*\d[\d.,]*)?$/.test(product)) return true;
  if (game === "roblox") return /robux|\brbx\b|\brblx\b|r\$|roblox|gift\s*card|\bidr\b|\busd\b/i.test(product);
  return /diamond|\bdm\b|berlian|pass|booyah|evo\s*vault|pack|bundle|membership|member|starlight|twilight|weekly|monthly/i.test(
    product,
  );
}

// Periksa apakah baris berisi teks sampah (noise) seperti metode pembayaran atau tombol umum
function isNoiseProduct(value) {
  const product = String(value || "").replace(/\s+/g, " ").trim();
  return NOISE_PATTERN.test(product);
}

// Hitung rasio pecahan terhadap total baris
function ratio(part, total) {
  return total === 0 ? 0 : part / total;
}

// Hitung statistik kualitas data hasil scraping dalam satu kali perulangan
function calculateStats(rows, game = null) {
  const totalRows = rows.length;
  let validPriceCount = 0;
  let relevantProductCount = 0;
  let noiseCount = 0;
  const seenKeys = new Set();

  for (const row of rows) {
    if (isValidPrice(row.Harga, game)) {
      validPriceCount += 1;
    }
    if (isProductRelevantForGame(row.Produk, game)) {
      relevantProductCount += 1;
    }
    if (isNoiseProduct(row.Produk)) {
      noiseCount += 1;
    }
    const key = `${String(row.Produk).toLowerCase()}|${String(row.Harga).toLowerCase()}`;
    seenKeys.add(key);
  }

  const uniqueCount = seenKeys.size;

  return {
    totalRows,
    validPriceRatio: ratio(validPriceCount, totalRows),
    relevantProductRatio: ratio(relevantProductCount, totalRows),
    noiseRatio: ratio(noiseCount, totalRows),
    uniqueRatio: ratio(uniqueCount, totalRows),
  };
}

// Hitung skor kepercayaan (confidence) dari metrik statistik
function calculateConfidence(stats) {
  let score = 0;

  if (stats.totalRows >= 10) score += 25;
  else if (stats.totalRows >= 4) score += 20;
  else if (stats.totalRows >= 2) score += 10;

  score += stats.validPriceRatio * 25;
  score += stats.relevantProductRatio * 30;
  score += (1 - stats.noiseRatio) * 10;
  score += stats.uniqueRatio * 10;

  return Math.round(score);
}

// Validasi ambang batas untuk toko yang sudah dikenal (known domain)
function validateKnownDomain(stats, confidence) {
  const reasons = [];

  if (stats.totalRows < 2) reasons.push("produk valid kurang dari 2");
  if (stats.validPriceRatio < 0.8) reasons.push("banyak harga tidak valid");
  if (stats.relevantProductRatio < 0.5) {
    reasons.push("nama produk tidak cukup relevan");
  }
  if (stats.noiseRatio > 0.4) reasons.push("terlalu banyak teks non-produk");
  if (stats.uniqueRatio < 0.7) reasons.push("terlalu banyak data duplikat");
  if (confidence < 55) reasons.push("confidence di bawah 55");

  return reasons;
}

// Validasi ambang batas yang lebih ketat untuk domain baru/asing
function validateUnknownDomain(stats, confidence) {
  const reasons = [];

  if (stats.totalRows < 4) reasons.push("produk valid kurang dari 4");
  if (stats.validPriceRatio < 0.9) reasons.push("banyak harga tidak valid");
  if (stats.relevantProductRatio < 0.6) {
    reasons.push("nama produk tidak cukup relevan");
  }
  if (stats.noiseRatio > 0.2) reasons.push("terlalu banyak teks non-produk");
  if (stats.uniqueRatio < 0.8) reasons.push("terlalu banyak data duplikat");
  if (confidence < 75) reasons.push("confidence di bawah 75");

  return reasons;
}

// Validasi keseluruhan hasil scrape dan tentukan status kelolosan data
function validateScrapeResults(url, rows, game = null) {
  const hostname = normalizeHostname(url);
  const knownDomain = isKnownDomain(hostname);
  const stats = calculateStats(rows, game);
  const confidence = calculateConfidence(stats);

  let reasons = [];
  if (knownDomain) {
    reasons = validateKnownDomain(stats, confidence);
  } else {
    reasons = validateUnknownDomain(stats, confidence);
  }

  let status = "VALID";
  if (reasons.length > 0) {
    if (knownDomain) {
      status = "DATA_TIDAK_VALID";
    } else {
      status = "SITUS_BELUM_DIDUKUNG";
    }
  }

  return {
    valid: reasons.length === 0,
    status,
    hostname,
    knownDomain,
    confidence,
    reasons,
    stats,
  };
}

module.exports = {
  calculateStats,
  isKnownDomain,
  isNoiseProduct,
  isProductRelevantForGame,
  isRelevantProduct,
  isValidPrice,
  validateScrapeResults,
};
