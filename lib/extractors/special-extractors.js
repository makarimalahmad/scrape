/**
 * Store-Specific Extractors
 * Ekstraksi produk untuk toko dengan DOM khusus, multi-tab, atau endpoint API.
 */

const { parseBlibliOptionText, parseRobloxProductCard } = require("./parsers");
const { extractProductPairsFromJson } = require("./generic-extractor");

// Menghapus produk duplikat berdasarkan nama dan harga
function dedupeRows(items) {
  const seen = new Set();
  const rows = [];
  for (const item of items) {
    if (!item?.Produk || !item?.Harga) continue;
    const key = `${item.Produk.toLowerCase()}|${item.Harga.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      rows.push(item);
    }
  }
  return rows;
}

// ============================================================================
// 1. Toko Utama (UPoint & DuniaGames)
// ============================================================================

/** UPoint (upoint.id) */
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

/** DuniaGames (duniagames.co.id) */
async function extractDuniaGamesRows(page) {
  const ready = await page
    .waitForFunction(
      () => {
        const hasPopup = document.querySelector(
          "app-popup-error-transaction, .error-payment-wrapper, [class*='error-payment']",
        );
        if (hasPopup) return true;

        return Array.from(document.querySelectorAll(".denom")).some((card) => {
          const product = card.querySelector(".head-dnm")?.textContent?.trim();
          const price = card.querySelector(".price-dnm .pr")?.textContent?.trim();
          return Boolean(product && /^\d{1,3}(?:\.\d{3})*$/.test(price || ""));
        });
      },
      null,
      { timeout: 30_000, polling: 250 },
    )
    .then(() => true)
    .catch(() => false);

  if (!ready) return [];

  return page.locator(".denom").evaluateAll((cards) =>
    cards
      .map((card) => {
        const product = card.querySelector(".head-dnm")?.textContent?.replace(/\s+/g, " ").trim();
        const price = card.querySelector(".price-dnm .pr")?.textContent?.replace(/\s+/g, " ").trim();
        if (!product || !price || !/^\d{1,3}(?:\.\d{3})*$/.test(price) || Number(price.replace(/\./g, "")) <= 0) {
          return null;
        }
        return { Produk: product, Harga: `Rp ${price}` };
      })
      .filter(Boolean),
  );
}

// ============================================================================
// 2. Publisher & Toko Resmi
// ============================================================================

/** KiosGamer (kiosgamer.co.id) - Garena Free Fire API */
async function extractKiosgamerRows(page) {
  const apiUrl = "https://kiosgamer.co.id/api/shop/apps/channels?app_id=100067&region=CO.ID&language=id";
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

/** Roblox Official (roblox.com) */
async function extractRobloxRows(page) {
  const cards = page.locator("[data-product-id]");
  const ready = await cards
    .filter({ hasText: /(?:Rp\.?|IDR)\s*[\d.,]+\s*(?:rb|ribu|jt|juta)?/i })
    .first()
    .waitFor({ state: "visible", timeout: 30_000 })
    .then(() => true)
    .catch(() => false);

  if (!ready) return [];

  const cardTexts = await cards.evaluateAll((elements) =>
    elements.map((card) => card.innerText?.replace(/\s+/g, " ").trim() || ""),
  );

  const rows = cardTexts.map(parseRobloxProductCard).filter(Boolean);
  return dedupeRows(rows);
}

/** MobaPay (mobapay.com) */
async function extractMobapayRows(page) {
  const arrow = page.locator(".mobapay-scroll-recharge-arrow").first();
  if (await arrow.count()) {
    await arrow.click({ force: true }).catch(() => {});
    await page.waitForTimeout(1_000);
  }

  return page.evaluate(() => {
    const wrappers = Array.from(document.querySelectorAll(".mobapay-recharge-wrapper"));
    const mainWrapper = wrappers.find((w) => w.querySelector(".mobapay-scroll-recharge-arrow")) || wrappers[1] || wrappers[0];
    if (!mainWrapper) return [];

    return Array.from(mainWrapper.querySelectorAll(".mobapay-recharge-item"))
      .map((card) => {
        const lines = card.innerText.split("\n").map((s) => s.trim()).filter(Boolean);
        const price = lines.slice().reverse().find((l) => /^Rp\.?\s*[\d.]+/i.test(l)) || "";
        const nameParts = lines.filter((l, i, arr) => {
          if (/^Rp\.?\s*[\d.]+/i.test(l) || l === "%" || /^-?\d+\s*%/i.test(l)) return false;
          if (arr[i + 1] === "%" && /^-?\d+$/.test(l)) return false;
          return true;
        });

        let name = nameParts.join(" ").trim();
        if (/^\d[\d.,]*(?:\s*\+\s*\d[\d.,]*)?$/.test(name)) {
          name = `${name} Diamonds`;
        }
        return name && price ? { Produk: name, Harga: price } : null;
      })
      .filter(Boolean);
  });
}

// ============================================================================
// 3. Marketplace & E-Commerce
// ============================================================================

/** Tokopedia (tokopedia.com) */
async function extractTokopediaRows(page) {
  const allRows = [];
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
          ([tabIndex]) => document.querySelectorAll('[role="tab"]')[tabIndex]?.getAttribute("data-state") === "active",
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
            const product = card.querySelector("h3")?.textContent?.replace(/\s+/g, " ").trim();
            const text = card.textContent?.replace(/\s+/g, " ").trim() || "";
            const price = text.match(/Rp\s*\d[\d.]*/i)?.[0];
            return product && price ? { Produk: product, Harga: price } : null;
          })
          .filter(Boolean),
      );

    allRows.push(...tabRows);
  }

  return dedupeRows(allRows);
}

/** Blibli (blibli.com) */
async function extractBlibliRows(page, interceptedPayloads = []) {
  const blibliApi = interceptedPayloads.find((r) => r.url.includes("/backend/digital-product/products"));
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
            return Boolean(container.querySelector("input")?.value?.trim());
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

  const produkInput = page.locator(".blu-field__container").filter({ has: page.locator(".blu-field__label", { hasText: /^Produk$/i }) }).locator("input");
  const options = page.locator(".blu-dropdown-tray .blu-list");

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await produkInput.click({ force: true, timeout: 2_000 }).catch(() => {});
    await page.waitForTimeout(500);
    if ((await options.count()) > 0) break;
  }
  if (!(await options.count())) return [];

  const activeTray = page.locator(".blu-dropdown-tray").filter({ has: page.locator(".blu-list") }).first();
  const rows = [];

  const collectVisible = async () => {
    const items = await options.evaluateAll((elements) =>
      elements.map((item) => item.textContent?.replace(/\s+/g, " ").trim()).filter(Boolean),
    );
    for (const text of items) {
      const parsed = parseBlibliOptionText(text);
      if (parsed) rows.push(parsed);
    }
  };

  await activeTray.evaluate((el) => (el.scrollTop = 0)).catch(() => {});
  await page.waitForTimeout(300);
  await collectVisible();

  for (let i = 0; i < 50; i += 1) {
    const prevCount = rows.length;
    await activeTray.evaluate((el) => (el.scrollTop += 200)).catch(() => {});
    await page.waitForTimeout(200);
    await collectVisible();
    const atBottom = await activeTray.evaluate((el) => el.scrollTop + el.clientHeight >= el.scrollHeight - 5).catch(() => true);
    if (atBottom && rows.length === prevCount) break;
  }

  return dedupeRows(rows);
}

/** DANA (dana.id) */
async function extractDanaRows(page) {
  const buttonSelector = "button.product-detail-v3-package__item";
  await page.locator(buttonSelector).first().waitFor({ state: "attached", timeout: 15_000 }).catch(() => {});

  const tabs = page.locator(".product-detail-v3-package__tab");
  const tabCount = await tabs.count();
  const allProducts = [];

  const scrapeCurrentTab = async () => {
    const items = await page.locator(buttonSelector).evaluateAll((btns) =>
      btns
        .map((btn) => {
          const title = btn.querySelector(".title")?.innerText?.trim();
          const price = btn.querySelector(".current-price")?.innerText?.trim() || btn.querySelector(".price")?.innerText?.trim();
          return title && price ? { Produk: title, Harga: price } : null;
        })
        .filter(Boolean),
    );
    allProducts.push(...items);
  };

  if (tabCount > 0) {
    for (let i = 0; i < tabCount; i += 1) {
      await tabs.nth(i).click().catch(() => {});
      await page.waitForTimeout(500);
      await scrapeCurrentTab();
    }
  } else {
    await scrapeCurrentTab();
  }

  return dedupeRows(allProducts);
}

/** Shopee (shopee.co.id) */
async function extractShopeeRows(page) {
  const productPicker = page.getByText(/Pilih Nominal (?:Roblox|Free Fire)/i, { exact: true }).first();
  const pickerReady = await productPicker.waitFor({ state: "visible", timeout: 20_000 }).then(() => true).catch(() => false);

  if (pickerReady) {
    await productPicker.click().catch(() => {});
    await page.locator("li").filter({ hasText: /Roblox Gift Card|Diamonds?/i }).first().waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});

    const optionRows = await page.locator("li").evaluateAll((options) =>
      options
        .map((option) => {
          const text = option.innerText?.replace(/\s+/g, " ").trim() || "";
          const product = text.match(/(?:Rp[\d.]+,-\s+Roblox Gift Card|\d[\d.]*\s+Diamonds?)/i)?.[0];
          const prices = text.match(/Rp\s*[\d.]+/gi) || [];
          return product && prices.length ? { Produk: product, Harga: prices[prices.length - 1] } : null;
        })
        .filter(Boolean),
    );

    if (optionRows.length) return dedupeRows(optionRows);
  }

  const bodyText = await page.locator("body").innerText();
  const diamondSection = bodyText.match(/Jumlah Diamond\s+Harga([\s\S]*?)(?:Untuk membeli item|Cara\s+redeem)/i)?.[1];
  if (!diamondSection) return [];

  const rows = [];
  const diamondPattern = /(\d[\d.]*)\s+Diamonds?\s+(Rp\s*[\d.]+)/gi;
  for (const match of diamondSection.matchAll(diamondPattern)) {
    rows.push({ Produk: `${match[1]} Diamonds`, Harga: match[2] });
  }
  return dedupeRows(rows);
}

// ============================================================================
// 4. Toko Voucher Game
// ============================================================================

/** UniPin (unipin.com) */
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

/** UniPin Roblox (unipin.com) */
async function extractUnipinRobloxRows(page) {
  const bodyText = await page.locator("body").innerText();
  const section = bodyText.match(/Pilih Jumlah([\s\S]*?)(?:Pilih Saluran Pembayaran|Checkout)/i)?.[1];
  if (!section) return [];

  const rows = [];
  const pattern = /Rp([\d.]+),?-?\s+Roblox Gift Card\s+IDR\s*([\d.]+)/gi;
  for (const match of section.matchAll(pattern)) {
    rows.push({ Produk: `Roblox IDR ${match[1]}`, Harga: `IDR ${match[2]}` });
  }
  return rows;
}

/** VCGamers (vcgamers.com) */
async function extractVcgamersRows(page) {
  const nextData = await page.evaluate(() => {
    const el = document.getElementById("__NEXT_DATA__");
    return el ? JSON.parse(el.textContent) : null;
  }).catch(() => null);

  if (nextData) {
    const rows = extractProductPairsFromJson(nextData);
    if (rows.length) return rows;
  }
  return [];
}

/** GoPay (gopay.co.id) */
async function extractGopayRows(page) {
  return page.locator('[id^="variant-"] .grid > div').evaluateAll((cards) =>
    cards
      .map((card) => {
        const product = card.querySelector("h3")?.innerText?.trim();
        const prices = card.innerText?.match(/Rp\s*[\d.]+/gi) || [];
        return product && prices.length ? { Produk: product, Harga: prices[0] } : null;
      })
      .filter(Boolean),
  );
}

/** Ditusi (ditusi.co.id) */
async function extractDitusiRows(page) {
  if (/roblox/i.test(page.url()) && !page.url().includes("voucher-roblox-robux")) {
    await page.goto("https://ditusi.co.id/voucher-roblox-robux", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1_500);
  }

  await page.evaluate(() => {
    document.querySelectorAll(".modal, .modal-backdrop, #modal-request-permission, #customModal").forEach((el) => el.remove());
    document.body.classList.remove("modal-open");
  });

  const allCards = [];

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
    allCards.push(...cards);
  };

  await collectVisible();

  const subTabLabels = await page.evaluate(() =>
    Array.from(document.querySelectorAll("#group-category-game label"))
      .map((l) => l.innerText?.trim())
      .filter(Boolean),
  );

  for (const labelText of subTabLabels) {
    if (/usd|global|foreign|sar|brl/i.test(labelText)) continue;
    await page.evaluate((txt) => {
      const lbl = Array.from(document.querySelectorAll("#group-category-game label")).find((l) => l.innerText?.trim() === txt);
      if (lbl) lbl.click();
    }, labelText);
    await page.waitForTimeout(1_000);
    await collectVisible();
  }

  return dedupeRows(allCards);
}

/** HiddenGame (hiddengame.id) */
async function extractHiddengameRows(page) {
  if (page.url().includes("roblox") && !page.url().includes("giftcard")) {
    await page.goto("https://hiddengame.id/games/roblox-giftcard", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1_500);
  }

  const rawList = await page.locator("div.product-item").evaluateAll((elements) =>
    elements
      .map((card) => {
        const title = card.querySelector("input[data-title]")?.getAttribute("data-title") || card.querySelector(".product-title")?.innerText?.trim();
        const price = card.querySelector(".current-price, .pricing")?.innerText?.match(/Rp\s*[\d.]+/i)?.[0];
        return title && price ? { Produk: title.replace(/\s+/g, " "), Harga: price } : null;
      })
      .filter(Boolean),
  );

  return dedupeRows(rawList);
}

/** VexaGame (vexagame.com) */
async function extractVexagameRows(page) {
  return page.locator('#diamond-cards [role="option"]').evaluateAll((cards) =>
    cards
      .map((card) => {
        const text = card.innerText?.replace(/\s+/g, " ").trim() || "";
        const prices = text.match(/Rp\s*[\d.]+/gi) || [];
        const product = card.querySelector("p")?.innerText?.trim();
        return product && prices.length ? { Produk: product, Harga: prices[prices.length - 1] } : null;
      })
      .filter(Boolean),
  );
}

/** Lapakgaming (lapakgaming.com) */
async function extractLapakgamingRows(page) {
  await page
    .waitForFunction(
      () =>
        Array.from(document.querySelectorAll("div, button")).some((el) => {
          const text = el.innerText || "";
          return /Rp\s*[\d.]+/i.test(text) && text.includes("\n");
        }),
      null,
      { timeout: 25_000 },
    )
    .catch(() => {});

  const rawRows = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll("div, button")).filter((el) => {
      const lines = (el.innerText || "").split("\n").map((s) => s.trim()).filter(Boolean);
      if (lines.length >= 2 && lines.length <= 8) {
        const hasPrice = lines.some((l) => /^Rp[\d.]+/i.test(l) || /^Dari\s*Rp[\d.]+/i.test(l));
        const hasProduct = lines.some((l) =>
          /\b(?:diamonds?|robux|dm|voucher|gift\s*card|k\b|pass|membership)\b/i.test(l) ||
          /^\d+[\d.,]*\s*(?:diamonds?|robux|dm)?$/i.test(l),
        );
        const isNotPayment = !lines.some((l) =>
          /^(?:QRIS|DANA|GoPay|OVO|ShopeePay|Virtual Account|Alfamart|ATM Bersama)$/i.test(l),
        );
        return hasPrice && hasProduct && isNotPayment;
      }
      return false;
    });

    const leafCards = cards.filter((c) => !cards.some((other) => other !== c && c.contains(other)));

    return leafCards
      .map((card) => {
        const lines = card.innerText.split("\n").map((s) => s.trim()).filter(Boolean);
        const name = lines.find((l) => !/^(?:Dari|Promo|Diskon|\+[\d%]+ Bonus|Termurah|\d+%)$/i.test(l) && !/^Rp[\d.]+/i.test(l)) || lines[0];
        const priceLines = lines.filter((l) => /^Rp[\d.]+/i.test(l) || /^Dari\s*Rp[\d.]+/i.test(l));
        if (!name || !priceLines.length) return null;

        const bestPriceLine = priceLines.find((l) => /^Dari\s*Rp/i.test(l)) || priceLines[0];
        const match = bestPriceLine.match(/Rp[\d.]+/i);
        const price = match ? match[0] : bestPriceLine;
        return { Produk: name, Harga: price };
      })
      .filter(Boolean);
  });

  return dedupeRows(rawRows);
}

/** GOGOGO (gogogo.com / gogogo.id) */
async function extractGogogoRows(page) {
  await page
    .waitForFunction(
      () => {
        const cards = Array.from(document.querySelectorAll('div[class*="hover:border-golden-yellow"], div[class*="rounded-xl"]'));
        return cards.some((c) => /Rp[\d.]+/i.test(c.innerText || ""));
      },
      null,
      { timeout: 15_000, polling: 250 },
    )
    .catch(() => {});

  const rawRows = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('div[class*="hover:border-golden-yellow"], div[class*="rounded-xl"]')).filter((el) => {
      const text = el.innerText || "";
      return /Rp[\d.]+/i.test(text) && !el.querySelector('div[class*="hover:border-golden-yellow"], div[class*="rounded-xl"]');
    });

    return cards
      .map((card) => {
        const lines = card.innerText.split("\n").map((s) => s.trim()).filter(Boolean);
        const name = lines.find((l) => !/^Rp[\d.]+/i.test(l) && !/^\d+%\s*OFF/i.test(l)) || lines[0];
        const priceLines = lines.filter((l) => /^Rp[\d.]+/i.test(l));
        if (!name || !priceLines.length) return null;

        const priceMatch = priceLines[0].match(/Rp\s*([\d.]+)/i);
        const price = priceMatch ? `Rp ${priceMatch[1]}` : priceLines[0];
        return { Produk: name, Harga: price };
      })
      .filter(Boolean);
  });

  return dedupeRows(rawRows);
}

/** eBelanja (topup.ebelanja.id) */
async function extractEbelanjaRows(page) {
  const showMore = page.getByRole("button", { name: /Muat Lainnya/i });
  for (let attempt = 0; attempt < 10 && (await showMore.count()); attempt += 1) {
    if (!(await showMore.isVisible().catch(() => false))) break;
    await showMore.click().catch(() => {});
    await page.waitForTimeout(500);
  }

  const rawRows = await page.locator(".box-border.cursor-pointer").evaluateAll((elements) =>
    elements
      .map((card) => {
        const text = card.innerText?.replace(/\s+/g, " ").trim() || "";
        const product = text.replace(/^PROMO\s*/i, "").split(/Rp\s*[\d.]+/i)[0].trim();
        const price = text.match(/Rp\s*[\d.]+/i)?.[0];
        return product && price ? { Produk: product, Harga: price } : null;
      })
      .filter(Boolean),
  );

  return dedupeRows(rawRows);
}

/**
 * Parser data Next.js RSC Flight stream untuk platform VocaGame (topupnolimit.com, dll)
 */
function extractVocaGameProductsFromHtml(html) {
  if (!html) return [];
  const clean = html.replace(/\\n/g, "\n").replace(/\\"/g, '"');
  const lines = clean.split("\n");

  const prices = new Map();
  const arrays = new Map();

  for (const line of lines) {
    const priceMatch = line.match(/^([0-9a-zA-Z]+):\{"amount_discount"[^}]*?"amount":"(\d+)"[^}]*?"currency":"(IDR)"\}/);
    if (priceMatch) {
      prices.set(priceMatch[1], Number(priceMatch[2]));
    }

    const arrayMatch = line.match(/^([0-9a-zA-Z]+):\[(.*?)\]/);
    if (arrayMatch) {
      arrays.set(arrayMatch[1], arrayMatch[2]);
    }
  }

  const items = [];
  const seen = new Set();

  for (const line of lines) {
    const denomMatch = line.match(/^([0-9a-zA-Z]+):\{"id":"([^"]+)","variant_id":\d+,"name":"([^"]+)"/);
    if (!denomMatch) continue;

    const name = denomMatch[3].trim();
    const isActive = /"is_active":true/.test(line);
    if (!isActive) continue;

    const countryRuleMatch = line.match(/"country_rule":"([^"]+)"/);
    const countryCodesMatch = line.match(/"country_codes":"\$([0-9a-zA-Z]+)"/);
    if (countryRuleMatch && countryCodesMatch) {
      const rule = countryRuleMatch[1];
      const codes = arrays.get(countryCodesMatch[1]) || "";
      if (rule === "IS_IN" && !codes.includes('"id"')) continue;
      if (rule === "NOT_IN" && codes.includes('"id"')) continue;
    }

    const priceRefMatch = line.match(/"price":"\$([0-9a-zA-Z]+)"/);
    if (!priceRefMatch) continue;

    const priceAmount = prices.get(priceRefMatch[1]);
    if (!priceAmount || priceAmount <= 0) continue;

    const formattedPrice = `Rp ${priceAmount.toLocaleString("id-ID")}`;
    const key = `${name.toLowerCase()}|${formattedPrice}`;
    if (!seen.has(key)) {
      seen.add(key);
      items.push({
        Produk: name,
        Harga: formattedPrice,
      });
    }
  }

  return items;
}

/** VocaGame Platform (topupnolimit.com, dll) */
async function extractVocaGameRows(page) {
  // 1. Ekstraksi langsung dari payload Next.js Server Components
  const pageHtml = await page.content().catch(() => "");
  if (pageHtml && pageHtml.includes("self.__next_f")) {
    const rscItems = extractVocaGameProductsFromHtml(pageHtml);
    if (rscItems && rscItems.length > 0) {
      return dedupeRows(rscItems);
    }
  }

  // 2. Fallback: Ekstraksi DOM jika elemen sudah dirender di browser
  const domRows = await page.evaluate(() => {
    const cards = Array.from(
      document.querySelectorAll(
        ".form-denomination li, .form-denomination button, [class*='denomination'] li",
      ),
    );
    return cards
      .map((card) => {
        const text = (card.innerText || "").replace(/\s+/g, " ").trim();
        const priceMatch = text.match(/Rp\.?\s*[\d.]+/i);
        if (!priceMatch) return null;
        const harga = priceMatch[0];
        const produk = text.split(/Rp\.?/i)[0].trim();
        return produk && harga ? { Produk: produk, Harga: harga } : null;
      })
      .filter(Boolean);
  });

  return dedupeRows(domRows || []);
}

// ============================================================================
// 5. Mapping Domain & Dispatcher
// ============================================================================
const STORE_EXTRACTORS = {
  "upoint.id": extractUPointRows,
  "duniagames.co.id": extractDuniaGamesRows,
  "dana.id": extractDanaRows,
  "unipin.com": (page, url) => (/roblox/i.test(url.pathname) ? extractUnipinRobloxRows(page) : extractUniPinRows(page)),
  "tokopedia.com": extractTokopediaRows,
  "blibli.com": extractBlibliRows,
  "vcgamers.com": extractVcgamersRows,
  "roblox.com": extractRobloxRows,
  "kiosgamer.co.id": extractKiosgamerRows,
  "gopay.co.id": extractGopayRows,
  "gogogo.com": extractGogogoRows,
  "gogogo.id": extractGogogoRows,
  "topup.ebelanja.id": extractEbelanjaRows,
  "shopee.co.id": extractShopeeRows,
  "ditusi.co.id": extractDitusiRows,
  "hiddengame.id": extractHiddengameRows,
  "vexagame.com": extractVexagameRows,
  "mobapay.com": extractMobapayRows,
  "lapakgaming.com": extractLapakgamingRows,
  "topupnolimit.com": extractVocaGameRows,
  "vocagame.com": extractVocaGameRows,
};

/** Dispatcher ekstraktor berdasarkan hostname URL */
async function extractSpecialRows(page, url, interceptedPayloads = []) {
  const hostname = url.hostname.replace(/^www\./, "").toLowerCase();
  const extractor = STORE_EXTRACTORS[hostname];
  if (!extractor) return null;
  return extractor(page, url, interceptedPayloads);
}

module.exports = {
  dedupeRows,
  extractBlibliRows,
  extractDanaRows,
  extractDitusiRows,
  extractDuniaGamesRows,
  extractEbelanjaRows,
  extractGogogoRows,
  extractGopayRows,
  extractHiddengameRows,
  extractKiosgamerRows,
  extractLapakgamingRows,
  extractMobapayRows,
  extractRobloxRows,
  extractShopeeRows,
  extractSpecialRows,
  extractTokopediaRows,
  extractUniPinRows,
  extractUnipinRobloxRows,
  extractUPointRows,
  extractVcgamersRows,
  extractVexagameRows,
  extractVocaGameProductsFromHtml,
  extractVocaGameRows,
};
