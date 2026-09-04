/**
 * Puppeteer Real Browser Integration
 * Used for stores requiring strict anti-bot bypass (e.g. Ditusi Turnstile tabs)
 */

const fs = require("fs");
const { chromium } = require("../browser/playwright");
const { getProxyForUrl, toRealBrowserProxy } = require("../proxy/proxy-manager");

const REAL_BROWSER_DOMAINS = ["ditusi.co.id"];

async function scrapeWithRealBrowser(url, selector, headed, options = {}) {
  let connect;
  try {
    ({ connect } = require("puppeteer-real-browser"));
  } catch (e) {
    console.log("[Real Browser] require failed:", e.message);
    return null;
  }

  // Auto-detect Playwright Chromium path jika CHROME_PATH belum diatur
  if (!process.env.CHROME_PATH) {
    try {
      const pwPath = chromium.executablePath();
      if (pwPath && fs.existsSync(pwPath)) {
        process.env.CHROME_PATH = pwPath;
      }
    } catch {
      // Abaikan jika tidak tersedia
    }
  }

  const domain = url.hostname.replace(/^www\./, "");
  console.log(`[Real Browser] Menghubungkan puppeteer-real-browser untuk ${domain}...`);
  let browser;
  try {
    const connectOptions = {
      headless: false,
      turnstile: true,
      args: ["--no-sandbox"],
    };

    const proxyConfig = getProxyForUrl(url, options);
    const realProxy = toRealBrowserProxy(proxyConfig);
    if (realProxy) {
      connectOptions.proxy = realProxy;
      console.log(
        `[Real Browser] Menggunakan proxy untuk ${domain}: ${realProxy.host}:${realProxy.port}`,
      );
    }

    const connection = await connect(connectOptions);
    browser = connection.browser;
    const page = connection.page;

    await page.goto(url.href, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });

    let passed = false;
    for (let s = 1; s <= 35; s += 1) {
      await new Promise((r) => setTimeout(r, 1_000));
      const title = await page.title().catch(() => "");
      const isBlockedOrChallenge =
        !title ||
        /just a moment|tunggu sebentar|403 forbidden|access denied|attention required|error 403|security service/i.test(
          title,
        );

      if (!isBlockedOrChallenge) {
        console.log(`[Real Browser] 🎉 Lolos Cloudflare di detik ke-${s}! Title: ${title}`);
        passed = true;
        break;
      }
    }

    if (!passed) {
      throw new Error(`Verifikasi Cloudflare/Akses ke ${domain} ditolak (Title: "${await page.title().catch(() => "")}"). Kemungkinan IP server diblokir WAF situs.`);
    }

    await new Promise((r) => setTimeout(r, 2_500));

    await page.evaluate(() => {
      document
        .querySelectorAll(".modal, .modal-backdrop, #modal-request-permission, #customModal, [class*='modal-backdrop']")
        .forEach((el) => el.remove());
      document.body?.classList?.remove("modal-open");
    });

    let collectedRawRows = [];

    // 1. Ekstraksi Khusus Ditusi (Multi-Tab Kategori)
    if (domain === "ditusi.co.id") {
      const categoryLabels = await page.evaluate(() => {
        const labels = Array.from(
          document.querySelectorAll("#group-category-game label, .wrapp-title-category"),
        )
          .map((el) => el.innerText?.trim())
          .filter(Boolean);
        return Array.from(new Set(labels)).filter(
          (t) => /(?:gift\s*card|robux|voucher)/i.test(t) && t.length < 40,
        );
      });

      const collectVisible = async () => {
        return await page.evaluate(() => {
          const els = Array.from(
            document.querySelectorAll(
              ".item-product-click, .product-item, .card-product, [class*='item-product']",
            ),
          );
          return els
            .filter((el) => el.offsetParent !== null)
            .map((el) => {
              const text = el.innerText.replace(/\s+/g, " ").trim();
              const priceMatch = text.match(/Rp\.?\s*[\d.]+/i);
              if (!priceMatch) return null;
              const harga = priceMatch[0];
              const produk = text.split(/Rp\.?/i)[0].replace(/Termurah/gi, "").trim();
              return produk && harga ? { Produk: produk, Harga: harga } : null;
            })
            .filter(Boolean);
        });
      };

      const seenDitusiRows = new Set();
      const addRows = (items) => {
        for (const item of items) {
          const key = `${item.Produk.toLowerCase()}|${item.Harga.toLowerCase()}`;
          if (!seenDitusiRows.has(key)) {
            seenDitusiRows.add(key);
            collectedRawRows.push(item);
          }
        }
      };

      addRows(await collectVisible());

      for (const cat of categoryLabels) {
        await page.evaluate((targetCat) => {
          const els = Array.from(
            document.querySelectorAll("#group-category-game label, .wrapp-title-category, button, a"),
          );
          const match = els.find((el) => el.innerText?.trim() === targetCat);
          if (match) match.click();
        }, cat);

        await new Promise((r) => setTimeout(r, 1_200));
        addRows(await collectVisible());
      }
    } else {
      // 2. Ekstraksi Toko Umum & Berbasis API (Bangjeff, Ourastore, dll)
      console.log(`[Real Browser] Menunggu produk ${domain} dimuat...`);
      for (let w = 0; w < 25; w += 1) {
        const hasProducts = await page.evaluate(() => {
          const text = document.body?.innerText || "";
          return (
            /(?:Rp\.?|IDR)\s*\d/i.test(text) &&
            /(?:diamond|member|card|pass|pack|roblox|robux|voucher)/i.test(text)
          );
        });
        if (hasProducts) break;
        await new Promise((r) => setTimeout(r, 1_000));
      }

      collectedRawRows = await page.evaluate(() => {
        const cardSelectors = [
          '[class*="group/variant"]',
          '.denom',
          '[class*="product-item"]',
          '[class*="card-product"]',
          '[class*="item-product"]',
          '[class*="product"]',
          '[class*="card"]',
          'article',
          'li',
          'label',
          'button',
          '[role="radio"]',
        ];

        const cards = Array.from(
          document.querySelectorAll(cardSelectors.join(", ")),
        ).filter((el) => el.offsetParent !== null && (el.innerText?.length || 0) < 250);

        const items = [];
        const seen = new Set();

        for (const card of cards) {
          const text = (card.innerText || "").replace(/\s+/g, " ").trim();
          const priceMatch = text.match(/(?:Rp\.?|IDR)\s*[\d.]+/i);
          if (!priceMatch) continue;

          const harga = priceMatch[0];
          let produk = text
            .split(/(?:Rp\.?|IDR)\s*[\d.]+/i)[0]
            .replace(/\b(?:beli|buy|pilih|select|diskon|promo|flashsale|termurah|best seller|out of stock)\b/gi, "")
            .replace(/-\d+%/g, "")
            .trim();

          if (!produk || produk.length < 2 || produk.length > 80) continue;

          const key = `${produk.toLowerCase()}|${harga.toLowerCase()}`;
          if (!seen.has(key)) {
            seen.add(key);
            items.push({ Produk: produk, Harga: harga });
          }
        }
        return items;
      });
    }

    if (!collectedRawRows.length) return null;

    const seen = new Set();
    const rows = [];
    for (const item of collectedRawRows) {
      const key = `${item.Produk.toLowerCase()}|${item.Harga.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        rows.push(item);
      }
    }

    const finalRows = rows.map((row, index) => ({
      No: index + 1,
      ...row,
      Sumber: url.href,
      _usedAiFallback: false,
    }));
    finalRows._usedAiFallback = false;
    return finalRows;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

module.exports = {
  REAL_BROWSER_DOMAINS,
  scrapeWithRealBrowser,
};
