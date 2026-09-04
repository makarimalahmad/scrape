/**
 * Generic DOM & Intercepted Payload Extractor
 * Fallback scanner for unknown stores and deep JSON response traversal.
 */

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
    /(?:cashback|ewallet|mbanking|transfer bank|tranfer bank|gerai ritel|alfamart|saldo reseller|qris|qr kode|\bva\b|linkaja|shopeepay|gopay|ovo\b)/i;
  const recommendationNoise =
    /(?:arena of valor|call of duty|free fire max|speed drifters|\bundawn\b)/i;

  const isGiftCardOrRoblox =
    pathname.includes("roblox") ||
    pathname.includes("gift-card") ||
    /roblox|gift[_-]?cards?/i.test(pathname);

  const pushRow = (product, harga) => {
    let cleanProduct = clean(product);
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

    if (/roblox/i.test(pathname) || isGiftCardOrRoblox) {
      if (/^(?:IDR|USD|\$)\s*[\d.]+/i.test(cleanProduct)) {
        cleanProduct = `Roblox ${cleanProduct}`;
      }
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
  const isUnipin = hostname.endsWith("unipin.com");
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
              : '.pDRoot, .mobapay-recharge-item, [class*="recharge-item"], [class*="product-card"], .form-check-label-rounded-lg, [class*="group/variant"], .sku-card, .highlighted-sku-card, .denom-container > button, .main-info, div[class*="cursor-pointer"], .g-content-flex-wrap > div, .g-content-relative';
  let productCards = [];
  try {
    productCards = Array.from(document.querySelectorAll(productSelector));
  } catch {
    productCards = [];
  }
  productCards = productCards.filter((card) => {
    const parentClass = String(card.parentElement?.className || "");
    if (
      parentClass.includes("sku-list") ||
      parentClass.includes("highlighted-skus__list")
    ) {
      return false;
    }
    if (card.querySelector('.sku-card, [class*="group/variant"]')) {
      return false;
    }
    return true;
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
    const isUnipinCard = isUnipin && card.matches("button.position-relative, div.form-check-label-rounded-lg, .denom-container button, button, div");
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
    const unipinName = isUnipinCard
      ? clean(card.querySelector(".fsemibold, .title, .denomination-name")?.innerText || text.split("\n")[0])
      : "";
    const unipinPrice = isUnipinCard
      ? clean(card.querySelector(".price, .text-right, span.text-primary, [class*='text-white']:last-child")?.innerText || prices[prices.length - 1])
      : null;
    const discEl = card.querySelector('.discounted-price, [class*="discounted-price"], .discount-price, [class*="discount-price"]');
    const discPriceRaw = clean(discEl?.innerText);
    const genericDiscountedPrice = discPriceRaw ? (/(?:Rp|IDR|\$)/i.test(discPriceRaw) ? discPriceRaw : `Rp ${discPriceRaw}`) : null;

    const rpMatch = prices.find((p) => /^Rp\.?\s*\d/i.test(p));
    const effectivePrice = isMobapayCard || isDuniaGamesCard
      ? prices[prices.length - 1]
      : unipinPrice || genericDiscountedPrice || gogogoPrice || lootbarPrice || danaPrice || itemkuPrice || robloxTransactionPrice || upointPrice || rpMatch || prices[0];
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
              : isUnipinCard && unipinName
                ? unipinName
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
      !isGogogoCard &&
      !isUnipinCard
    ) {
      const struckEls = Array.from(card.querySelectorAll("del, s, [class*='line-through']"));
      for (const s of struckEls) {
        name = name.replace(clean(s.innerText), "");
      }
      if (discPriceRaw && discPriceRaw !== effectivePrice) {
        name = name.replace(discPriceRaw, "");
      }
      if (effectivePrice) {
        name = name.replace(effectivePrice, "");
      }
    }
    name = name
      .replace(/-?\d+\s*%/gi, "")
      .replace(/\d+\s*\/\s*\d+\s*purchased/gi, "")
      .replace(/\s*-?\s*\(limited\)/gi, "")
      .replace(/\b(?:disc|diskon|promo)\b\s*\d*%?/gi, "")
      .replace(/\b(?:dari|best seller|rewards?)\b/gi, "")
      .replace(/\s*\+\s*(?:coins?|points?|poin|cashback|rewards?|saldo|kupon)\b/gi, "")
      .replace(
        /\b(?:beli|buy|pilih|select|hemat|bonus|peman mencapai batas)\b/gi,
        "",
      )
      .replace(/^[\[\]\(\)\s-]+/, "")
      .replace(/\s+/g, " ")
      .trim();

    if (/^(\d[\d.,]*)\s+\d[\d.,]*$/.test(name)) {
      name = name.replace(/\s+\d[\d.,]*$/, "").trim();
    }
    if (
      isMobapayCard &&
      /\/mlbb(?:\/|$)/i.test(pathname) &&
      /^\d[\d.,]*(?:\s*\+\s*\d[\d.,]*)?$/.test(name)
    ) {
      name = `${name} Diamonds`;
    }

    const isPaymentMethod =
      /^(?:dana|gopay|ovo|linkaja|shopeepay|astrapay|qris|bca|bri|bni|cimb|mandiri|alfamart|indomaret|virtual account|transfer bank|kartu debit|kartu kredit|perbankan online|sms & seluler|otc non-bank)$/i.test(
        name,
      );
    const isStreamingBundle = /\b(?:iqiyi|wetv|vidio|viu|netflix|spotify)\b/i.test(name);

    if (name && !isPaymentMethod && !isStreamingBundle) {
      pushRow(name, effectivePrice);
    }
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

async function extractGenericRows(page, url, selector) {
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
    const genericRows = [];
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
    return genericRows;
  }

  const universalCategoryTabs = [
    "Roblox - Instant",
    "Roblox Gift Card",
    "Roblox Global Instan",
  ];
  let tabCollectedRows = [];
  for (const tabName of universalCategoryTabs) {
    const tabEl = page.getByText(tabName, { exact: true }).first();
    if (await tabEl.count()) {
      await tabEl.click({ force: true }).catch(() => {});
      await page.waitForTimeout(1_200);
      const tabRows = await page.evaluate(evaluateDomProducts, {
        defaultSelector: selector,
        hostname: url.hostname,
        pathname: url.pathname,
      });
      if (tabRows && tabRows.length > 0) {
        tabCollectedRows.push(...tabRows);
      }
    }
  }

  if (tabCollectedRows.length > 0) {
    const seen = new Set();
    const genericRows = [];
    for (const row of tabCollectedRows) {
      const key = `${String(row.Produk).toLowerCase()}|${String(row.Harga).toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        genericRows.push(row);
      }
    }
    return genericRows;
  }

  return await page.evaluate(evaluateDomProducts, {
    defaultSelector: selector,
    hostname: url.hostname,
    pathname: url.pathname,
  });
}

module.exports = {
  evaluateDomProducts,
  extractGenericRows,
  extractProductPairsFromJson,
};
