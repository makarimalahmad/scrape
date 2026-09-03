require("dotenv").config({ quiet: true });
const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");
const { chromium } = require("./playwright");
const { exportCsv } = require("./scrape");
const { GAME_CONFIGS } = require("./compare-google-config");
const {
  createUniqueRunDirectory,
  mapWithConcurrency,
  scrapeStore,
  searchGoogle,
} = require("./compare-google");
const { findMatches } = require("./product-matcher");

function getArgument(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

function matchStoreToAnchors(anchors, store) {
  const usedKeys = new Set();
  const matches = new Map();

  for (const anchor of anchors) {
    const match = findMatches(anchor.reference, store.products).find(
      (candidate) => !usedKeys.has(candidate.product.mapKey),
    );
    if (!match) continue;
    usedKeys.add(match.product.mapKey);
    matches.set(anchor.id, match.product);
  }

  return { matches, usedKeys };
}

function createProductAnchors(mainStores) {
  const anchors = [];

  for (const store of mainStores) {
    const { matches, usedKeys } = matchStoreToAnchors(anchors, store);
    for (const anchor of anchors) {
      const product = matches.get(anchor.id);
      if (product) anchor.mainProducts.set(store.name, product);
    }

    for (const product of store.products.values()) {
      if (usedKeys.has(product.mapKey)) continue;
      anchors.push({
        id: `${anchors.length + 1}:${product.mapKey}`,
        reference: product,
        mainProducts: new Map([[store.name, product]]),
      });
    }
  }

  return anchors.sort((first, second) => {
    const firstQuantity = first.reference.quantity ?? Number.POSITIVE_INFINITY;
    const secondQuantity = second.reference.quantity ?? Number.POSITIVE_INFINITY;
    return (
      firstQuantity - secondQuantity ||
      first.reference.key.localeCompare(second.reference.key, "id")
    );
  });
}

// ============================================================================
// PERHITUNGAN 1: Menentukan Harga Pembanding (Benchmark) Terendah & Tertinggi
// ============================================================================
// Fungsi ini mengurutkan seluruh toko kompetitor berdasarkan harga produk:
// - "lowest"  : mencari toko dengan harga paling murah (terendah) di pasar.
// - "highest" : mencari toko dengan harga paling mahal (tertinggi) di pasar.
function selectBenchmark(entries, direction) {
  if (!entries.length) return null;
  return [...entries].sort((first, second) => {
    const priceOrder = direction === "lowest"
      ? first.product.price - second.product.price
      : second.product.price - first.product.price;
    return (
      priceOrder ||
      first.store.position - second.store.position ||
      first.store.name.localeCompare(second.store.name)
    );
  })[0];
}

// ============================================================================
// PERHITUNGAN 2: Menghitung Selisih Rupiah & Persentase (%)
// ============================================================================
// Rumus yang digunakan:
// 1. Selisih (Nominal) = Harga Toko Utama (UPoint / DuniaGames) - Harga Benchmark (Terendah / Tertinggi)
//    - Jika Positif (+) : Toko utama lebih mahal dibanding harga benchmark.
//    - Jika Negatif (-) : Toko utama lebih murah dibanding harga benchmark.
//
// 2. Persentase (%)   = (Selisih / Harga Toko Utama) * 100
//    - Contoh: Selisih Rp 75 pada harga Rp 960 -> (75 / 960) * 100 = 7.8125%
function calculateComparison(mainProduct, benchmark) {
  if (!mainProduct || !benchmark) return { difference: "-", percentage: "-" };
  const difference = mainProduct.price - benchmark.product.price;
  const percentage = mainProduct.price
    ? `${((difference / mainProduct.price) * 100).toFixed(4)}%`
    : "-";
  return { difference, percentage };
}

function createScrapeRows(gameConfig, ranking, mainStores, competitors) {
  const anchors = createProductAnchors(mainStores);
  const competitorByName = new Map(
    competitors.map((store) => [store.name || store.store, store]),
  );
  const competitorMatches = new Map();

  for (const store of competitors) {
    const storeKey = store.name || store.store;
    competitorMatches.set(storeKey, matchStoreToAnchors(anchors, store).matches);
  }

  const rows = [];
  for (const anchor of anchors) {
    const entries = [];
    for (const rankedStore of ranking) {
      const storeKey = rankedStore.store || rankedStore.title;
      const store = competitorByName.get(storeKey);
      const product = competitorMatches.get(storeKey)?.get(anchor.id);
      if (store && product) entries.push({ store, product });
    }
    if (!entries.length) continue;

    const lowest = selectBenchmark(entries, "lowest");
    const highest = selectBenchmark(entries, "highest");
    const upoint = anchor.mainProducts.get("UPoint");
    const duniaGames = anchor.mainProducts.get("DuniaGames");
    const upointLowest = calculateComparison(upoint, lowest);
    const duniaGamesLowest = calculateComparison(duniaGames, lowest);
    const upointHighest = calculateComparison(upoint, highest);
    const duniaGamesHighest = calculateComparison(duniaGames, highest);
    const row = {
      Produk: anchor.reference.key,
      UPoint: upoint?.price ?? "-",
      DuniaGames: duniaGames?.price ?? "-",
    };

    for (const rankedStore of ranking) {
      const storeKey = rankedStore.store || rankedStore.title;
      const product = competitorMatches.get(storeKey)?.get(anchor.id);
      row[rankedStore.store] = product?.price ?? "-";
    }

    Object.assign(row, {
      "Harga Terendah | UPoint": upoint?.price ?? "-",
      "Harga Terendah | UPoint Selisih": upointLowest.difference,
      "Harga Terendah | UPoint %": upointLowest.percentage,
      "Harga Terendah | DuniaGames": duniaGames?.price ?? "-",
      "Harga Terendah | DuniaGames Selisih": duniaGamesLowest.difference,
      "Harga Terendah | DuniaGames %": duniaGamesLowest.percentage,
      "Harga Tertinggi | UPoint": upoint?.price ?? "-",
      "Harga Tertinggi | UPoint Selisih": upointHighest.difference,
      "Harga Tertinggi | UPoint %": upointHighest.percentage,
      "Harga Tertinggi | DuniaGames": duniaGames?.price ?? "-",
      "Harga Tertinggi | DuniaGames Selisih": duniaGamesHighest.difference,
      "Harga Tertinggi | DuniaGames %": duniaGamesHighest.percentage,
    });
    rows.push(row);
  }

  return rows;
}

function createScrapeWorkbook(gameConfig, ranking, rows) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(gameConfig.name.slice(0, 31), {
    views: [{ state: "frozen", ySplit: 2, xSplit: 1 }],
  });
  const competitorCount = ranking.length;
  const competitorStart = 2;
  const spacerAfterCompetitors = competitorStart + competitorCount;
  const lowestStart = spacerAfterCompetitors + 1;
  const lowestEnd = lowestStart + 5;
  const spacerBetweenBenchmarks = lowestEnd + 1;
  const highestStart = spacerBetweenBenchmarks + 1;
  const highestEnd = highestStart + 5;

  worksheet.mergeCells(1, 1, 2, 1);
  worksheet.getCell(1, 1).value = "Produk";
  for (let index = 0; index < ranking.length; index += 1) {
    const column = competitorStart + index;
    worksheet.mergeCells(1, column, 2, column);
    worksheet.getCell(1, column).value = ranking[index].store;
  }
  worksheet.mergeCells(1, lowestStart, 1, lowestEnd);
  worksheet.getCell(1, lowestStart).value = "Harga terendah";
  worksheet.mergeCells(1, highestStart, 1, highestEnd);
  worksheet.getCell(1, highestStart).value = "Harga tertinggi";

  const benchmarkHeaders = [
    "UPoint",
    "Selisih",
    "%",
    "DuniaGames",
    "Selisih",
    "%",
  ];
  benchmarkHeaders.forEach((header, index) => {
    worksheet.getCell(2, lowestStart + index).value = header;
    worksheet.getCell(2, highestStart + index).value = header;
  });

  for (const row of rows) {
    const values = [row.Produk];
    for (const rankedStore of ranking) values.push(row[rankedStore.store]);
    values.push("");
    // Memasukkan data harga toko utama, selisih rupiah, dan persentase desimal ke Excel:
    // (Persen string "7.8125%" dibagi 100 menjadi angka 0.078125 agar dikenali sebagai tipe angka oleh Excel)
    values.push(
      row["Harga Terendah | UPoint"],
      row["Harga Terendah | UPoint Selisih"],
      row["Harga Terendah | UPoint %"] === "-"
        ? "-"
        : Number.parseFloat(row["Harga Terendah | UPoint %"]) / 100,
      row["Harga Terendah | DuniaGames"],
      row["Harga Terendah | DuniaGames Selisih"],
      row["Harga Terendah | DuniaGames %"] === "-"
        ? "-"
        : Number.parseFloat(row["Harga Terendah | DuniaGames %"]) / 100,
      "",
      row["Harga Tertinggi | UPoint"],
      row["Harga Tertinggi | UPoint Selisih"],
      row["Harga Tertinggi | UPoint %"] === "-"
        ? "-"
        : Number.parseFloat(row["Harga Tertinggi | UPoint %"]) / 100,
      row["Harga Tertinggi | DuniaGames"],
      row["Harga Tertinggi | DuniaGames Selisih"],
      row["Harga Tertinggi | DuniaGames %"] === "-"
        ? "-"
        : Number.parseFloat(row["Harga Tertinggi | DuniaGames %"]) / 100,
    );
    worksheet.addRow(values);
  }

  worksheet.getColumn(1).width = 24;
  for (let column = competitorStart; column <= highestEnd; column += 1) {
    worksheet.getColumn(column).width = 15;
  }
  worksheet.getColumn(spacerAfterCompetitors).width = 3;
  worksheet.getColumn(spacerBetweenBenchmarks).width = 3;
  const rupiahFormat = '"Rp. "#,##0;[Red]-"Rp. "#,##0';
  for (let column = competitorStart; column < spacerAfterCompetitors; column += 1) {
    worksheet.getColumn(column).numFmt = rupiahFormat;
  }
  for (const column of [
    lowestStart,
    lowestStart + 1,
    lowestStart + 3,
    lowestStart + 4,
    highestStart,
    highestStart + 1,
    highestStart + 3,
    highestStart + 4,
  ]) {
    worksheet.getColumn(column).numFmt = rupiahFormat;
  }
  // ============================================================================
  // FORMATTING EXCEL: Menampilkan Kolom Persen dengan 4 Angka Desimal (0.0000%)
  // ============================================================================
  worksheet.getColumn(lowestStart + 2).numFmt = "0.0000%";
  worksheet.getColumn(lowestStart + 5).numFmt = "0.0000%";
  worksheet.getColumn(highestStart + 2).numFmt = "0.0000%";
  worksheet.getColumn(highestStart + 5).numFmt = "0.0000%";

  const border = {
    top: { style: "thin" },
    left: { style: "thin" },
    bottom: { style: "thin" },
    right: { style: "thin" },
  };
  for (let row = 1; row <= worksheet.rowCount; row += 1) {
    for (let column = 1; column <= highestEnd; column += 1) {
      if ([spacerAfterCompetitors, spacerBetweenBenchmarks].includes(column)) {
        continue;
      }
      const cell = worksheet.getCell(row, column);
      cell.border = border;
      cell.alignment = {
        vertical: "middle",
        horizontal: row <= 2 ? "center" : column === 1 ? "left" : "right",
      };
      if (row <= 2) {
        cell.font = { bold: true };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFE7E6E6" },
        };
      }
    }
  }

  // ============================================================================
  // HIGHLIGHT WARNA: Hijau Muda (Harga Termurah) & Merah Muda (Harga Termahal)
  // ============================================================================
  const lowestFill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE2F0D9" }, // Soft Pastel Green
  };
  const highestFill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFCE4D6" }, // Soft Pastel Peach/Red
  };
  const lowestFont = {
    color: { argb: "FF385723" }, // Teks Hijau Tua
    bold: true,
  };
  const highestFont = {
    color: { argb: "FFC00000" }, // Teks Merah Tua
    bold: true,
  };

  for (let rowIdx = 3; rowIdx <= worksheet.rowCount; rowIdx += 1) {
    const competitorPrices = [];
    for (let colIdx = competitorStart; colIdx < spacerAfterCompetitors; colIdx += 1) {
      const val = worksheet.getCell(rowIdx, colIdx).value;
      if (typeof val === "number" && !Number.isNaN(val) && val > 0) {
        competitorPrices.push(val);
      }
    }
    if (competitorPrices.length > 1) {
      const minPrice = Math.min(...competitorPrices);
      const maxPrice = Math.max(...competitorPrices);
      // Hanya warnai jika ada perbedaan harga di baris tersebut
      if (minPrice !== maxPrice) {
        for (let colIdx = competitorStart; colIdx < spacerAfterCompetitors; colIdx += 1) {
          const cell = worksheet.getCell(rowIdx, colIdx);
          if (cell.value === minPrice) {
            cell.fill = lowestFill;
            cell.font = lowestFont;
          } else if (cell.value === maxPrice) {
            cell.fill = highestFill;
            cell.font = highestFont;
          }
        }
      }
    }
  }

  // ============================================================================
  // KETERANGAN / LEGENDA WARNA
  // ============================================================================
  const legendRowIdx = worksheet.rowCount + 2;
  const legendLabelCell = worksheet.getCell(legendRowIdx, 1);
  legendLabelCell.value = "Keterangan Warna:";
  legendLabelCell.font = { bold: true, italic: true, size: 10 };
  legendLabelCell.alignment = { vertical: "middle", horizontal: "left" };

  const lowestLegendCell = worksheet.getCell(legendRowIdx, competitorStart);
  lowestLegendCell.value = "Harga Terendah";
  lowestLegendCell.fill = lowestFill;
  lowestLegendCell.font = lowestFont;
  lowestLegendCell.border = border;
  lowestLegendCell.alignment = { vertical: "middle", horizontal: "center" };

  const highestLegendCell = worksheet.getCell(legendRowIdx, competitorStart + 1);
  highestLegendCell.value = "Harga Tertinggi";
  highestLegendCell.fill = highestFill;
  highestLegendCell.font = highestFont;
  highestLegendCell.border = border;
  highestLegendCell.alignment = { vertical: "middle", horizontal: "center" };

  return { workbook, worksheet };
}

async function exportScrapeXlsx(gameConfig, ranking, rows, outputDirectory) {
  fs.mkdirSync(outputDirectory, { recursive: true });
  const xlsxPath = path.join(outputDirectory, `scrape-${gameConfig.id}.xlsx`);
  const { workbook } = createScrapeWorkbook(gameConfig, ranking, rows);
  await workbook.xlsx.writeFile(xlsxPath);
  return xlsxPath;
}

async function collectStore(store, gameConfig, options) {
  try {
    return {
      success: true,
      store: await scrapeStore(store, gameConfig, options),
    };
  } catch (error) {
    return { success: false, source: store, error };
  }
}

async function processGame(apiKey, gameConfig, options) {
  console.log(`\n===== Scrape ${gameConfig.name} =====`);
  const { ranking, rankingAudit } = await searchGoogle(
    apiKey,
    gameConfig,
    options.limit,
  );
  console.table(ranking);

  const mainResults = await mapWithConcurrency(
    gameConfig.mainStores,
    Math.min(2, options.concurrency),
    (store) => collectStore(store, gameConfig, options),
  );
  const competitorResults = await mapWithConcurrency(
    ranking,
    options.concurrency,
    (store) => collectStore(store, gameConfig, options),
  );
  const mainStores = mainResults.filter((result) => result.success).map((result) => result.store);
  const competitors = competitorResults.filter((result) => result.success).map((result) => result.store);
  const failedMainStores = mainResults
    .filter((result) => !result.success)
    .map((result) => ({
      name: result.source.name,
      url: result.source.url,
      error: result.error.message,
    }));
  const failedCompetitors = competitorResults
    .filter((result) => !result.success)
    .map((result) => ({
      position: result.source.position,
      name: result.source.store,
      url: result.source.link,
      error: result.error.message,
    }));

  if (!mainStores.length) throw new Error(`Semua situs utama ${gameConfig.name} gagal.`);
  if (!competitors.length) throw new Error(`Semua kompetitor ${gameConfig.name} gagal.`);

  const rows = createScrapeRows(gameConfig, ranking, mainStores, competitors);
  if (!rows.length) throw new Error(`Tidak ada produk setara ${gameConfig.name}.`);

  fs.mkdirSync(options.outputDirectory, { recursive: true });
  const csvPath = exportCsv(
    rows,
    path.join(options.outputDirectory, `scrape-${gameConfig.id}`),
  );
  const xlsxPath = await exportScrapeXlsx(
    gameConfig,
    ranking,
    rows,
    options.outputDirectory,
  );
  const allStoreEntries = [
    ...mainStores.map((store) => ({
      name: store.name,
      classification: "MAIN_STORE",
      position: null,
      url: store.url,
      productCount: store.products.size,
      status: store.usedAiFallback ? "SUCCESS_FALLBACK" : "SUCCESS",
      reason: store.usedAiFallback
        ? "Ekstraksi standar DOM belum lengkap, berhasil dipulihkan oleh Groq AI Fallback"
        : null,
    })),
    ...competitors.map((store) => ({
      name: store.name,
      classification: "COMPETITOR",
      position: store.position,
      url: store.url,
      productCount: store.products.size,
      status: store.usedAiFallback ? "SUCCESS_FALLBACK" : "SUCCESS",
      reason: store.usedAiFallback
        ? "Ekstraksi standar DOM belum lengkap, berhasil dipulihkan oleh Groq AI Fallback"
        : null,
    })),
    ...failedMainStores.map((store) => ({
      name: store.name || store.store,
      classification: "MAIN_STORE",
      position: null,
      url: store.url,
      productCount: 0,
      status: String(store.error || "").toLowerCase().includes("fallback") ? "FAILED_FALLBACK" : "FAILED",
      reason: store.error || "Gagal melakukan ekstraksi data",
    })),
    ...failedCompetitors.map((store) => ({
      name: store.name || store.store,
      classification: "COMPETITOR",
      position: store.position,
      url: store.url,
      productCount: 0,
      status: String(store.error || "").toLowerCase().includes("fallback") ? "FAILED_FALLBACK" : "FAILED",
      reason: store.error || "Gagal melakukan ekstraksi data",
    })),
  ];

  return {
    game: gameConfig.name,
    gameId: gameConfig.id,
    success: true,
    files: {
      xlsx: xlsxPath,
      csv: csvPath,
    },
    summary: {
      totalStores: allStoreEntries.length,
      successfulStores: allStoreEntries.filter((s) => s.status.startsWith("SUCCESS")).length,
      failedStores: allStoreEntries.filter((s) => s.status.startsWith("FAILED")).length,
    },
    stores: allStoreEntries,
  };
}

async function main() {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) throw new Error("SERPAPI_KEY belum diatur.");

  const gameId = getArgument("game");
  if (!gameId) {
    throw new Error("Pilih --game all, mobile-legends, free-fire, atau roblox.");
  }
  const selectedGames = gameId === "all"
    ? GAME_CONFIGS
    : GAME_CONFIGS.filter((game) =>
        gameId
          .split(",")
          .map((id) => id.trim().toLowerCase())
          .includes(game.id),
      );
  if (!selectedGames.length) {
    throw new Error(
      `Game tidak valid: ${gameId}. Pilih all, mobile-legends, free-fire, roblox, atau kombinasi koma (contoh: free-fire,roblox).`,
    );
  }

  const headed = process.argv.includes("--headed");
  const attemptsValue = Number(getArgument("attempts", "3"));
  const maxAttempts = Number.isInteger(attemptsValue)
    ? Math.min(5, Math.max(1, attemptsValue))
    : 3;
  const limitValue = Number(getArgument("limit", "10"));
  const limit = Number.isInteger(limitValue)
    ? Math.min(10, Math.max(1, limitValue))
    : 10;
  const concurrencyValue = Number(getArgument("concurrency", headed ? "1" : "3"));
  const concurrency = headed
    ? 1
    : Number.isInteger(concurrencyValue)
      ? Math.min(4, Math.max(1, concurrencyValue))
      : 3;
  const generatedAt = new Date().toISOString();
  const date = generatedAt.slice(0, 10);
  const runDirectory = createUniqueRunDirectory(path.resolve(__dirname, "output"), date);
  const comparisonDirectory = path.join(runDirectory, "comparison");
  const scrapeDirectory = path.join(runDirectory, "scrapes");
  fs.mkdirSync(comparisonDirectory);
  fs.mkdirSync(scrapeDirectory);

  const summaries = [];
  const browser = await chromium.launch({ headless: !headed });
  try {
    for (const gameConfig of selectedGames) {
      const outputDirectory = path.join(comparisonDirectory, gameConfig.id);
      const scrapeOutputDirectory = path.join(scrapeDirectory, gameConfig.id);
      fs.mkdirSync(outputDirectory, { recursive: true });
      fs.mkdirSync(scrapeOutputDirectory, { recursive: true });
      try {
        summaries.push(
          await processGame(apiKey, gameConfig, {
            browser,
            concurrency,
            headed,
            limit,
            maxAttempts,
            outputDirectory,
            scrapeOutputDirectory,
          }),
        );
      } catch (error) {
        summaries.push({
          success: false,
          game: gameConfig.name,
          gameId: gameConfig.id,
          error: error.message,
        });
        console.error(`Gagal ${gameConfig.name}: ${error.message}`);
      }
    }
  } finally {
    await browser.close();
  }

  const summaryPath = path.join(comparisonDirectory, "summary-scrape.json");
  fs.writeFileSync(
    summaryPath,
    JSON.stringify({ generatedAt, games: summaries }, null, 2),
    "utf8",
  );
  console.log(`Hasil scrape: ${comparisonDirectory}`);
  console.log(`Hasil scrape mentah: ${scrapeDirectory}`);
  console.log(`Summary: ${summaryPath}`);
  if (summaries.some((summary) => !summary.success)) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Gagal: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  calculateComparison,
  createScrapeRows,
  createScrapeWorkbook,
  createProductAnchors,
  exportScrapeXlsx,
  matchStoreToAnchors,
  selectBenchmark,
};
