// CLI Compare URL: perbandingan harga langsung toko utama vs toko pembanding via URL
const path = require("path");
const readline = require("readline/promises");
const { DEFAULT_SELECTOR, scrape, validateUrl, exportCsv } = require("./scrape");
const { selectCheapestProducts, findMatches } = require("./lib/matcher/product-matcher");

// Membaca argumen baris perintah (CLI flag) seperti --main atau --output
function getFlagValue(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  if (value && !value.startsWith("--")) {
    return value;
  }
  return null;
}

// Mengambil daftar URL pembanding dari argumen --compare
function getCompareUrls() {
  const index = process.argv.indexOf("--compare");
  if (index < 0) return [];

  const daftarUrl = [];
  for (let i = index + 1; i < process.argv.length; i += 1) {
    const nilai = process.argv[i];
    if (nilai.startsWith("--")) break;
    daftarUrl.push(nilai);
  }
  return daftarUrl;
}

// Mengambil nama domain toko dari URL
function getStore(url) {
  return new URL(url).hostname.replace(/^www\./, "");
}

// Meminta input URL dari pengguna melalui terminal jika argumen tidak diberikan
async function collectInputs() {
  const mainFlag = getFlagValue("main");
  const compareFlags = getCompareUrls();
  if (mainFlag && compareFlags.length > 0) {
    return { mainUrl: mainFlag, compareUrls: compareFlags };
  }

  const input = readline.createInterface({ input: process.stdin, output: process.stdout });
  const mainUrl = (await input.question("URL utama (UPoint/DuniaGames): ")).trim();
  const compareText = (await input.question("URL pembanding, pisahkan dengan koma: ")).trim();
  input.close();

  const daftarUrl = [];
  const potongan = compareText.split(",");
  for (const item of potongan) {
    const urlBersih = item.trim();
    if (urlBersih) {
      daftarUrl.push(urlBersih);
    }
  }

  return {
    mainUrl: mainUrl,
    compareUrls: daftarUrl,
  };
}

// Menjalankan scraping untuk satu URL dan memilih paket termurah
async function scrapeUrl(rawUrl, headed) {
  const url = validateUrl(rawUrl);
  console.log(`Scrape ${url.href}`);
  const rows = await scrape(url, DEFAULT_SELECTOR, headed);
  console.log(`Dapat ${rows.length} produk dari ${getStore(url.href)}.`);

  return {
    url: url.href,
    store: getStore(url.href),
    products: selectCheapestProducts(rows, "mobile-legends"),
  };
}

// Fungsi utama pengendali alur perbandingan
async function main() {
  const { mainUrl, compareUrls } = await collectInputs();
  if (!mainUrl) throw new Error("URL utama wajib diisi.");
  if (!compareUrls.length) throw new Error("Minimal satu URL pembanding wajib diisi.");

  const headed = process.argv.includes("--headed");

  // 1. Scrape data dari toko utama
  const mainData = await scrapeUrl(mainUrl, headed);
  const comparisonData = [];

  // 2. Scrape data dari seluruh toko pembanding satu per satu
  for (const url of compareUrls) {
    try {
      const dataPembanding = await scrapeUrl(url, headed);
      comparisonData.push(dataPembanding);
    } catch (error) {
      console.error(`Lewati ${url}: ${error.message}`);
    }
  }

  if (comparisonData.length === 0) {
    throw new Error("Semua situs pembanding gagal di-scrape.");
  }

  // 3. Bandingkan produk toko utama dengan produk toko pembanding
  const outputRows = [];
  for (const mainProduct of mainData.products.values()) {
    for (const competitor of comparisonData) {
      const matches = findMatches(mainProduct, competitor.products);

      for (const match of matches) {
        const other = match.product;
        const selisihHarga = mainProduct.price - other.price;

        let selisihPerDiamond = null;
        if (mainProduct.pricePerDiamond !== null && other.pricePerDiamond !== null) {
          selisihPerDiamond = mainProduct.pricePerDiamond - other.pricePerDiamond;
        }

        // Tentukan status perbandingan harga
        let status = "";
        if (match.type === "Proximity" && other.totalDiamonds >= mainProduct.totalDiamonds && other.price < mainProduct.price) {
          status = "Pembanding lebih banyak DM dan lebih murah";
        } else if (selisihHarga > 0) {
          status = "Utama lebih mahal";
        } else if (selisihHarga < 0) {
          status = "Utama lebih murah";
        } else {
          status = "Harga sama";
        }

        outputRows.push({
          "Produk Utama": mainProduct.rawName,
          "Total DM Utama": mainProduct.totalDiamonds !== null ? mainProduct.totalDiamonds : "-",
          "Harga Utama": `Rp ${mainProduct.price.toLocaleString("id-ID")}`,
          "Harga/DM Utama": mainProduct.pricePerDiamond === null ? "-" : `Rp ${Math.round(mainProduct.pricePerDiamond).toLocaleString("id-ID")}`,
          "Produk Pembanding": other.rawName,
          "Total DM Pembanding": other.totalDiamonds !== null ? other.totalDiamonds : "-",
          "Harga Pembanding": `Rp ${other.price.toLocaleString("id-ID")}`,
          "Harga/DM Pembanding": other.pricePerDiamond === null ? "-" : `Rp ${Math.round(other.pricePerDiamond).toLocaleString("id-ID")}`,
          "Selisih DM": match.diamondDifference,
          "Selisih Harga": `Rp ${Math.abs(selisihHarga).toLocaleString("id-ID")}`,
          Status: status,
          "Store Utama": mainData.store,
          "Store Pembanding": competitor.store,
          "URL Utama": mainData.url,
          "URL Pembanding": competitor.url,
          _difference: selisihHarga,
          _pricePerDiamondDifference: selisihPerDiamond !== null ? selisihPerDiamond : -999999999,
        });
      }
    }
  }

  // 4. Urutkan hasil perbandingan: selisih terbesar di posisi atas
  outputRows.sort((a, b) => {
    if (b._difference !== a._difference) {
      return b._difference - a._difference;
    }
    return b._pricePerDiamondDifference - a._pricePerDiamondDifference;
  });

  // 5. Susun data bersih untuk ekspor (tambahkan nomor urut)
  const cleanRows = [];
  let no = 1;
  for (const baris of outputRows) {
    cleanRows.push({
      No: no,
      "Produk Utama": baris["Produk Utama"],
      "Total DM Utama": baris["Total DM Utama"],
      "Harga Utama": baris["Harga Utama"],
      "Harga/DM Utama": baris["Harga/DM Utama"],
      "Produk Pembanding": baris["Produk Pembanding"],
      "Total DM Pembanding": baris["Total DM Pembanding"],
      "Harga Pembanding": baris["Harga Pembanding"],
      "Harga/DM Pembanding": baris["Harga/DM Pembanding"],
      "Selisih DM": baris["Selisih DM"],
      "Selisih Harga": baris["Selisih Harga"],
      Status: baris.Status,
      "Store Utama": baris["Store Utama"],
      "Store Pembanding": baris["Store Pembanding"],
      "URL Utama": baris["URL Utama"],
      "URL Pembanding": baris["URL Pembanding"],
    });
    no += 1;
  }

  if (cleanRows.length === 0) {
    throw new Error("Tidak ada produk sama yang dapat dicocokkan antar situs.");
  }

  // 6. Simpan hasil ke file CSV
  const outputArg = getFlagValue("output");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputName = outputArg || `perbandingan-${mainData.store}-${timestamp}`;
  const outputPath = exportCsv(cleanRows, path.resolve(outputName));

  console.table(cleanRows.slice(0, 30));
  console.log(`Berhasil membandingkan ${cleanRows.length} pasangan produk.`);
  console.log(`File CSV: ${outputPath}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Gagal: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  collectInputs,
  findMatches,
  getStore,
  main,
  scrapeUrl,
};
