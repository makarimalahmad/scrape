function parsePrice(value) {
  const digits = String(value || "").replace(/[^\d]/g, "");
  return digits ? Number(digits) : null;
}

function parseCount(value) {
  return Number(String(value).replace(/[.,]/g, ""));
}

function normalizeGame(game) {
  const value = String(game || "").toLowerCase();
  if (value.includes("free")) return "free-fire";
  if (value.includes("roblox")) return "roblox";
  return "mobile-legends";
}

function parseNamedProduct(name) {
  const namedProducts = [
    [/weekly diamond pass|\bwdp\b/, "Weekly Diamond Pass", "pass"],
    [/twilight pass/, "Twilight Pass", "pass"],
    [/weekly elite (?:pack|bundle)/, "Weekly Elite Pack", "pass"],
    [/monthly (?:elite|epic) (?:pack|bundle)/, "Monthly Elite Pack", "pass"],
    [/member mingguan/, "Member Mingguan", "membership"],
    [/member bulanan/, "Member Bulanan", "membership"],
    [/bp card/, "BP Card", "membership"],
    [/starlight membership plus/, "Starlight Membership Plus", "membership"],
    [/starlight membership/, "Starlight Membership", "membership"],
  ];

  for (const [pattern, key, category] of namedProducts) {
    if (pattern.test(name)) {
      return { key, category, quantity: null, unit: null };
    }
  }

  return null;
}

function parseRobloxProduct(name) {
  const robuxMatch = name.match(/(\d[\d.,]*)\s*robux/i);
  if (robuxMatch) {
    let quantity = parseCount(robuxMatch[1]);
    const bonusMatch = name.match(/bonus\s*(\d[\d.,]*)/i);
    if (bonusMatch) quantity += parseCount(bonusMatch[1]);
    return {
      key: `${quantity} Robux`,
      category: "robux",
      quantity,
      unit: "Robux",
    };
  }

  const idrMatch =
    name.match(/roblox(?:\s+gift\s+card)?\s*idr\s*(\d[\d.,]*)/i) ||
    name.match(/(?:roblox\s*)?idr\s*(\d[\d.,]*)/i) ||
    name.match(/(\d[\d.,]*)\s*idr(?:\s*-?\s*gift\s*card)?/i) ||
    name.match(/roblox\s+gift\s+card\s+(\d[\d.,]*)/i) ||
    name.match(/rp\s*(\d[\d.]*)\s*,-?\s*roblox\s+gift\s+card/i);
  if (idrMatch) {
    const quantity = parseCount(idrMatch[1]);
    return {
      key: `Roblox IDR ${quantity}`,
      category: "roblox-idr-card",
      quantity,
      unit: "IDR Voucher",
    };
  }

  const usdMatch =
    name.match(/(?:roblox\s*)?usd\s*\$?\s*(\d[\d.,]*)/i) ||
    name.match(/\$\s*(\d[\d.,]*)\s*(?:roblox|gift\s*card)?/i);
  if (usdMatch) {
    const quantity = parseCount(usdMatch[1]);
    return {
      key: `Roblox USD ${quantity}`,
      category: "roblox-usd-card",
      quantity,
      unit: "USD Voucher",
    };
  }

  return null;
}

function parseDiamondProduct(name) {
  const leadingTotalMatch = name.match(
    /^(\d[\d.,]*)\s*\(\s*\d[\d.,]*\s*\+\s*\d[\d.,]*\s*(?:bonus)?\s*\)\s*(?:diamonds?|diaomonds?|dm)?/i,
  );
  const bonusMatch = name.match(
    /(\d[\d.,]*)\s*\+\s*(\d[\d.,]*)\s*(?:diamonds?|diaomonds?|dm|berlian)/i,
  );
  const diamondMatch = name.match(
    /(\d[\d.,]*)\s*(?:(?:free\s*fire|ff)\s*)?(?:diamonds?|diaomonds?|dm|berlian)/i,
  );

  let quantity = null;
  if (leadingTotalMatch) quantity = parseCount(leadingTotalMatch[1]);
  else if (bonusMatch) {
    quantity = parseCount(bonusMatch[1]) + parseCount(bonusMatch[2]);
  } else if (diamondMatch) quantity = parseCount(diamondMatch[1]);

  if (quantity === null) return null;

  let category = "diamond";
  if (/first top[ -]?up|pembelian pertama|pengisian pertama/.test(name)) {
    category = "diamond-first-topup";
  }
  if (/vision|wetv|duolingo|prime video|subscription/.test(name)) {
    category = "diamond-service-bonus";
  }

  return {
    key: `${quantity} Diamonds`,
    category,
    quantity,
    unit: "Diamond",
  };
}

function parseProduct(name, game) {
  const cleanName = String(name || "").toLowerCase().trim();
  const namedProduct = parseNamedProduct(cleanName);
  if (namedProduct) return namedProduct;

  if (normalizeGame(game) === "roblox") {
    const robloxProduct = parseRobloxProduct(cleanName);
    if (robloxProduct) return robloxProduct;
  } else {
    const diamondProduct = parseDiamondProduct(cleanName);
    if (diamondProduct) return diamondProduct;
  }

  const key = cleanName
    .replace(/\b(?:from|dari|promo|diskon)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return { key, category: "other", quantity: null, unit: null };
}

function selectCheapestProducts(rows, game) {
  const products = new Map();

  for (const row of rows) {
    const parsed = parseProduct(row.Produk, game);
    const price = parsePrice(row.Harga);
    if (!parsed.key || price === null) continue;

    const mapKey = `${parsed.category}|${parsed.key}`;
    const current = products.get(mapKey);
    if (!current || price < current.price) {
      products.set(mapKey, {
        ...parsed,
        mapKey,
        price,
        pricePerUnit: parsed.quantity ? price / parsed.quantity : null,
        rawName: row.Produk,
        rawPrice: row.Harga,
      });
    }
  }

  return products;
}

function findMatches(mainProduct, competitorProducts) {
  const exactMatch = competitorProducts.get(mainProduct.mapKey);
  if (exactMatch) {
    return [{ product: exactMatch, quantityDifference: 0 }];
  }

  if (mainProduct.category !== "diamond" || mainProduct.quantity === null) {
    return [];
  }

  const maxDifference = Math.min(
    5,
    Math.max(1, Math.ceil(mainProduct.quantity * 0.1)),
  );

  return Array.from(competitorProducts.values())
    .filter(
      (candidate) =>
        candidate.category === "diamond" &&
        candidate.quantity !== null &&
        Math.abs(candidate.quantity - mainProduct.quantity) <= maxDifference,
    )
    .sort((first, second) => {
      const firstDistance = Math.abs(first.quantity - mainProduct.quantity);
      const secondDistance = Math.abs(second.quantity - mainProduct.quantity);
      return firstDistance - secondDistance || first.pricePerUnit - second.pricePerUnit;
    })
    .slice(0, 3)
    .map((product) => ({
      product,
      quantityDifference: product.quantity - mainProduct.quantity,
    }));
}

module.exports = {
  findMatches,
  parsePrice,
  parseProduct,
  selectCheapestProducts,
};
