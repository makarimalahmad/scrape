const path = require("path");
const readline = require("readline/promises");
const { DEFAULT_SELECTOR, scrape, validateUrl, exportCsv } = require("./scrape");
const { selectCheapestProducts, findMatches, parsePrice } = require("./product-matcher");

function getFlagValue(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : null;
}

function getCompareUrls() {
  const index = process.argv.indexOf("--compare");
  if (index < 0) return [];
  const urls = [];
  for (let i = index + 1; i < process.argv.length && !process.argv[i].startsWith("--"); i += 1) {
    urls.push(process.argv[i]);
  }
  return urls;
}

function getStore(url) {
  return new URL(url).hostname.replace(/^www\./, "");
}

async function collectInputs() {
  const mainFlag = getFlagValue("main");
  const compareFlags = getCompareUrls();
  if (mainFlag && compareFlags.length) return { mainUrl: mainFlag, compareUrls: compareFlags };

  const input = readline.createInterface({ input: process.stdin, output: process.stdout });
  const mainUrl = (await input.question("URL utama (UPoint/DuniaGames): ")).trim();
  const compareText = (await input.question("URL pembanding, pisahkan dengan koma: ")).trim();
  input.close();

  return {
    mainUrl,
    compareUrls: compareText.split(",").map((url) => url.trim()).filter(Boolean),
  };
}

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

async function main() {
  const { mainUrl, compareUrls } = await collectInputs();
  if (!mainUrl) throw new Error('URL utama wajib diisi.');
  if (!compareUrls.length) throw new Error('Minimal satu URL pembanding wajib diisi.');

  const headed = process.argv.includes('--headed');
  const mainData = await scrapeUrl(mainUrl, headed);
  const comparisonData = [];

  for (const url of compareUrls) {
    try {
      comparisonData.push(await scrapeUrl(url, headed));
    } catch (error) {
      console.error(`Lewati ${url}: ${error.message}`);
    }
  }

  if (!comparisonData.length) throw new Error('Semua situs pembanding gagal di-scrape.');

  const outputRows = [];
  for (const mainProduct of mainData.products.values()) {
    for (const competitor of comparisonData) {
      const matches = findMatches(mainProduct, competitor.products);

      for (const match of matches) {
        const other = match.product;
        const difference = mainProduct.price - other.price;
        const pricePerDiamondDifference = mainProduct.pricePerDiamond !== null && other.pricePerDiamond !== null
          ? mainProduct.pricePerDiamond - other.pricePerDiamond
          : null;

        let status;
        if (match.type === 'Proximity' && other.totalDiamonds >= mainProduct.totalDiamonds && other.price < mainProduct.price) {
          status = 'Pembanding lebih banyak DM dan lebih murah';
        } else if (difference > 0) {
          status = 'Utama lebih mahal';
        } else if (difference < 0) {
          status = 'Utama lebih murah';
        } else {
          status = 'Harga sama';
        }

        outputRows.push({
          'Produk Utama': mainProduct.rawName,
          'Total DM Utama': mainProduct.totalDiamonds ?? '-',
          'Harga Utama': `Rp ${mainProduct.price.toLocaleString('id-ID')}`,
          'Harga/DM Utama': mainProduct.pricePerDiamond === null ? '-' : `Rp ${Math.round(mainProduct.pricePerDiamond).toLocaleString('id-ID')}`,
          'Produk Pembanding': other.rawName,
          'Total DM Pembanding': other.totalDiamonds ?? '-',
          'Harga Pembanding': `Rp ${other.price.toLocaleString('id-ID')}`,
          'Harga/DM Pembanding': other.pricePerDiamond === null ? '-' : `Rp ${Math.round(other.pricePerDiamond).toLocaleString('id-ID')}`,
          'Selisih DM': match.diamondDifference,
          'Selisih Harga': `Rp ${Math.abs(difference).toLocaleString('id-ID')}`,
          Status: status,
          'Store Utama': mainData.store,
          'Store Pembanding': competitor.store,
          'URL Utama': mainData.url,
          'URL Pembanding': competitor.url,
          _difference: difference,
          _pricePerDiamondDifference: pricePerDiamondDifference ?? Number.NEGATIVE_INFINITY
        });
      }
    }
  }

  outputRows.sort((a, b) => b._difference - a._difference || b._pricePerDiamondDifference - a._pricePerDiamondDifference);
  const cleanRows = outputRows.map(({ _difference, _pricePerDiamondDifference, ...row }, index) => ({ No: index + 1, ...row }));
  if (!cleanRows.length) throw new Error('Tidak ada produk sama yang dapat dicocokkan antar situs.');

  const outputArg = getFlagValue('output');
  const outputName = outputArg || `perbandingan-${mainData.store}-${new Date().toISOString().replace(/[:.]/g, '-')}`;
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

module.exports = { parseProduct, cheapestProducts, findMatches };
