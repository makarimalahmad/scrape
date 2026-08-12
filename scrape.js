const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const readline = require("readline/promises");

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

function validateUrl(value) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error("URL harus memakai HTTP atau HTTPS.");
  return url;
}

function createOutputName(url) {
  const domain = url.hostname
    .replace(/^www\./, "")
    .replace(/[^a-z0-9]+/gi, "-");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${domain}-${timestamp}`;
}

async function scrape(url, selector, headed) {
  const browser = await chromium.launch({ headless: !headed });
  const page = await browser.newPage({ locale: "id-ID" });

  try {
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
    await page.waitForTimeout(5_000);
    await page.locator("body").waitFor({ state: "visible", timeout: 30_000 });

    const blockedPattern =
      /sorry, you have been blocked|attention required|access denied|captcha|cloudflare ray id|melakukan verifikasi keamanan|verifikasi bahwa anda/i;
    const pageShowsChallenge = async () => {
      const title = await page.title();
      const bodyText = await page.locator("body").innerText();
      return blockedPattern.test(`${title}\n${bodyText}`);
    };

    if (response?.status() === 403 || (await pageShowsChallenge())) {
      if (!headed) {
        throw new Error(
          "Situs menampilkan verifikasi Cloudflare. Jalankan ulang dengan --headed untuk menyelesaikan CAPTCHA manual.",
        );
      }

      console.log(
        "Selesaikan CAPTCHA di browser. Scraper lanjut otomatis setelah halaman produk terbuka...",
      );

      const challengePassed = await page
        .waitForFunction(
          () => {
            const text = `${document.title}\n${document.body?.innerText || ""}`;
            return !/sorry, you have been blocked|attention required|access denied|captcha|cloudflare ray id|melakukan verifikasi keamanan|verifikasi bahwa anda/i.test(
              text,
            );
          },
          null,
          { timeout: 180_000 },
        )
        .then(() => true)
        .catch(() => false);

      if (!challengePassed || (await pageShowsChallenge())) {
        throw new Error(
          "Verifikasi Cloudflare tidak selesai dalam 3 menit. Coba ganti jaringan atau jalankan ulang beberapa saat lagi.",
        );
      }

      console.log("Cloudflare lolos. Menunggu produk dimuat...");
      await page.waitForTimeout(5_000);
    }

    if (/ourastore\.com$|bangjeff\.com$/i.test(url.hostname)) {
      const waitForProductCards = () =>
        page
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

      const productsReady = await waitForProductCards();
      if (!productsReady) {
        throw new Error(
          "API produk situs tidak selesai dimuat dalam 120 detik. Jangan reload karena dapat memicu Cloudflare lagi; coba jalankan ulang atau ganti jaringan.",
        );
      }
    } else {
      await page
        .waitForFunction(
          () => {
            const text = document.body?.innerText || "";
            return (
              /(?:Rp\.?|IDR)\s*\d/i.test(text) &&
              /(?:diamond|pass|pack)/i.test(text)
            );
          },
          null,
          { timeout: 30_000 },
        )
        .catch(() => {});
    }

    let danaRows = null;
    if (url.hostname.endsWith("dana.id")) {
      danaRows = [];
      const seenDanaRows = new Set();
      const tabNames = ["Best Seller", "Diamonds", "Twilight Pass"];

      for (const tabName of tabNames) {
        const tab = page.getByText(tabName, { exact: true }).first();
        if (!await tab.count()) continue;
        await tab.click().catch(() => {});
        await page.waitForTimeout(1_000);

        const tabRows = await page
          .locator("button.product-detail-v3-package__item")
          .evaluateAll((cards) => cards.map((card) => {
            const text = card.innerText?.replace(/\s+/g, " ").trim() || "";
            const prices = text.match(/Rp\.?\s*[\d.]+(?:,\d+)?/gi) || [];
            const product = card.querySelector(".title")?.innerText
              ?.replace(/\s+/g, " ")
              .trim();
            return { Produk: product, Harga: prices.at(-1) };
          }));

        for (const row of tabRows) {
          if (!row.Produk || !row.Harga) continue;
          const key = `${row.Produk.toLowerCase()}|${row.Harga.toLowerCase()}`;
          if (seenDanaRows.has(key)) continue;
          seenDanaRows.add(key);
          danaRows.push(row);
        }
      }
    }

    if (url.hostname.endsWith("mobapay.com")) {
      const expandButton = page.locator(".mobapay-scroll-recharge-arrow").first();
      if (await expandButton.count()) {
        await expandButton.click().catch(() => {});
        await page.waitForTimeout(2_000);
      }
    }

    if (url.hostname.endsWith("itemku.com")) {
      const showMoreButtons = page.getByText(/Lihat \d+ Lainnya/i);
      const buttonCount = await showMoreButtons.count();
      for (let i = 0; i < buttonCount; i += 1) {
        await showMoreButtons.nth(i).click().catch(() => {});
        await page.waitForTimeout(500);
      }
    }

    await page.evaluate(async () => {
      for (
        let position = 0;
        position < document.body.scrollHeight;
        position += 700
      ) {
        window.scrollTo(0, position);
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(2_000);

    const rows = danaRows || await page.evaluate(
      ({ defaultSelector, hostname, pathname }) => {
        const priceRegex =
          /(?:(?:Rp\.?|IDR|USD|US\$|\$|RM)\s*\d[\d.,]*)|(?:\d{1,3}(?:\.\d{3})+(?:,\d+)?)/gi;
        const clean = (str) => str?.replace(/\s+/g, " ").trim() || "";
        const results = [];
        const seen = new Set();

        const noisePattern =
          /^(?:potongan penuh|hemat|biaya admin|harga awal|gimcashback|memakai|kirim pesanan|10% s\.d\.|4\.9|min\.?$)/i;
        const paymentNoise =
          /(?:cashback|ewallet|mbanking|transfer bank|tranfer bank|gerai ritel|alfamart|saldo reseller|qris|qr kode|\bva\b)/i;
        const recommendationNoise =
          /(?:arena of valor|call of duty|free fire max|speed drifters|\bundawn\b)/i;

        const pushRow = (product, harga) => {
          const cleanProduct = clean(product);
          const cleanHarga = clean(harga);
          if (!cleanProduct || !cleanHarga || cleanProduct.length > 200) return;
          if (
            noisePattern.test(cleanProduct) ||
            paymentNoise.test(cleanProduct) ||
            recommendationNoise.test(cleanProduct)
          )
            return;
          const key = `${cleanProduct.toLowerCase()}|${cleanHarga.toLowerCase()}`;
          if (seen.has(key)) return;
          seen.add(key);
          results.push({ Produk: cleanProduct, Harga: cleanHarga });
        };

        const isDuniaGamesRoblox =
          hostname.endsWith("duniagames.co.id") &&
          pathname.includes("roblox-voucher");
        const isItemku = hostname.endsWith("itemku.com");
        const isDana = hostname.endsWith("dana.id");
        const productSelector = hostname.endsWith("upoint.id")
          ? ".cursor-pointer"
          : isDuniaGamesRoblox
            ? ".denom"
            : isItemku
              ? ".grid > .h-full > .group.cursor-pointer"
              : isDana
                ? "button.product-detail-v3-package__item"
                : '.pDRoot, .mobapay-recharge-item, [class*="recharge-item"], [class*="product-card"], .form-check-label-rounded-lg, [class*="group/variant"], .sku-card, .highlighted-sku-card, .denom-container > button';
        let productCards = [];
        try {
          productCards = Array.from(document.querySelectorAll(productSelector));
        } catch {
          productCards = [];
        }
        productCards = productCards.filter((card) => {
          const parentClass = String(card.parentElement?.className || "");
          return (
            !parentClass.includes("sku-list") &&
            !parentClass.includes("highlighted-skus__list")
          );
        });
        for (const card of productCards) {
          const text = clean(card.innerText);
          const prices = text.match(priceRegex);
          if (!prices || !prices.length) continue;

          const isMobapayCard = card.matches(
            '.mobapay-recharge-item, [class*="mobapay-recharge-item"]',
          );
          const isUpointCard = hostname.endsWith("upoint.id") && /\bfrom\b/i.test(text);
          const isDuniaGamesCard = isDuniaGamesRoblox && card.matches(".denom");
          const isRobloxStoreCard =
            (hostname.endsWith("ourastore.com") ||
              hostname.endsWith("bangjeff.com")) &&
            pathname.includes("roblox");
          const isItemkuCard = isItemku && card.matches(".group.cursor-pointer");
          const isDanaCard =
            isDana && card.matches("button.product-detail-v3-package__item");
          const upointParts = isUpointCard ? text.split(/\bfrom\b/i) : [];
          const upointPrice = isUpointCard
            ? upointParts.slice(1).join(" ").match(priceRegex)?.[0]
            : null;
          const duniaGamesName = isDuniaGamesCard
            ? clean(card.querySelector(".head-dnm")?.innerText)
            : "";
          const robloxTransactionPrice = isRobloxStoreCard
            ? text.match(/Rp\.?\s*[\d.]+(?:,\d+)?/gi)?.at(-1)
            : null;
          const itemkuPrice = isItemkuCard
            ? text.match(/Rp\.?\s*[\d.]+(?:,\d+)?/gi)?.at(-1)
            : null;
          const danaPrice = isDanaCard
            ? text.match(/Rp\.?\s*[\d.]+(?:,\d+)?/gi)?.at(-1)
            : null;
          const danaName = isDanaCard
            ? clean(card.querySelector(".title")?.innerText)
            : "";
          const effectivePrice = isMobapayCard || isDuniaGamesCard
            ? prices[prices.length - 1]
            : danaPrice || itemkuPrice || robloxTransactionPrice || upointPrice || prices[0];
          let name = isUpointCard
            ? upointParts[0].trim()
            : isDuniaGamesCard
              ? duniaGamesName
              : isDanaCard
                ? danaName
                : isItemkuCard && itemkuPrice
                  ? text.slice(0, text.lastIndexOf(itemkuPrice)).trim()
                  : isRobloxStoreCard && robloxTransactionPrice
                    ? text.slice(0, text.lastIndexOf(robloxTransactionPrice)).trim()
                    : text;
          if (
            !isUpointCard &&
            !isDuniaGamesCard &&
            !isRobloxStoreCard &&
            !isItemkuCard &&
            !isDanaCard
          ) {
            prices.forEach((p) => {
              name = name.replace(p, "");
            });
          }
          name = name
            .replace(/-\d+\s*%/gi, "")
            .replace(/\d+\s*\/\s*\d+\s*purchased/gi, "")
            .replace(/\s*-?\s*\(limited\)/gi, "")
            .replace(/\b(?:disc|diskon|promo)\b\s*\d*%?/gi, "")
            .replace(/\b(?:dari|best seller|rewards?)\b/gi, "")
            .replace(
              /\b(?:beli|buy|pilih|select|hemat|bonus|peman mencapai batas)\b/gi,
              "",
            )
            .replace(/\s+/g, " ")
            .trim();

          if (name) pushRow(name, effectivePrice);
        }

        if (!results.length) {
          const elements = Array.from(
            document.querySelectorAll(defaultSelector),
          );
          for (const element of elements) {
            const text = clean(element.innerText);
            if (!text || text.length > 180) continue;

            const prices = text.match(priceRegex);
            if (!prices || prices.length !== 1) continue;

            const harga = prices[0];
            const produk = text
              .replace(harga, "")
              .replace(/(?:beli|buy|pilih|select|diskon|promo)/gi, "")
              .trim();
            pushRow(produk, harga);
          }
        }

        if (!results.length) {
          const linePriceRegex =
            /^(?:(?:Rp\.?|IDR|USD|US\$|\$|RM)\s*\d[\d.,]*|\d{1,3}(?:\.\d{3})+(?:,\d+)?)$/i;
          const lines = (document.body.innerText || "")
            .split("\n")
            .map(clean)
            .filter(Boolean);

          for (let i = 0; i < lines.length; i += 1) {
            const line = lines[i];

            if (linePriceRegex.test(line)) {
              let produkCandidate = "";

              for (let prev = i - 1; prev >= Math.max(0, i - 4); prev -= 1) {
                const textAbove = lines[prev];
                if (
                  linePriceRegex.test(textAbove) ||
                  /^(?:-?\d+%?|%|\+\d+)$/.test(textAbove)
                )
                  continue;
                if (textAbove.length < 120) {
                  produkCandidate = textAbove;
                  break;
                }
              }

              if (produkCandidate) pushRow(produkCandidate, line);
            }
          }
        }

        return results.filter(
          (row, index, allRows) =>
            !allRows.some(
              (other, otherIndex) =>
                index !== otherIndex &&
                row.Harga === other.Harga &&
                other.Produk.length < row.Produk.length &&
                row.Produk.toLowerCase().includes(other.Produk.toLowerCase()),
            ),
        );
      },
      {
        defaultSelector: selector,
        hostname: url.hostname,
        pathname: url.pathname,
      },
    );

    if (!rows.length)
      throw new Error(
        "Data harga tidak ditemukan. Coba gunakan --selector dengan selector kartu produk.",
      );
    return rows.map((row, index) => ({
      No: index + 1,
      ...row,
      Sumber: url.href,
    }));
  } finally {
    await browser.close();
  }
}

function escapeCsv(field) {
  const str = String(field ?? "");
  if (/[";\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function exportCsv(rows, output) {
  const headers = Object.keys(rows[0]);
  const headerRow = headers.map(escapeCsv).join(";");
  const dataRows = rows.map((row) =>
    headers.map((h) => escapeCsv(row[h])).join(";"),
  );
  const csvContent = `\uFEFFsep=;\r\n${headerRow}\r\n${dataRows.join("\r\n")}`;

  const csvPath = path.resolve(`${output}.csv`);
  fs.writeFileSync(csvPath, csvContent, "utf8");
  return csvPath;
}

async function main() {
  const url = validateUrl(await getUrl());
  const selector = getArgument(
    "selector",
    '.denom, article, li, label, button, [role="radio"], [class*="product"], [class*="item"], [class*="card"], [class*="denom"]',
  );
  const output = getArgument("output", createOutputName(url));
  const headed = process.argv.includes("--headed");

  const rows = await scrape(url, selector, headed);
  const filePath = exportCsv(rows, output);
  console.table(rows);
  console.log(`Berhasil mengambil ${rows.length} data.`);
  console.log(`File CSV: ${filePath}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Gagal: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { scrape, validateUrl, exportCsv };
