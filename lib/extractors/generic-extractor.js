// Ekstraktor fallback untuk toko umum via scanning DOM dan metadata terstruktur
const {
  extractMetadataRows,
  extractProductPairsFromJson,
} = require("./metadata-extractor");

function evaluateDomProducts({ defaultSelector, hostname, pathname }) {
  const priceRegex =
    /(?:(?:Rp\.?|IDR|USD|US\$|\$|RM)\s*\d[\d.,]*\s*[kK]?|\d[\d.,]*\s*(?:Rp\.?|IDR))/gi;
  function bersihkanTeks(str) {
    if (!str) return "";
    return str.replace(/\s+/g, " ").trim();
  }
  const clean = bersihkanTeks;

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

    // Normalisasi format postfix angka di depan Rp (seperti 41983 Rp)
    if (/\s*(?:Rp\.?|IDR)$/i.test(cleanHarga.trim())) {
      const rawNum = cleanHarga.replace(/[^\d]/g, "");
      if (rawNum && Number(rawNum) > 0) {
        cleanHarga = `Rp ${Number(rawNum).toLocaleString("id-ID")}`;
      }
    }

    // Normalisasi format ringkas ribuan seperti Rp 1K menjadi Rp 1.000
    if (/[kK]$/i.test(cleanHarga.trim())) {
      const rawNum = cleanHarga.replace(/[^\d.]/g, "");
      const parsed = parseFloat(rawNum) * 1000;
      if (!isNaN(parsed) && parsed > 0) {
        cleanHarga = `Rp ${Math.round(parsed).toLocaleString("id-ID")}`;
      }
    }

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

  const productSelector =
    defaultSelector ||
    '.pDRoot, .mobapay-recharge-item, [class*="recharge-item"], [class*="product-card"], .SKU_type, [class*="sku"], [class*="SKU"], [class*="product-item"], .form-check-label-rounded-lg, [class*="group/variant"], .sku-card, .highlighted-sku-card, .denom-container > button, .main-info, div[class*="cursor-pointer"], .g-content-flex-wrap > div, .g-content-relative';

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

    const discEl = card.querySelector('.discounted-price, [class*="discounted-price"], .discount-price, [class*="discount-price"]');
    const discPriceRaw = clean(discEl?.innerText);
    let genericDiscountedPrice = null;
    if (discPriceRaw) {
      if (/(?:Rp|IDR|\$)/i.test(discPriceRaw)) {
        genericDiscountedPrice = discPriceRaw;
      } else {
        genericDiscountedPrice = `Rp ${discPriceRaw}`;
      }
    }

    const rpMatch = prices.find((hargaItem) => /^Rp\.?\s*\d/i.test(hargaItem));
    const effectivePrice = genericDiscountedPrice || rpMatch || prices[0];

    let name = text;
    const struckEls = Array.from(card.querySelectorAll("del, s, [class*='line-through']"));
    for (const elemenCoret of struckEls) {
      name = name.replace(clean(elemenCoret.innerText), "");
    }
    if (discPriceRaw && discPriceRaw !== effectivePrice) {
      name = name.replace(discPriceRaw, "");
    }
    if (effectivePrice) {
      name = name.replace(effectivePrice, "");
    }

    // Bersihkan teks badge promo, diskon, dan teks umum dari nama produk
    name = name
      .replace(/-?\d+\s*%/gi, "") // contoh: "-10%"
      .replace(/\d+\s*\/\s*\d+\s*purchased/gi, "") // contoh: "5/10 purchased"
      .replace(/\s*-?\s*\(limited\)/gi, "") // contoh: "(limited)"
      .replace(/\b(?:disc|diskon|promo)\b\s*\d*%?/gi, "") // contoh: "diskon 10%"
      .replace(/\b(?:dari|best seller|rewards?)\b/gi, "")
      .replace(/\s*\+\s*(?:coins?|points?|poin|cashback|rewards?|saldo|kupon)\b/gi, "")
      .replace(
        /\b(?:beli|buy|pilih|select|hemat|bonus|peman mencapai batas)\b/gi,
        "",
      )
      .replace(/^[\[\]\(\)\s-]+/, "")
      .replace(/\s+/g, " ")
      .trim();

    // Jika nama produk memiliki angka kembar berulang (contoh: "50 50"), buang angka kedua
    if (/^(\d[\d.,]*)\s+\d[\d.,]*$/.test(name)) {
      name = name.replace(/\s+\d[\d.,]*$/, "").trim();
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
      for (const hargaItem of prices) {
        produk = produk.replace(hargaItem, "");
      }
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
    // Sibling Clustering: Deteksi kontainer yang memuat sekumpulan elemen bersaudara berulang dengan pola harga
    const priceNodes = Array.from(document.querySelectorAll("body *")).filter((el) => {
      return el.children.length === 0 && priceRegex.test(el.innerText || "");
    });
    const candidateContainers = new Set();
    for (const node of priceNodes) {
      let el = node.parentElement;
      while (el && el !== document.body) {
        if (el.parentElement) {
          candidateContainers.add(el.parentElement);
        }
        el = el.parentElement;
      }
    }
    let bestCluster = [];
    for (const container of candidateContainers) {
      const childrenWithPrice = Array.from(container.children).filter((child) => {
        return priceRegex.test(child.innerText || "");
      });
      if (childrenWithPrice.length >= 3 && childrenWithPrice.length > bestCluster.length) {
        bestCluster = childrenWithPrice;
      }
    }
    for (const card of bestCluster) {
      const text = clean(card.innerText);
      if (!text || text.length > 200) continue;
      const prices = text.match(priceRegex);
      if (!prices || !prices.length) continue;
      const harga = prices[prices.length - 1] || prices[0];
      let produk = text.replace(harga, "");
      const discMatch = text.match(/-\d+\s*%|\d+\s*%\s*off|diskon:\s*\d+(?:\.\d+)?%/i);
      if (discMatch) {
        produk = produk.replace(discMatch[0], "");
      }
      produk = produk
        .replace(/\b(?:beli|buy|pilih|select|diskon|promo|instant delivery)\b/gi, "")
        .replace(/^[\[\]\(\)\s-]+/, "")
        .replace(/\s+/g, " ")
        .trim();
      pushRow(produk, harga);
    }
  }

  if (!results.length) {
    const linePriceRegex =
      /^(?:Rp\.?|IDR|USD|US\$|\$|RM)\s*\d[\d.,]*\s*[kK]?$/i;
    const semuaBarisTeks = (document.body.innerText || "").split("\n");
    const lines = [];
    for (const barisTeks of semuaBarisTeks) {
      const teksBersih = clean(barisTeks);
      if (teksBersih) {
        lines.push(teksBersih);
      }
    }

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

  // Hapus produk duplikat yang namanya lebih panjang jika sudah ada nama lebih pendek dengan harga sama persis
  const hasilUnik = [];
  for (let i = 0; i < results.length; i += 1) {
    const row = results[i];
    let adaDuplikatLebihPendek = false;

    for (let j = 0; j < results.length; j += 1) {
      if (i === j) continue;
      const other = results[j];
      const hargaSama = row.Harga === other.Harga;
      const otherLebihPendek = other.Produk.length < row.Produk.length;
      const mengandungNama = row.Produk.toLowerCase().includes(other.Produk.toLowerCase());

      if (hargaSama && otherLebihPendek && mengandungNama) {
        adaDuplikatLebihPendek = true;
        break;
      }
    }

    if (!adaDuplikatLebihPendek) {
      hasilUnik.push(row);
    }
  }

  return hasilUnik;
}

async function extractGenericRows(page, url, selector) {
  // 1. Ekstraksi metadata terstruktur: Schema.org (JSON-LD) & window.dataLayer
  const metadataRows = await extractMetadataRows(page);
  if (metadataRows && metadataRows.length >= 3) {
    return metadataRows;
  }

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
    "Diamonds",
    "Diamond",
    "Robux",
    "Roblox - Instant",
    "Roblox Gift Card",
    "Roblox Global Instan",
  ];
  let tabCollectedRows = [];
  for (const tabName of universalCategoryTabs) {
    let tabEl = page.getByRole("button", { name: tabName, exact: true }).first();
    if ((await tabEl.count()) === 0) {
      tabEl = page.getByText(tabName, { exact: true }).first();
    }
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
  extractGenericRows,
  extractProductPairsFromJson,
};
