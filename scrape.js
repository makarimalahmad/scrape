const { chromium } = require("./playwright");
const fs = require("fs");
const path = require("path");
const readline = require("readline/promises");
const { validateScrapeResults } = require("./validate-results");

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

function validateUrl(value) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error("URL harus memakai HTTP atau HTTPS.");
  return url;
}

function normalizeTokopediaUrl(value, gameId = null) {
  const url = value instanceof URL ? new URL(value.href) : validateUrl(value);
  const hostname = url.hostname.replace(/^www\./, "").toLowerCase();
  if (hostname !== "tokopedia.com") return url;

  const gameSlugs = {
    "mobile-legends": "mobile-legends-bang-bang",
    "free-fire": "free-fire",
    roblox: "roblox",
  };
  let slug = gameSlugs[gameId];
  if (!slug) {
    const pathText = decodeURIComponent(url.pathname).toLowerCase();
    if (/mobile[-_ ]?legends|\bmlbb\b/.test(pathText)) {
      slug = gameSlugs["mobile-legends"];
    } else if (/free[-_ ]?fire/.test(pathText)) {
      slug = gameSlugs["free-fire"];
    } else if (/roblox|robux/.test(pathText)) {
      slug = gameSlugs.roblox;
    }
  }
  if (!slug) return url;

  return new URL(`https://www.tokopedia.com/digital/voucher-game/${slug}`);
}

function createOutputName(url) {
  const domain = url.hostname
    .replace(/^www\./, "")
    .replace(/[^a-z0-9]+/gi, "-");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${domain}-${timestamp}`;
}

function parseUPointCardText(text) {
  const cleanText = String(text || "").replace(/\s+/g, " ").trim();
  const match = cleanText.match(/^(.+?)\s+from\s+(\d{1,3}(?:\.\d{3})+)$/i);
  if (!match || Number(match[2].replace(/\./g, "")) <= 0) return null;
  return { Produk: match[1].trim(), Harga: `Rp ${match[2]}` };
}

function parseDuniaGamesCardText(text, productName, priceText = null) {
  const cleanText = String(text || "").replace(/\s+/g, " ").trim();
  const product = String(productName || "").replace(/\s+/g, " ").trim();
  const explicitPrice = String(priceText || "").replace(/\s+/g, " ").trim();
  const prices = cleanText.match(/\b\d{1,3}(?:\.\d{3})*\b/g) || [];
  const price = explicitPrice.match(/^\d{1,3}(?:\.\d{3})*$/)?.[0] || prices.at(-1);
  if (!product || !price || Number(price.replace(/\./g, "")) <= 0) return null;
  return { Produk: product, Harga: `Rp ${price}` };
}

function parseUniPinCardText(text) {
  const cleanText = String(text || "").replace(/\s+/g, " ").trim();
  const price = cleanText.match(/\bIDR\s*(\d[\d.]*)\b/i);
  if (!price || Number(price[1].replace(/\./g, "")) <= 0) return null;
  const product = cleanText.slice(0, price.index).trim();
  if (!product || /^total$/i.test(product)) return null;
  return { Produk: product, Harga: `IDR ${price[1]}` };
}

function normalizeMobapayProductName(name, pathname) {
  const product = String(name || "").replace(/\s+/g, " ").trim();
  if (!/\/mlbb(?:\/|$)/i.test(pathname)) return product;
  if (/^\d[\d.,]*(?:\s*\+\s*\d[\d.,]*)?$/.test(product)) {
    return `${product} Diamonds`;
  }
  return product;
}

async function extractKiosgamerRows(page) {
  const apiUrl =
    "https://kiosgamer.co.id/api/shop/apps/channels?app_id=100067&region=CO.ID&language=id";
  const response = await page.request.get(apiUrl);
  if (!response.ok()) return [];

  const data = await response.json();
  const qrisChannel = data.channels?.find((channel) => channel.name === "QRIS");
  if (!qrisChannel?.items) return [];

  return qrisChannel.items
    .filter((item) => item.app_point_amount > 0 || item.rebate_card?.name)
    .map((item) => ({
      Produk: item.rebate_card?.name || `${item.app_point_amount} Diamonds`,
      Harga: `Rp ${Number(item.currency_amount).toLocaleString("id-ID")}`,
    }));
}

async function extractUPointRows(page) {
  return page.locator(".cursor-pointer").evaluateAll((cards) =>
    cards
      .map((card) => card.innerText?.replace(/\s+/g, " ").trim() || "")
      .map((text) => {
        const match = text.match(/^(.+?)\s+from\s+(\d{1,3}(?:\.\d{3})+)$/i);
        if (!match || Number(match[2].replace(/\./g, "")) <= 0) return null;
        return { Produk: match[1].trim(), Harga: `Rp ${match[2]}` };
      })
      .filter(Boolean),
  );
}

async function extractDuniaGamesRows(page) {
  const ready = await page
    .waitForFunction(
      () =>
        Array.from(document.querySelectorAll(".denom")).some((card) => {
          const product = card.querySelector(".head-dnm")?.textContent?.trim();
          const price = card.querySelector(".price-dnm .pr")?.textContent?.trim();
          return Boolean(product && /^\d{1,3}(?:\.\d{3})*$/.test(price || ""));
        }),
      null,
      { timeout: 30_000, polling: 250 },
    )
    .then(() => true)
    .catch(() => false);
  if (!ready) return [];

  return page.locator(".denom").evaluateAll((cards) =>
    cards
      .map((card) => {
        const product = card.querySelector(".head-dnm")?.textContent
          ?.replace(/\s+/g, " ")
          .trim();
        const price = card.querySelector(".price-dnm .pr")?.textContent
          ?.replace(/\s+/g, " ")
          .trim();
        if (
          !product ||
          !/^\d{1,3}(?:\.\d{3})*$/.test(price || "") ||
          Number(price.replace(/\./g, "")) <= 0
        ) {
          return null;
        }
        return { Produk: product, Harga: `Rp ${price}` };
      })
      .filter(Boolean),
  );
}

async function extractUniPinRows(page) {
  return page.locator(".denom-container > button").evaluateAll((cards) =>
    cards
      .map((card) => {
        const text = card.innerText?.replace(/\s+/g, " ").trim() || "";
        const price = text.match(/\bIDR\s*(\d[\d.]*)\b/i);
        if (!price || Number(price[1].replace(/\./g, "")) <= 0) return null;
        const product = text.slice(0, price.index).trim();
        if (!product || /^total$/i.test(product)) return null;
        return { Produk: product, Harga: `IDR ${price[1]}` };
      })
      .filter(Boolean),
  );
}

function extractProductPairsFromJson(data) {
  const results = [];
  const seen = new Set();

  function scan(obj, depth = 0) {
    if (!obj || depth > 10) return;
    if (Array.isArray(obj)) {
      for (const item of obj) scan(item, depth + 1);
    } else if (typeof obj === "object") {
      const name =
        obj.name || obj.internalName || obj.product_name || obj.title || obj.slug;
      const rawPrice =
        (typeof obj.price === "object" && obj.price !== null
          ? obj.price.current ?? obj.price.finalPrice ?? obj.price.nominal
          : obj.price) ??
        obj.nominal ??
        obj.final_price ??
        obj.selling_price;

      if (typeof name === "string" && rawPrice !== undefined && rawPrice !== null) {
        const numPrice =
          typeof rawPrice === "number"
            ? rawPrice
            : Number(String(rawPrice).replace(/[^\d]/g, ""));

        if (numPrice > 0 && numPrice < 100_000_000) {
          if (
            /(?:diamond|\bdm\b|robux|roblox|pass|membership|member|voucher|uc|point|coin|token)/i.test(
              name,
            )
          ) {
            const key = `${name.trim().toLowerCase()}|${numPrice}`;
            if (!seen.has(key)) {
              seen.add(key);
              results.push({
                Produk: name.trim(),
                Harga: `Rp ${numPrice.toLocaleString("id-ID")}`,
              });
            }
          }
        }
      }
      for (const val of Object.values(obj)) {
        if (typeof val === "object" && val !== null) {
          scan(val, depth + 1);
        }
      }
    }
  }

  scan(data);
  return results;
}

async function extractVcgamersRows(page) {
  const nextData = await page
    .evaluate(() => {
      const el = document.getElementById("__NEXT_DATA__");
      return el ? JSON.parse(el.textContent) : null;
    })
    .catch(() => null);

  if (nextData) {
    const rows = extractProductPairsFromJson(nextData);
    if (rows.length) return rows;
  }
  return [];
}

function parseBlibliOptionText(text) {
  const cleanText = String(text || "").replace(/\s+/g, " ").trim();
  const price = cleanText.match(/Rp\s*\d[\d.]*/i);
  if (!price || Number(price[0].replace(/\D/g, "")) <= 0) return null;
  const product = cleanText.slice(0, price.index).trim();
  if (!product) return null;
  return { Produk: product, Harga: price[0] };
}

async function extractBlibliRows(page, interceptedPayloads = []) {
  const blibliApi = interceptedPayloads.find((r) =>
    r.url.includes("/backend/digital-product/products"),
  );
  if (blibliApi?.data) {
    const apiRows = extractProductPairsFromJson(blibliApi.data);
    if (apiRows.length) return apiRows;
  }

  const ready = await page
    .waitForFunction(
      () => {
        const containers = document.querySelectorAll(".blu-field__container");
        for (const container of containers) {
          const label = container.querySelector(".blu-field__label");
          if (label && /produk/i.test(label.textContent)) {
            const input = container.querySelector("input");
            return Boolean(input?.value?.trim());
          }
        }
        return false;
      },
      null,
      { timeout: 30_000, polling: 250 },
    )
    .then(() => true)
    .catch(() => false);
  if (!ready) return [];

  const produkContainer = page
    .locator(".blu-field__container")
    .filter({ has: page.locator(".blu-field__label", { hasText: /^Produk$/i }) });
  const produkInput = produkContainer.locator("input");
  const options = page.locator(".blu-dropdown-tray .blu-list");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await produkInput.click({ force: true, timeout: 2_000 }).catch(() => {});
    await page.waitForTimeout(500);
    if ((await options.count()) > 0) break;
  }
  if (!(await options.count())) return [];

  const activeTray = page
    .locator(".blu-dropdown-tray")
    .filter({ has: page.locator(".blu-list") })
    .first();

  const seen = new Set();
  const rows = [];

  const collectVisible = async () => {
    const items = await options.evaluateAll((elements) =>
      elements
        .map((item) => {
          const text = item.textContent?.replace(/\s+/g, " ").trim();
          return text;
        })
        .filter(Boolean),
    );
    for (const text of items) {
      const parsed = parseBlibliOptionText(text);
      if (parsed) {
        const key = `${parsed.Produk}|${parsed.Harga}`;
        if (!seen.has(key)) {
          seen.add(key);
          rows.push(parsed);
        }
      }
    }
  };

  // Scroll to top first
  await activeTray.evaluate((el) => (el.scrollTop = 0)).catch(() => {});
  await page.waitForTimeout(300);
  await collectVisible();

  // Scroll down incrementally until no new items appear
  for (let i = 0; i < 50; i += 1) {
    const prevCount = rows.length;
    await activeTray.evaluate((el) => (el.scrollTop += 200)).catch(() => {});
    await page.waitForTimeout(200);
    await collectVisible();
    const atBottom = await activeTray
      .evaluate((el) => el.scrollTop + el.clientHeight >= el.scrollHeight - 5)
      .catch(() => true);
    if (atBottom && rows.length === prevCount) break;
  }

  return rows;
}

async function extractTokopediaRows(page) {
  const rows = [];
  const seen = new Set();
  const consentButton = page.getByText("Saya mengerti", { exact: true });
  if (await consentButton.count()) {
    await consentButton.click({ force: true }).catch(() => {});
    await page.waitForTimeout(250);
  }

  const tabs = page.locator('[role="tab"]');
  const tabCount = await tabs.count();

  for (let index = 0; index < tabCount; index += 1) {
    const tab = tabs.nth(index);
    let active = (await tab.getAttribute("data-state")) === "active";

    for (let attempt = 0; !active && attempt < 3; attempt += 1) {
      await tab.click({ force: true, timeout: 2_000 }).catch(() => {});
      active = await page
        .waitForFunction(
          ([tabIndex]) =>
            document.querySelectorAll('[role="tab"]')[tabIndex]?.getAttribute(
              "data-state",
            ) === "active",
          [index],
          { timeout: 1_500, polling: 100 },
        )
        .then(() => true)
        .catch(() => false);
    }

    if (!active) continue;
    await page.waitForTimeout(300);

    const tabRows = await page
      .locator('[role="tabpanel"][data-state="active"] > div')
      .evaluateAll((cards) =>
        cards
          .map((card) => {
            const product = card.querySelector("h3")?.textContent
              ?.replace(/\s+/g, " ")
              .trim();
            const text = card.textContent?.replace(/\s+/g, " ").trim() || "";
            const price = text.match(/Rp\s*\d[\d.]*/i)?.[0];
            return product && price ? { Produk: product, Harga: price } : null;
          })
          .filter(Boolean),
      );

    for (const row of tabRows) {
      const key = `${row.Produk.toLowerCase()}|${row.Harga.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
    }
  }

  return rows;
}

async function extractGopayRows(page) {
  return page.locator('[id^="variant-"] .grid > div').evaluateAll((cards) =>
    cards.map((card) => {
      const product = card.querySelector("h3")?.innerText?.trim();
      const prices = card.innerText?.match(/Rp\s*[\d.]+/gi) || [];
      return { Produk: product, Harga: prices[0] };
    }),
  );
}

function parseRobloxProductCard(text) {
  const cleanText = String(text || "").replace(/\s+/g, " ").trim();
  const amountMatch = cleanText.match(/^([\d.,]+)/);
  const priceMatch = cleanText.match(/(?:Rp\.?|IDR)\s*([\d.,]+)\s*(rb|ribu|jt|juta)?/i);
  if (!amountMatch || !priceMatch) return null;

  const amount = Number(amountMatch[1].replace(/[.,]/g, ""));
  const suffix = String(priceMatch[2] || "").toLowerCase();
  const decimalPrice = Number(
    priceMatch[1]
      .replace(/\.(?=\d{3}(?:\D|$))/g, "")
      .replace(",", "."),
  );
  const multiplier = /^(?:rb|ribu)$/.test(suffix)
    ? 1_000
    : /^(?:jt|juta)$/.test(suffix)
      ? 1_000_000
      : 1;
  const price = Math.round(decimalPrice * multiplier);
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(price) || price <= 0) {
    return null;
  }

  return {
    Produk: `${amount} Robux`,
    Harga: `Rp ${price.toLocaleString("id-ID")}`,
  };
}

async function extractRobloxRows(page) {
  const cards = page.locator("[data-product-id]");
  const ready = await cards
    .filter({ hasText: /(?:Rp\.?|IDR)\s*[\d.,]+\s*(?:rb|ribu|jt|juta)?/i })
    .first()
    .waitFor({ state: "visible", timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  if (!ready) return [];

  const cardData = await cards.evaluateAll((elements) =>
    elements.map((card) => ({
      productId: card.getAttribute("data-product-id"),
      text: card.innerText?.replace(/\s+/g, " ").trim() || "",
    })),
  );
  const rows = [];
  const seen = new Set();
  for (const card of cardData) {
    const row = parseRobloxProductCard(card.text);
    if (!row) continue;
    const key = card.productId || `${row.Produk}|${row.Harga}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(row);
  }
  return rows;
}

async function extractEbelanjaRows(page) {
  const showMore = page.getByRole("button", { name: /Muat Lainnya/i });
  for (let attempt = 0; attempt < 10 && await showMore.count(); attempt += 1) {
    if (!await showMore.isVisible().catch(() => false)) break;
    await showMore.click().catch(() => {});
    await page.waitForTimeout(500);
  }

  const cards = page.locator(".box-border.cursor-pointer");
  return cards.evaluateAll((elements) =>
    elements.map((card) => {
      const text = card.innerText?.replace(/\s+/g, " ").trim() || "";
      const product = text
        .replace(/^PROMO\s*/i, "")
        .split(/Rp\s*[\d.]+/i)[0]
        .trim();
      const price = text.match(/Rp\s*[\d.]+/i)?.[0];
      return { Produk: product, Harga: price };
    }),
  );
}

async function extractShopeeRows(page) {
  const rows = [];
  const productPicker = page.getByText(/Pilih Nominal (?:Roblox|Free Fire)/i, {
    exact: true,
  }).first();
  const pickerReady = await productPicker
    .waitFor({ state: "visible", timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  if (pickerReady) {
    await productPicker.click().catch(() => {});
    await page
      .locator("li")
      .filter({ hasText: /Roblox Gift Card|Diamonds?/i })
      .first()
      .waitFor({ state: "visible", timeout: 10_000 })
      .catch(() => {});
    const optionRows = await page.locator("li").evaluateAll((options) =>
      options.map((option) => {
        const text = option.innerText?.replace(/\s+/g, " ").trim() || "";
        const product = text.match(
          /(?:Rp[\d.]+,-\s+Roblox Gift Card|\d[\d.]*\s+Diamonds?)/i,
        )?.[0];
        const prices = text.match(/Rp\s*[\d.]+/gi) || [];
        return { Produk: product, Harga: prices[prices.length - 1] };
      }),
    );
    rows.push(...optionRows.filter((row) => row.Produk && row.Harga));
  }

  if (rows.length) return rows;

  const bodyText = await page.locator("body").innerText();
  const diamondSection = bodyText.match(
    /Jumlah Diamond\s+Harga([\s\S]*?)(?:Untuk membeli item|Cara\s+redeem)/i,
  )?.[1];
  if (!diamondSection) return [];

  const diamondPattern = /(\d[\d.]*)\s+Diamonds?\s+(Rp\s*[\d.]+)/gi;
  for (const match of diamondSection.matchAll(diamondPattern)) {
    rows.push({ Produk: `${match[1]} Diamonds`, Harga: match[2] });
  }
  return rows;
}

function parseDitusiProductRows(bodyText) {
  const markerMatches = Array.from(
    String(bodyText || "").matchAll(
      /Pilih Item Top Up (?:Free Fire|Roblox\s*-\s*Login)/gi,
    ),
  );
  const marker = markerMatches.at(-1);
  if (!marker) return [];
  const section = bodyText.slice(marker.index + marker[0].length);
  const rows = [];
  const lines = section.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const productPattern = /^\d[\d.]*\s+(?:Diamonds?|Robux)(?:\s+USN)?(?:\s*\+\s*\(Bonus\s+\d[\d.]*\))?$/i;

  for (let index = 0; index < lines.length; index += 1) {
    if (!productPattern.test(lines[index])) continue;

    const prices = [];
    for (let next = index + 1; next < lines.length; next += 1) {
      if (productPattern.test(lines[next])) break;
      if (/^RM\b/i.test(lines[next])) break;
      if (/^Rp\.?\s*[\d.]+$/i.test(lines[next])) prices.push(lines[next]);
    }
    if (prices.length) {
      rows.push({ Produk: lines[index], Harga: prices[prices.length - 1] });
    }
  }
  return rows;
}

async function extractDitusiRows(page) {
  const ready = await page
    .waitForFunction(
      () =>
        /Pilih Item Top Up Roblox\s*-\s*Login[\s\S]*?\d[\d.]*\s+Robux(?:\s+USN)?[\s\S]*?Rp\.?\s*[\d.]+/i.test(
          document.body?.innerText || "",
        ) ||
        /Pilih Item Top Up Free Fire[\s\S]*?\d[\d.]*\s+Diamonds?[\s\S]*?Rp\.?\s*[\d.]+/i.test(
          document.body?.innerText || "",
        ),
      null,
      { timeout: 30_000, polling: 250 },
    )
    .then(() => true)
    .catch(() => false);
  if (!ready) return [];
  return parseDitusiProductRows(await page.locator("body").innerText());
}

async function extractVexagameRows(page) {
  return page.locator('#diamond-cards [role="option"]').evaluateAll((cards) =>
    cards.map((card) => {
      const text = card.innerText?.replace(/\s+/g, " ").trim() || "";
      const prices = text.match(/Rp\s*[\d.]+/gi) || [];
      const product = card.querySelector("p")?.innerText?.trim();
      return { Produk: product, Harga: prices[prices.length - 1] };
    }),
  );
}

async function extractUnipinRobloxRows(page) {
  const bodyText = await page.locator("body").innerText();
  const section = bodyText.match(
    /Pilih Jumlah([\s\S]*?)(?:Pilih Saluran Pembayaran|Checkout)/i,
  )?.[1];
  if (!section) return [];

  const rows = [];
  const pattern = /Rp([\d.]+),?-?\s+Roblox Gift Card\s+IDR\s*([\d.]+)/gi;
  for (const match of section.matchAll(pattern)) {
    rows.push({
      Produk: `Roblox IDR ${match[1]}`,
      Harga: `IDR ${match[2]}`,
    });
  }
  return rows;
}

async function extractSpecialRows(page, url, interceptedPayloads = []) {
  const hostname = url.hostname.replace(/^www\./, "");
  if (hostname === "upoint.id") return extractUPointRows(page);
  if (hostname === "duniagames.co.id") return extractDuniaGamesRows(page);
  if (hostname === "unipin.com" && !/roblox/i.test(url.pathname)) {
    return extractUniPinRows(page);
  }
  if (hostname === "tokopedia.com") return extractTokopediaRows(page);
  if (hostname === "blibli.com") return extractBlibliRows(page, interceptedPayloads);
  if (hostname === "vcgamers.com") return extractVcgamersRows(page);
  if (hostname === "roblox.com") return extractRobloxRows(page);
  if (hostname === "kiosgamer.co.id") return extractKiosgamerRows(page);
  if (hostname === "gopay.co.id") return extractGopayRows(page);
  if (hostname === "topup.ebelanja.id") return extractEbelanjaRows(page);
  if (hostname === "shopee.co.id") return extractShopeeRows(page);
  if (hostname === "ditusi.co.id") return extractDitusiRows(page);
  if (hostname === "vexagame.com") return extractVexagameRows(page);
  if (hostname === "unipin.com" && /roblox/i.test(url.pathname)) {
    return extractUnipinRobloxRows(page);
  }
  return null;
}

async function createOptimizedContext(browser) {
  return browser.newContext({
    locale: "id-ID",
    timezoneId: "Asia/Jakarta",
  });
}

const CLOUDFLARE_CHALLENGE_PATTERN =
  /sorry, you have been blocked|attention required|access denied|captcha|cloudflare ray id|melakukan verifikasi keamanan|verifikasi bahwa anda/i;

async function findTurnstileFrame(page, timeout = 1_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const frame = page
      .frames()
      .find((candidate) =>
        candidate.url().includes("challenges.cloudflare.com"),
      );
    if (frame) return frame;
    await page.waitForTimeout(100);
  }
  return null;
}

async function pageShowsCloudflareChallenge(page) {
  const title = await page.title().catch(() => "");
  const bodyText = await page.locator("body").innerText().catch(() => "");
  return CLOUDFLARE_CHALLENGE_PATTERN.test(`${title}\n${bodyText}`);
}

async function clickTurnstileFrame(page, frame) {
  const targets = [
    frame.locator('input[type="checkbox"]'),
    frame.locator('[role="checkbox"]'),
    frame.locator(".ctp-checkbox-label"),
    frame.locator("label").filter({ hasText: /verifikasi|verify|human/i }),
  ];

  for (const target of targets) {
    const visible = await target.first().isVisible().catch(() => false);
    if (!visible) continue;
    const clicked = await target
      .first()
      .click({ delay: 75 + Math.random() * 75, timeout: 1_000 })
      .then(() => true)
      .catch(() => false);
    if (clicked) return true;
  }

  const frameElement = await frame.frameElement().catch(() => null);
  const box = await frameElement?.boundingBox().catch(() => null);
  if (!box) return false;

  await page.mouse.click(
    box.x + Math.min(28, box.width / 2),
    box.y + box.height / 2,
    { delay: 75 + Math.random() * 75 },
  );
  return true;
}

async function solveCloudflareChallenge(
  page,
  { timeout = 120_000, maxClicks = Number.POSITIVE_INFINITY } = {},
) {
  const deadline = Date.now() + timeout;
  let clearSince = null;
  let clickCount = 0;
  let lastClickAt = 0;

  while (Date.now() < deadline) {
    if (!(await pageShowsCloudflareChallenge(page))) {
      clearSince ??= Date.now();
      if (Date.now() - clearSince >= 1_500) {
        return { passed: true, clickCount };
      }
      await page.waitForTimeout(100);
      continue;
    }

    clearSince = null;
    if (clickCount >= maxClicks) {
      return { passed: false, clickCount, clickLimitReached: true };
    }

    const waitBeforeNextClick = 1_750 - (Date.now() - lastClickAt);
    if (waitBeforeNextClick > 0) {
      await page.waitForTimeout(Math.min(waitBeforeNextClick, 250));
      continue;
    }

    const frame = await findTurnstileFrame(
      page,
      Math.min(1_000, Math.max(100, deadline - Date.now())),
    );
    if (!frame) continue;

    if (await clickTurnstileFrame(page, frame)) {
      clickCount += 1;
      lastClickAt = Date.now();
      console.log(`Klik checkbox Cloudflare (${clickCount})...`);
    } else {
      await page.waitForTimeout(100);
    }
  }

  return { passed: false, clickCount };
}

async function waitForProductData(page, timeout = 20_000, hostname = "") {
  const domain = hostname.replace(/^www\./, "");
  const readinessSelectors = {
    "upoint.id": ".cursor-pointer",
    "duniagames.co.id": ".denom .price-dnm .pr",
    "unipin.com": ".denom-container > button",
  };
  const readinessSelector = readinessSelectors[domain];
  if (readinessSelector) {
    const ready = await page
      .locator(readinessSelector)
      .filter({ hasText: /(?:from\s+\d{1,3}(?:\.\d{3})+|IDR\s*[1-9]\d*|^\s*[1-9]\d{0,2}(?:\.\d{3})*\s*$)/i })
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
        const challengeVisible = /sorry, you have been blocked|attention required|access denied|captcha|cloudflare ray id|melakukan verifikasi keamanan|verifikasi bahwa anda/i.test(
          text,
        );
        const hasPrice = /(?:Rp\.?|IDR|USD|US\$|\$|RM)\s*\d/i.test(text);
        const hasProduct = /(?:diamond|\bdm\b|pass|pack|card|member|membership|robux|voucher|\buc\b|point|token|crystal|gold|coin|credit)/i.test(
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

async function scrape(url, selector, headed, options = {}) {
  const ownsBrowser = !options.browser;
  const browser = options.browser || await chromium.launch({ headless: !headed });
  let context = null;

  try {
    context = await createOptimizedContext(browser);
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
    await page.locator("body").waitFor({ state: "visible", timeout: 15_000 });

    if (response?.status() === 403 || (await pageShowsCloudflareChallenge(page))) {
      const isDitusi = url.hostname.replace(/^www\./, "") === "ditusi.co.id";
      const challenge = await solveCloudflareChallenge(page, {
        timeout: 120_000,
        maxClicks: isDitusi ? 2 : Number.POSITIVE_INFINITY,
      });
      if (!challenge.passed) {
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
      await waitForProductData(page, 10_000, url.hostname);
    }

    if (/ourastore\.com$/i.test(url.hostname)) {
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
            { timeout: 15_000 },
          )
          .then(() => true)
          .catch(() => false);

      const productsReady = await waitForProductCards();
      if (!productsReady) {
        throw new Error(
          "API produk situs tidak selesai dimuat dalam 15 detik.",
        );
      }
    } else {
      await waitForProductData(page, 20_000, url.hostname);
    }

    let specialRows = await extractSpecialRows(page, url, interceptedPayloads);
    if (!specialRows?.length) specialRows = null;

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
      if (!danaRows.length) danaRows = null;
    }

    if (url.hostname.endsWith("lootbar.com")) {
      const closeCoupon = page.locator("button.dialog-coupon-close");
      if (await closeCoupon.count()) {
        await closeCoupon.click().catch(() => {});
        await page.waitForTimeout(1_000);
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
    await page.waitForTimeout(300);

function evaluateDomProducts({ defaultSelector, hostname, pathname }) {
  const priceRegex =
    /(?:Rp\.?|IDR|USD|US\$|\$|RM)\s*\d[\d.,]*/gi;
  const clean = (str) => str?.replace(/\s+/g, " ").trim() || "";
  const results = [];
  const seen = new Set();
  let selectorValid = true;

  const noisePattern =
    /^(?:potongan penuh|hemat|biaya admin|harga awal|total bayar|gimcashback|memakai|kirim pesanan|10% s\.d\.|4\.9|min\.?$)/i;
  const paymentNoise =
    /(?:cashback|ewallet|mbanking|transfer bank|tranfer bank|gerai ritel|alfamart|saldo reseller|qris|qr kode|\bva\b)/i;
  const recommendationNoise =
    /(?:arena of valor|call of duty|free fire max|speed drifters|\bundawn\b)/i;

  const isTaxExcluded =
    hostname.endsWith("codashop.com") ||
    /pajak akan dikenakan|belum termasuk (?:pajak|ppn)|sebelum pajak|excl(?:ude)?\.?\s*tax/i.test(
      document.body?.innerText || "",
    );

  const pushRow = (product, harga) => {
    const cleanProduct = clean(product);
    let cleanHarga = clean(harga);
    if (!cleanProduct || !cleanHarga || cleanProduct.length > 200) return;
    const digits = cleanHarga.replace(/[^\d]/g, "");
    if (!digits || Number(digits) <= 0) return;
    if (
      noisePattern.test(cleanProduct) ||
      paymentNoise.test(cleanProduct) ||
      recommendationNoise.test(cleanProduct)
    )
      return;

    // Normalisasi Pajak (PPN 11%): Menyesuaikan harga display sebelum pajak menjadi harga final
    if (isTaxExcluded) {
      const rawNumber = Number(digits);
      const withTax = Math.round(rawNumber * 1.11);
      cleanHarga = cleanHarga.replace(
        /\d[\d.,]*/,
        withTax.toLocaleString("id-ID"),
      );
    }

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
  const isLootbar = hostname.endsWith("lootbar.com");
  const isGogogo = hostname.endsWith("gogogo.id");
  const productSelector = hostname.endsWith("upoint.id")
    ? ".cursor-pointer"
    : isDuniaGamesRoblox
      ? ".denom"
      : isItemku
        ? ".grid > .h-full > .group.cursor-pointer"
        : isDana
          ? "button.product-detail-v3-package__item"
          : isLootbar
            ? "li.topup-list-con-item"
            : isGogogo
              ? '[data-testid^="qa-product-item-card-container-"]'
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
    const isLootbarCard =
      isLootbar && card.matches("li.topup-list-con-item");
    const isGogogoCard =
      isGogogo &&
      card.matches('[data-testid^="qa-product-item-card-container-"]');
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
    const lootbarName = isLootbarCard
      ? clean(card.querySelector(".topup-name")?.innerText)
      : "";
    const lootbarPrice = isLootbarCard
      ? clean(card.querySelector(".discount-price")?.innerText)
      : null;
    const gogogoName = isGogogoCard
      ? clean(
        card.querySelector('[data-testid^="qa-product-item-card-name-"]')
          ?.innerText,
      )
      : "";
    const gogogoPrice = isGogogoCard
      ? clean(
        card.querySelector(
          '[data-testid^="qa-product-item-card-current-price-"]',
        )?.innerText,
      )
      : null;
    const effectivePrice = isMobapayCard || isDuniaGamesCard
      ? prices[prices.length - 1]
      : gogogoPrice || lootbarPrice || danaPrice || itemkuPrice || robloxTransactionPrice || upointPrice || prices[0];
    let name = isUpointCard
      ? upointParts[0].trim()
      : isDuniaGamesCard
        ? duniaGamesName
        : isDanaCard
          ? danaName
          : isLootbarCard
            ? lootbarName
            : isGogogoCard
              ? gogogoName
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
      !isDanaCard &&
      !isLootbarCard &&
      !isGogogoCard
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
    if (
      isMobapayCard &&
      /\/mlbb(?:\/|$)/i.test(pathname) &&
      /^\d[\d.,]*(?:\s*\+\s*\d[\d.,]*)?$/.test(name)
    ) {
      name = `${name} Diamonds`;
    }

    if (name) pushRow(name, effectivePrice);
  }

  if (!results.length) {
    let elements = [];
    try {
      elements = Array.from(document.querySelectorAll(defaultSelector));
    } catch {
      selectorValid = false;
    }
    for (const element of elements) {
      const text = clean(element.innerText);
      if (!text || text.length > 180) continue;

      const prices = text.match(priceRegex);
      if (!prices || !prices.length) continue;

      const harga = prices[0];
      let produk = text;
      prices.forEach((p) => {
        produk = produk.replace(p, "");
      });
      produk = produk
        .replace(/-\d+\s*%/gi, "")
        .replace(/\d+\s*%\s*off/gi, "")
        .replace(/(?:beli|buy|pilih|select|diskon|promo)/gi, "")
        .trim();
      pushRow(produk, harga);
    }
  }

  if (!selectorValid) {
    throw new Error("Selector kartu produk tidak valid.");
  }

  if (!results.length) {
    const linePriceRegex =
      /^(?:Rp\.?|IDR|USD|US\$|\$|RM)\s*\d[\d.,]*$/i;
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
}

    let genericRows = null;
    if (!specialRows && !danaRows) {
      const categoryTabSelector = [
        '[role="tab"]',
        '.swiper-slide button',
        '.listproduct-categorybar button',
        '[class*="categorybar"] button',
        '[class*="category-bar"] button',
        '[class*="product-category"] button',
        '[class*="tab-item"]',
        '.nav-tabs button',
        '.nav-pills button',
        '[class*="tab_content"] button',
        '[class*="category"] button',
        '[class*="tab"] button',
      ].join(", ");

      const categoryTabs = page
        .locator(categoryTabSelector)
        .filter({
          hasNotText: /(?:Rp\.?|IDR|\$)\s*\d/i,
        })
        .filter({
          hasNotText:
            /^(?:login|masuk|daftar|beli|bayar|checkout|cari|search|cart|keranjang|kontak|faq|panduan|cara|pesanan|region)$/i,
        })
        .filter({
          hasNotText:
            /(?:metode|tersedia|ewallet|qris|bank|transfer|payment|pembayaran|gerai|alfamart|indomaret)/i,
        });
      const tabCount = await categoryTabs.count();

      if (tabCount > 1) {
        genericRows = [];
        const seenKeys = new Set();
        for (let i = 0; i < tabCount; i += 1) {
          const tab = categoryTabs.nth(i);
          await tab.click({ force: true }).catch(() => {});
          await page.waitForTimeout(400);
          const tabRows = await page.evaluate(evaluateDomProducts, {
            defaultSelector: selector,
            hostname: url.hostname,
            pathname: url.pathname,
          });
          for (const row of tabRows) {
            const key = `${row.Produk.toLowerCase()}|${row.Harga.toLowerCase()}`;
            if (!seenKeys.has(key)) {
              seenKeys.add(key);
              genericRows.push(row);
            }
          }
        }
      } else {
        genericRows = await page.evaluate(evaluateDomProducts, {
          defaultSelector: selector,
          hostname: url.hostname,
          pathname: url.pathname,
        });
      }
    }

    const rows = specialRows ?? danaRows ?? genericRows ?? [];
    if (!rows.length) {
      throw new Error(
        "Data harga tidak ditemukan. Coba gunakan --selector dengan selector kartu produk.",
      );
    }
    return rows.map((row, index) => ({
      No: index + 1,
      ...row,
      Sumber: url.href,
    }));
  } finally {
    if (context) await context.close().catch(() => {});
    if (ownsBrowser) await browser.close().catch(() => {});
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

function saveInvalidReport(output, url, validation, rows) {
  const reportPath = path.resolve(`${output}.invalid.json`);
  const report = {
    url: url.href,
    checkedAt: new Date().toISOString(),
    validation,
    sample: rows.slice(0, 10),
  };

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  return reportPath;
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

module.exports = {
  DEFAULT_SELECTOR,
  exportCsv,
  extractProductPairsFromJson,
  normalizeMobapayProductName,
  normalizeTokopediaUrl,
  parseBlibliOptionText,
  parseDitusiProductRows,
  parseDuniaGamesCardText,
  parseRobloxProductCard,
  parseUniPinCardText,
  parseUPointCardText,
  saveInvalidReport,
  scrape,
  validateUrl,
};
