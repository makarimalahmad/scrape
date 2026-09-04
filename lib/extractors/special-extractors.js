/**
 * Store-Specific Extractors
 * Specialized scraping logic for custom DOM structures, tabs, and APIs across Indonesian stores.
 */

const { parseBlibliOptionText, parseRobloxProductCard } = require("./parsers");
const { extractProductPairsFromJson } = require("./generic-extractor");

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

async function extractDitusiRows(page) {
  if (/roblox/i.test(page.url()) && !page.url().includes("voucher-roblox-robux")) {
    await page.goto("https://ditusi.co.id/voucher-roblox-robux", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(1_500);
  }

  await page.evaluate(() => {
    document
      .querySelectorAll(
        ".modal, .modal-backdrop, #modal-request-permission, #customModal",
      )
      .forEach((el) => el.remove());
    document.body.classList.remove("modal-open");
  });

  const rows = [];
  const seen = new Set();

  const collectVisible = async () => {
    const cards = await page.locator(".item-product-click").evaluateAll((els) =>
      els
        .filter((el) => el.offsetParent !== null)
        .map((el) => {
          const t = el.innerText.replace(/\s+/g, " ").trim();
          const prices = t.match(/Rp\.?\s*[\d.]+/gi) || [];
          const prod = t.split(/Rp\.?/i)[0].replace(/Termurah/gi, "").trim();
          return prod && prices.length ? { Produk: prod, Harga: prices[0] } : null;
        })
        .filter(Boolean),
    );
    for (const c of cards) {
      const k = `${c.Produk.toLowerCase()}|${c.Harga.toLowerCase()}`;
      if (!seen.has(k)) {
        seen.add(k);
        rows.push(c);
      }
    }
  };

  await collectVisible();

  const subTabLabels = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("#group-category-game label"))
      .map((l) => l.innerText?.trim())
      .filter(Boolean);
  });

  for (const labelText of subTabLabels) {
    if (/usd|global|foreign|sar|brl/i.test(labelText)) continue;
    await page.evaluate((txt) => {
      const lbl = Array.from(
        document.querySelectorAll("#group-category-game label"),
      ).find((l) => l.innerText?.trim() === txt);
      if (lbl) lbl.click();
    }, labelText);
    await page.waitForTimeout(1_000);
    await collectVisible();
  }

  return rows;
}

async function extractHiddengameRows(page) {
  if (
    (page.url().includes("/games/roblox") || page.url().includes("roblox")) &&
    !page.url().includes("giftcard")
  ) {
    await page.goto("https://hiddengame.id/games/roblox-giftcard", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(1_500);
  }

  const cards = page.locator("div.product-item");
  const rawList = await cards.evaluateAll((elements) =>
    elements
      .map((card) => {
        const title =
          card.querySelector("input[data-title]")?.getAttribute("data-title") ||
          card.querySelector(".product-title")?.innerText?.replace(/\s+/g, " ").trim();
        const price = card
          .querySelector(".current-price, .pricing")
          ?.innerText?.replace(/\s+/g, " ")
          .match(/Rp\s*[\d.]+/i)?.[0];
        return title && price ? { Produk: title, Harga: price } : null;
      })
      .filter(Boolean),
  );

  const seen = new Set();
  const rows = [];
  for (const item of rawList) {
    const key = `${item.Produk.toLowerCase()}|${item.Harga.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      rows.push(item);
    }
  }
  return rows;
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

async function extractDanaRows(page) {
  const buttonSelector = "button.product-detail-v3-package__item";
  await page
    .locator(buttonSelector)
    .first()
    .waitFor({ state: "attached", timeout: 15_000 })
    .catch(() => {});

  const tabs = page.locator(".product-detail-v3-package__tab");
  const tabCount = await tabs.count();

  const allProducts = [];
  const seen = new Set();

  const scrapeCurrentTab = async () => {
    const items = await page.locator(buttonSelector).evaluateAll((btns) => {
      return btns
        .map((btn) => {
          const title = btn.querySelector(".title")?.innerText?.trim();
          const price =
            btn.querySelector(".current-price")?.innerText?.trim() ||
            btn.querySelector(".price")?.innerText?.trim();
          return { Produk: title, Harga: price };
        })
        .filter((item) => item.Produk && item.Harga);
    });

    for (const item of items) {
      const key = `${item.Produk.toLowerCase()}|${item.Harga.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        allProducts.push(item);
      }
    }
  };

  if (tabCount > 0) {
    for (let i = 0; i < tabCount; i += 1) {
      const tab = tabs.nth(i);
      await tab.click().catch(() => {});
      await page.waitForTimeout(500);
      await scrapeCurrentTab();
    }
  } else {
    await scrapeCurrentTab();
  }

  return allProducts;
}

async function extractSpecialRows(page, url, interceptedPayloads = []) {
  const hostname = url.hostname.replace(/^www\./, "");
  if (hostname === "upoint.id") return extractUPointRows(page);
  if (hostname === "duniagames.co.id") return extractDuniaGamesRows(page);
  if (hostname === "dana.id") return extractDanaRows(page);
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
  if (hostname === "hiddengame.id") return extractHiddengameRows(page);
  if (hostname === "vexagame.com") return extractVexagameRows(page);
  if (hostname === "unipin.com" && /roblox/i.test(url.pathname)) {
    return extractUnipinRobloxRows(page);
  }
  return null;
}

module.exports = {
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
  extractSpecialRows,
  extractTokopediaRows,
  extractUniPinRows,
  extractUnipinRobloxRows,
  extractUPointRows,
  extractVcgamersRows,
  extractVexagameRows,
};
