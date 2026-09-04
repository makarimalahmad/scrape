const { chromium } = require("./lib/browser/playwright");
const readline = require("readline/promises");
const { validateScrapeResults } = require("./lib/validation/validate-results");
const { extractWithGroq } = require("./lib/extractors/ai-extractor");

// Modular internal libraries
const { parseProxy, getProxyForUrl } = require("./lib/proxy/proxy-manager");
const {
  findTurnstileFrame,
  solveCloudflareChallenge,
  pageShowsCloudflareChallenge,
} = require("./lib/anti-bot/cloudflare");
const {
  REAL_BROWSER_DOMAINS,
  scrapeWithRealBrowser,
} = require("./lib/anti-bot/real-browser");
const {
  extractSpecialRows,
  extractBlibliRows,
  extractDanaRows,
  extractDitusiRows,
  extractDuniaGamesRows,
  extractEbelanjaRows,
  extractGopayRows,
  extractHiddengameRows,
  extractKiosgamerRows,
  extractRobloxRows,
  extractShopeeRows,
  extractTokopediaRows,
  extractUniPinRows,
  extractUnipinRobloxRows,
  extractUPointRows,
  extractVcgamersRows,
  extractVexagameRows,
} = require("./lib/extractors/special-extractors");
const {
  extractGenericRows,
  extractProductPairsFromJson,
} = require("./lib/extractors/generic-extractor");
const {
  normalizeMobapayProductName,
  normalizeTokopediaUrl,
  parseBlibliOptionText,
  parseDitusiProductRows,
  parseDuniaGamesCardText,
  parseRobloxProductCard,
  parseUniPinCardText,
  parseUPointCardText,
  validateUrl,
} = require("./lib/extractors/parsers");
const {
  createOutputName,
  exportCsv,
  saveInvalidReport,
} = require("./lib/utils/export-csv");

const DEFAULT_SELECTOR =
  '.denom, article, li, label, button, [role="radio"], [class*="product"], [class*="item"], [class*="card"], [class*="denom"]';

function getArgument(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return fallback;
  const nextValue = process.argv[index + 1];
  if (!nextValue || nextValue.startsWith("--")) return fallback;
  return nextValue;
}

async function getUrl() {
  const argumentUrl = process.argv
    .slice(2)
    .find((value) => !value.startsWith("--"));
  if (argumentUrl) return argumentUrl;

  const input = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const url = await input.question("URL situs: ");
  input.close();
  return url.trim();
}

async function createOptimizedContext(browser, contextOptions = {}) {
  return browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 800 },
    locale: "id-ID",
    timezoneId: "Asia/Jakarta",
    ...contextOptions,
  });
}

async function waitForProductData(page, timeout = 20_000, hostname = "") {
  const domain = hostname.replace(/^www\./, "");
  const readinessSelectors = {
    "upoint.id": ".cursor-pointer",
    "duniagames.co.id": ".denom .price-dnm .pr",
    "unipin.com": ".denom-container > button",
    "hiddengame.id": "div.product-item",
  };
  const readinessSelector = readinessSelectors[domain];
  if (readinessSelector) {
    const ready = await page
      .locator(readinessSelector)
      .filter({
        hasText:
          /(?:from\s+\d{1,3}(?:\.\d{3})+|IDR\s*[1-9]\d*|Rp\.?\s*\d|^\s*[1-9]\d{0,2}(?:\.\d{3})*\s*$)/i,
      })
      .first()
      .waitFor({ state: "visible", timeout })
      .then(() => true)
      .catch(() => false);
    if (ready) return true;
  }

  return page
    .waitForFunction(
      () => {
        const text = document.body?.innerText || "";
        const challengeVisible =
          /sorry, you have been blocked|attention required|access denied|captcha|cloudflare ray id|melakukan verifikasi keamanan|verifikasi bahwa anda/i.test(
            text,
          );
        const hasPrice = /(?:Rp\.?|IDR|USD|US\$|\$|RM)\s*\d/i.test(text);
        const hasProduct =
          /(?:diamond|\bdm\b|pass|pack|card|member|membership|robux|voucher|\buc\b|point|token|crystal|gold|coin|credit)/i.test(
            text,
          );
        return !challengeVisible && hasPrice && hasProduct;
      },
      null,
      { timeout, polling: 500 },
    )
    .then(() => true)
    .catch(() => false);
}

async function triggerStoreSpecificInteractions(page, url) {
  if (/ourastore\.com$|bangjeff\.com$/i.test(url.hostname)) {
    const productsReady = await page
      .waitForFunction(
        () => {
          const cards = Array.from(
            document.querySelectorAll('[class*="group/variant"]'),
          );
          return cards.some((card) => {
            const text = card.innerText || "";
            return (
              /(?:Rp\.?|IDR)\s*\d/i.test(text) &&
              /(?:diamond|member|card|pass|pack|roblox|robux|voucher)/i.test(text)
            );
          });
        },
        null,
        { timeout: 120_000 },
      )
      .then(() => true)
      .catch(() => false);

    if (!productsReady) {
      throw new Error(
        "API produk situs tidak selesai dimuat dalam 120 detik. Jangan reload karena dapat memicu Cloudflare lagi; coba jalankan ulang atau ganti jaringan.",
      );
    }
  } else {
    await waitForProductData(page, 20_000, url.hostname);
  }


  if (url.hostname.endsWith("lootbar.com")) {
    const closeCoupon = page.locator("button.dialog-coupon-close");
    if (await closeCoupon.count()) {
      await closeCoupon.click().catch(() => {});
      await page.waitForTimeout(500);
    }
  }

  if (url.hostname.endsWith("mobapay.com")) {
    const expandButton = page.locator(".mobapay-scroll-recharge-arrow").first();
    if (await expandButton.count()) {
      await expandButton.click().catch(() => {});
      await page.waitForTimeout(1_500);
    }
  }

  if (url.hostname.endsWith("itemku.com")) {
    const showMoreButtons = page.getByText(/Lihat \d+ Lainnya/i);
    const buttonCount = await showMoreButtons.count();
    for (let i = 0; i < buttonCount; i += 1) {
      await showMoreButtons.nth(i).click().catch(() => {});
      await page.waitForTimeout(400);
    }
  }

  if (url.hostname.endsWith("gogogo.id") && /roblox/i.test(url.pathname)) {
    const globalInstanTab = page.getByText(/Roblox Global Instan/i).first();
    if (await globalInstanTab.count()) {
      await globalInstanTab.click({ force: true }).catch(() => {});
      await page.waitForTimeout(1_000);
    }
  }

  // Handle lazy loading / smooth scroll
  await page.locator(".animate-shimmer, [class*='skeleton']").first().waitFor({ state: "detached", timeout: 8_000 }).catch(() => {});
  await page.locator('.main-info, div[class*="price-container"], .denom, .product-card, .sku-card, [class*="group/variant"], .pDRoot, div[class*="cursor-pointer"]').first().waitFor({ state: "visible", timeout: 8_000 }).catch(() => {});
  await page.waitForTimeout(400);

  await page.evaluate(async () => {
    let previousHeight = 0;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const currentHeight = document.body.scrollHeight;
      window.scrollTo(0, currentHeight);
      await new Promise((resolve) => setTimeout(resolve, 200));
      if (currentHeight === previousHeight) break;
      previousHeight = currentHeight;
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(400);
}

async function scrape(url, selector, headed, options = {}) {
  url = url instanceof URL ? url : new URL(url);
  const domain = url.hostname.replace(/^www\./, "");

  // 1. Delegasi ke Real Browser untuk domain khusus Turnstile
  if (REAL_BROWSER_DOMAINS.includes(domain)) {
    try {
      const realRows = await scrapeWithRealBrowser(url, selector, headed, options);
      if (realRows && realRows.length) {
        return realRows;
      }
    } catch (err) {
      console.log(`[Real Browser] Warning: ${err.message}. Mencoba Playwright fallback...`);
    }
  }

  // 2. Setup Proxy dan Browser Lifecycle
  const proxyConfig = getProxyForUrl(url, options);
  const usedProxy = Boolean(proxyConfig);
  if (usedProxy) {
    console.log(`[Proxy] Menggunakan proxy untuk ${domain} (${proxyConfig.server})`);
  }

  const ownsBrowser = !options.browser;
  const browserLaunchOptions = { headless: !headed };
  if (proxyConfig && ownsBrowser) {
    browserLaunchOptions.proxy = proxyConfig;
  }
  const browser = options.browser || (await chromium.launch(browserLaunchOptions));
  let context = null;

  try {
    const contextOptions = {};
    if (proxyConfig && !ownsBrowser) {
      contextOptions.proxy = proxyConfig;
    }
    context = await createOptimizedContext(browser, contextOptions);
    const page = await context.newPage();

    const interceptedPayloads = [];
    page.on("response", async (res) => {
      try {
        const resUrl = res.url();
        const contentType = res.headers()["content-type"] || "";
        if (
          contentType.includes("application/json") &&
          res.status() === 200 &&
          !resUrl.includes("google-analytics") &&
          !resUrl.includes("datadog") &&
          !resUrl.includes("tracker")
        ) {
          const json = await res.json().catch(() => null);
          if (json) {
            interceptedPayloads.push({ url: resUrl, data: json });
          }
        }
      } catch {}
    });

    let response;
    try {
      response = await page.goto(url.href, {
        waitUntil: "domcontentloaded",
        timeout: 90_000,
      });
    } catch (error) {
      if (error.message.includes("ERR_TIMED_OUT")) {
        throw new Error("Koneksi ke situs timeout (ERR_TIMED_OUT)");
      }
      throw error;
    }
    await page.locator("body").waitFor({ state: "attached", timeout: 15_000 }).catch(() => {});

    // 3. Deteksi dan Penanganan Cloudflare
    let hasCloudflare =
      response?.status() === 403 || (await pageShowsCloudflareChallenge(page));
    if (!hasCloudflare) {
      const turnstileFrame = await findTurnstileFrame(page, 2_500);
      if (turnstileFrame || (await pageShowsCloudflareChallenge(page))) {
        hasCloudflare = true;
      }
    }

    if (hasCloudflare) {
      if (!usedProxy && parseProxy()) {
        console.log(
          `[Proxy] Akses ke ${domain} terblokir (HTTP ${response?.status() || "Cloudflare"}). Mencoba ulang otomatis menggunakan proxy...`,
        );
        await context.close().catch(() => {});
        if (ownsBrowser) await browser.close().catch(() => {});
        return await scrape(url, selector, headed, { ...options, forceProxy: true });
      }

      const isDitusi = url.hostname.replace(/^www\./, "") === "ditusi.co.id";
      const challenge = await solveCloudflareChallenge(page, {
        timeout: 120_000,
        maxClicks: isDitusi ? 4 : Number.POSITIVE_INFINITY,
      });
      if (!challenge.passed) {
        if (!usedProxy && parseProxy()) {
          console.log(
            `[Proxy] Verifikasi Cloudflare tidak selesai di ${domain}. Mencoba ulang menggunakan proxy...`,
          );
          await context.close().catch(() => {});
          if (ownsBrowser) await browser.close().catch(() => {});
          return await scrape(url, selector, headed, { ...options, forceProxy: true });
        }

        const message = challenge.clickLimitReached
          ? `Cloudflare terus mengulang challenge setelah ${challenge.clickCount} klik otomatis. Situs dilewati tanpa retry langsung.`
          : `Verifikasi Cloudflare tidak selesai dalam 2 menit setelah ${challenge.clickCount} klik otomatis. Situs dilewati.`;
        const error = new Error(message);
        error.retryable = false;
        throw error;
      }

      console.log(
        `Cloudflare lolos setelah ${challenge.clickCount} klik. Menunggu produk dimuat...`,
      );
    }

    // 4. Interaksi Khusus & Ekstraksi Produk
    await triggerStoreSpecificInteractions(page, url);

    let specialRows = await extractSpecialRows(page, url, interceptedPayloads);
    if (!specialRows?.length) specialRows = null;

    let genericRows = null;
    if (!specialRows) {
      genericRows = await extractGenericRows(page, url, selector);
    }

    let rows = specialRows ?? genericRows ?? [];

    // 5. AI Fallback (Groq) jika data belum memadai
    let usedAiFallback = false;
    const detectedGame =
      options.game ||
      (/roblox/i.test(url.pathname)
        ? "roblox"
        : /free-fire/i.test(url.pathname)
          ? "free-fire"
          : /mobile-legends/i.test(url.pathname)
            ? "mobile-legends"
            : "");
    const tempValidation = validateScrapeResults(url, rows, detectedGame);
    let triedAiFallback = false;
    let aiFallbackError = null;
    if ((!rows.length || !tempValidation.valid || rows.length < 4) && process.env.GROQ_API_KEY) {
      triedAiFallback = true;
      try {
        console.log("Ekstraksi standar belum lengkap, mencoba Groq AI fallback...");
        const pageText = await page.evaluate(() => document.body?.innerText || "");
        const aiRows = await extractWithGroq(pageText, detectedGame || options.game || "");
        if (aiRows && aiRows.length >= (rows.length || 1)) {
          console.log(`[Groq AI] Berhasil mengekstrak ${aiRows.length} produk!`);
          rows = aiRows;
          usedAiFallback = true;
        }
      } catch (err) {
        aiFallbackError = err.message;
        console.log("[Groq AI] Fallback dilewati:", err.message);
      }
    }

    if (!rows.length) {
      const err = new Error(
        triedAiFallback && !aiFallbackError
          ? "Ekstraksi standar dan Groq AI Fallback keduanya tidak menemukan data harga pada halaman ini."
          : "Data harga tidak ditemukan pada halaman ini.",
      );
      err.triedAiFallback = triedAiFallback;
      err.aiFallbackError = aiFallbackError;
      throw err;
    }

    const finalRows = rows.map((row, index) => ({
      No: index + 1,
      ...row,
      Sumber: url.href,
      _usedAiFallback: usedAiFallback || Boolean(row._usedAiFallback),
    }));
    finalRows._usedAiFallback = usedAiFallback;
    return finalRows;
  } catch (error) {
    if (context) await context.close().catch(() => {});
    if (ownsBrowser) await browser.close().catch(() => {});
    context = null;

    // Auto-fallback ke Real Browser jika Playwright gagal karena proteksi Cloudflare atau API timeout
    if (
      !REAL_BROWSER_DOMAINS.includes(domain) &&
      /cloudflare|api produk|challenge|blocked|just a moment/i.test(error.message)
    ) {
      try {
        console.log(`[Real Browser Fallback] Mencoba pemulihan otomatis via Real Browser untuk ${domain}...`);
        const fallbackRows = await scrapeWithRealBrowser(url, selector, headed, options);
        if (fallbackRows && fallbackRows.length) {
          return fallbackRows;
        }
      } catch (realErr) {
        console.log(`[Real Browser Fallback] Gagal: ${realErr.message}`);
      }
    }

    throw error;
  } finally {
    if (context) await context.close().catch(() => {});
    if (ownsBrowser) await browser.close().catch(() => {});
  }
}

async function main() {
  const url = normalizeTokopediaUrl(await getUrl());
  const selector = getArgument("selector", DEFAULT_SELECTOR);
  const output = getArgument("output", createOutputName(url));
  const headed = process.argv.includes("--headed");

  const rows = await scrape(url, selector, headed);
  const validation = validateScrapeResults(url.href, rows);

  console.table(rows);
  console.log(`Confidence data: ${validation.confidence}/100.`);

  if (!validation.valid) {
    const reportPath = saveInvalidReport(output, url, validation, rows);
    const reasons = validation.reasons.join(", ");
    throw new Error(
      `${validation.status}: ${reasons}. CSV tidak dibuat. Laporan: ${reportPath}`,
    );
  }

  const filePath = exportCsv(rows, output);
  console.log(`Berhasil mengambil ${rows.length} data valid.`);
  console.log(`File CSV: ${filePath}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Gagal: ${error.message}`);
    process.exitCode = 1;
  });
}

// 100% Backward-Compatible Exports
module.exports = {
  DEFAULT_SELECTOR,
  exportCsv,
  extractProductPairsFromJson,
  getProxyForUrl,
  normalizeMobapayProductName,
  normalizeTokopediaUrl,
  parseBlibliOptionText,
  parseDitusiProductRows,
  parseDuniaGamesCardText,
  parseProxy,
  parseRobloxProductCard,
  parseUniPinCardText,
  parseUPointCardText,
  saveInvalidReport,
  scrape,
  validateUrl,
};
