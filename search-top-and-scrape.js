const fs = require("fs");
const path = require("path");
const readline = require("readline/promises");
const { spawn } = require("child_process");

function getArgument(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : fallback;
}

async function getQuery() {
  const argumentQuery = getArgument("query");
  if (argumentQuery) return argumentQuery;

  const input = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const query = await input.question("Query Google: ");
  input.close();
  return query.trim();
}

function sanitizeHostname(url) {
  return new URL(url).hostname
    .replace(/^www\./, "")
    .replace(/[^a-z0-9]+/gi, "-");
}

function runScraper(url, outputName, headed) {
  return new Promise((resolve, reject) => {
    const args = ["scrape.js", url, "--output", outputName];
    if (headed) args.push("--headed");

    const child = spawn(process.execPath, args, {
      cwd: __dirname,
      stdio: "inherit",
    });

    child.once("error", reject);
    child.once("close", (code) => resolve(code));
  });
}

async function main() {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) {
    throw new Error(
      'SERPAPI_KEY belum diatur. Jalankan: $env:SERPAPI_KEY="API_KEY_KAMU"',
    );
  }

  const query = await getQuery();
  if (!query) throw new Error("Query Google wajib diisi.");

  const scrapeAll = process.argv.includes("--all");
  const requestedLimit = Number(getArgument("limit", scrapeAll ? 10 : 1));
  const limit = Number.isInteger(requestedLimit)
    ? Math.min(10, Math.max(1, requestedLimit))
    : scrapeAll
      ? 10
      : 1;

  const parameters = new URLSearchParams({
    engine: "google",
    q: query,
    location: "Indonesia",
    hl: "id",
    gl: "id",
    device: "desktop",
    num: "10",
    api_key: apiKey,
  });

  console.log(`Mencari hasil organik halaman pertama untuk: ${query}`);
  const response = await fetch(`https://serpapi.com/search.json?${parameters}`);
  if (!response.ok) {
    throw new Error(`SerpAPI gagal: HTTP ${response.status}`);
  }

  const data = await response.json();
  if (data.error) throw new Error(`SerpAPI gagal: ${data.error}`);

  const results = (data.organic_results || [])
    .filter((result) => result.link)
    .slice(0, limit)
    .map((result, index) => ({
      position: result.position ?? index + 1,
      title: result.title,
      link: result.link,
      displayedLink: result.displayed_link,
    }));

  if (!results.length) {
    throw new Error("Hasil organik Google tidak ditemukan.");
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const date = timestamp.slice(0, 10);
  const outputDirectory = path.resolve(__dirname, "output", date);
  fs.mkdirSync(outputDirectory, { recursive: true });

  const rankingPath = path.join(outputDirectory, `ranking-${timestamp}.json`);
  const ranking = {
    query,
    fetchedAt: new Date().toISOString(),
    parameters: {
      location: "Indonesia",
      language: "id",
      country: "id",
      device: "desktop",
      page: 1,
    },
    results,
  };

  fs.writeFileSync(rankingPath, JSON.stringify(ranking, null, 2), "utf8");
  console.log(`Hasil organik yang akan di-scrape: ${results.length}`);
  console.table(results);
  console.log(`Bukti ranking: ${rankingPath}`);

  const headed = process.argv.includes("--headed");
  const scrapingResults = [];

  for (const result of results) {
    let outputName;
    try {
      outputName = path.join(
        outputDirectory,
        `rank-${result.position}-${sanitizeHostname(result.link)}-${timestamp}`,
      );
    } catch {
      scrapingResults.push({
        position: result.position,
        title: result.title,
        link: result.link,
        success: false,
        exitCode: null,
        error: "URL tidak valid",
      });
      continue;
    }

    console.log(`\nScrape rank ${result.position}: ${result.link}`);
    try {
      const exitCode = await runScraper(result.link, outputName, headed);
      scrapingResults.push({
        position: result.position,
        title: result.title,
        link: result.link,
        success: exitCode === 0,
        exitCode,
        expectedCsv: `${outputName}.csv`,
      });
    } catch (error) {
      scrapingResults.push({
        position: result.position,
        title: result.title,
        link: result.link,
        success: false,
        exitCode: null,
        error: error.message,
      });
    }
  }

  const summaryPath = path.join(outputDirectory, `summary-${timestamp}.json`);
  fs.writeFileSync(
    summaryPath,
    JSON.stringify({ ...ranking, scraping: scrapingResults }, null, 2),
    "utf8",
  );

  const successCount = scrapingResults.filter((result) => result.success).length;
  const failedCount = scrapingResults.length - successCount;
  console.table(
    scrapingResults.map(({ expectedCsv, ...result }) => result),
  );
  console.log(`Berhasil: ${successCount}; gagal: ${failedCount}.`);
  console.log(`Ringkasan: ${summaryPath}`);

  if (failedCount > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`Gagal: ${error.message}`);
  process.exitCode = 1;
});
