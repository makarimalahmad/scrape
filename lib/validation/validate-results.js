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

// Validasi data hasil scraping dengan syarat mutlak yang ramah pemula
function validateScrapeResults(url, rows, game = null) {
  const hostname = normalizeHostname(url);
  const knownDomain = isKnownDomain(hostname);
  const reasons = [];

  // 1. Cek apakah ada data yang berhasil diekstrak
  if (!Array.isArray(rows) || rows.length === 0) {
    return {
      valid: false,
      status: "DATA_KOSONG",
      hostname,
      knownDomain,
      confidence: 0,
      reasons: ["Data harga tidak ditemukan pada halaman ini"],
      validCount: 0,
    };
  }

  // 2. Kumpulkan produk yang memenuhi syarat sah:
  //    - Format harga berupa Rupiah valid (>= Rp 500)
  //    - Nama produk memuat kata kunci game yang sesuai
  //    - Bukan teks sampah (bukan metode bayar QRIS/DANA/promo)
  const validProducts = [];
  const seen = new Set();

  for (const row of rows) {
    const isHargaValid = isValidPrice(row.Harga, game);
    const isNamaValid = isProductRelevantForGame(row.Produk, game);
    const isBukanSampah = !isNoiseProduct(row.Produk);

    if (isHargaValid && isNamaValid && isBukanSampah) {
      const key = `${String(row.Produk).toLowerCase()}|${String(row.Harga).toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        validProducts.push(row);
      }
    }
  }

  // 3. Syarat jumlah produk: toko resmi minimal 2 produk, toko baru minimal 3 produk
  const minRequired = knownDomain ? 2 : 3;
  if (validProducts.length < minRequired) {
    reasons.push(`produk valid kurang dari ${minRequired} (hanya ditemukan ${validProducts.length})`);
  }

  const isValid = reasons.length === 0;
  const status = isValid
    ? "VALID"
    : (knownDomain ? "DATA_TIDAK_VALID" : "SITUS_BELUM_DIDUKUNG");

  return {
    valid: isValid,
    status,
    hostname,
    knownDomain,
    confidence: isValid ? 100 : 0,
    reasons,
    validCount: validProducts.length,
    validProducts,
  };
}

module.exports = {
  isKnownDomain,
  isNoiseProduct,
  isProductRelevantForGame,
  isRelevantProduct,
  isValidPrice,
  validateScrapeResults,
};
