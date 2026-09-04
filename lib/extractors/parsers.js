/**
 * Card Text & Normalization Parsers
 * Pure parsing functions for specific store products and card layouts.
 */

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

function parseBlibliOptionText(text) {
  const cleanText = String(text || "").replace(/\s+/g, " ").trim();
  const price = cleanText.match(/Rp\s*\d[\d.]*/i);
  if (!price || Number(price[0].replace(/\D/g, "")) <= 0) return null;
  const product = cleanText.slice(0, price.index).trim();
  if (!product) return null;
  return { Produk: product, Harga: price[0] };
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

function parseDitusiProductRows(bodyText) {
  const markerMatches = Array.from(
    String(bodyText || "").matchAll(
      /Pilih Item Top Up (?:Free Fire|Voucher\s*Roblox\s*\/\s*Robux|Roblox\s*-\s*Login)/gi,
    ),
  );
  const marker = markerMatches.at(-1);
  if (!marker) return [];
  const section = bodyText.slice(marker.index + marker[0].length);
  const rows = [];
  const lines = section
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const productPattern =
    /^(?:Roblox\s+Gift\s+card\s+IDR\s+\d+K|ROBLOX\d+K\d?|\d[\d.]*\s+(?:Diamonds?|Robux)(?:\s+USN)?(?:\s*\+\s*\(Bonus\s+\d[\d.]*\))?)$/i;

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

module.exports = {
  normalizeMobapayProductName,
  normalizeTokopediaUrl,
  parseBlibliOptionText,
  parseDitusiProductRows,
  parseDuniaGamesCardText,
  parseRobloxProductCard,
  parseUniPinCardText,
  parseUPointCardText,
  validateUrl,
};
