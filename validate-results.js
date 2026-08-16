const KNOWN_DOMAINS = [
  "bangjeff.com",
  "codashop.com",
  "dana.id",
  "duniagames.co.id",
  "gogogo.id",
  "gopay.co.id",
  "itemku.com",
  "kiosgamer.co.id",
  "lootbar.com",
  "mobapay.com",
  "ourastore.com",
  "roblox.com",
  "shopee.co.id",
  "topup.ebelanja.id",
  "topup.ggwp.id",
  "topupgim.com",
  "unipin.com",
  "upoint.id",
  "vygaming.id",
];

const PRODUCT_PATTERN =
  /(?:diamond|\bdm\b|pass|pack|bundle|membership|member|card|voucher|robux|roblox|\buc\b|point|token|crystal|gold|coin|credit|starlight|twilight|weekly|monthly|top\s*up)/i;

const NUMERIC_PACKAGE_PATTERN = /^\d[\d.,]*(?:\s*\+\s*\d[\d.,]*)?$/;

const NOISE_PATTERN =
  /^(?:subtotal|total harga|kamu hemat|tabungan|\d+%\s*off|berlaku untuk pesanan|instan|menit kirim|waktu kirim|ulasan|rating|terjual|stok|biaya|pajak|discount|diskon|copyright|all rights reserved|pilih denom)/i;

const PRICE_PATTERN =
  /^(?:(?:Rp\.?|IDR|USD|US\$|\$|RM)\s*)?\d[\d.,]*$/i;

function normalizeHostname(url) {
  return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
}

function isKnownDomain(hostname) {
  return KNOWN_DOMAINS.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
  );
}

function isValidPrice(value) {
  const price = String(value || "").replace(/\s+/g, " ").trim();
  if (!PRICE_PATTERN.test(price)) return false;
  const digits = price.replace(/[^\d]/g, "");
  return digits.length > 0 && Number(digits) > 0;
}

function isRelevantProduct(value) {
  const product = String(value || "").replace(/\s+/g, " ").trim();
  return PRODUCT_PATTERN.test(product) || NUMERIC_PACKAGE_PATTERN.test(product);
}

function isProductRelevantForGame(value, game) {
  const product = String(value || "").replace(/\s+/g, " ").trim();
  if (!game) return isRelevantProduct(product);
  if (game === "roblox") return /robux|roblox|gift\s*card|\bidr\b|\busd\b/i.test(product);
  return /diamond|\bdm\b|pass|pack|bundle|membership|member|starlight|twilight|weekly|monthly/i.test(
    product,
  );
}

function isNoiseProduct(value) {
  const product = String(value || "").replace(/\s+/g, " ").trim();
  return NOISE_PATTERN.test(product);
}

function ratio(part, total) {
  return total === 0 ? 0 : part / total;
}

function calculateStats(rows, game = null) {
  const totalRows = rows.length;
  const validPriceCount = rows.filter((row) => isValidPrice(row.Harga)).length;
  const relevantProductCount = rows.filter((row) =>
    isProductRelevantForGame(row.Produk, game),
  ).length;
  const noiseCount = rows.filter((row) => isNoiseProduct(row.Produk)).length;
  const uniqueCount = new Set(
    rows.map(
      (row) =>
        `${String(row.Produk).toLowerCase()}|${String(row.Harga).toLowerCase()}`,
    ),
  ).size;

  return {
    totalRows,
    validPriceRatio: ratio(validPriceCount, totalRows),
    relevantProductRatio: ratio(relevantProductCount, totalRows),
    noiseRatio: ratio(noiseCount, totalRows),
    uniqueRatio: ratio(uniqueCount, totalRows),
  };
}

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

function validateScrapeResults(url, rows, game = null) {
  const hostname = normalizeHostname(url);
  const knownDomain = isKnownDomain(hostname);
  const stats = calculateStats(rows, game);
  const confidence = calculateConfidence(stats);
  const reasons = knownDomain
    ? validateKnownDomain(stats, confidence)
    : validateUnknownDomain(stats, confidence);

  return {
    valid: reasons.length === 0,
    status:
      reasons.length === 0
        ? "VALID"
        : knownDomain
          ? "DATA_TIDAK_VALID"
          : "SITUS_BELUM_DIDUKUNG",
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
