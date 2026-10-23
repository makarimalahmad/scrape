// Ekstraktor metadata terstruktur: Schema.org (JSON-LD) dan GA4 dataLayer
function extractProductPairsFromJson(data) {
  const results = [];
  const seen = new Set();

  function scan(obj, depth = 0) {
    if (!obj || depth > 10) return;

    if (Array.isArray(obj)) {
      for (const item of obj) {
        scan(item, depth + 1);
      }
    } else if (typeof obj === "object") {
      const name = obj.name || obj.internalName || obj.product_name || obj.title || obj.item_name || obj.slug;

      let rawPrice = null;
      if (typeof obj.price === "object" && obj.price !== null) {
        rawPrice = obj.price.current ?? obj.price.finalPrice ?? obj.price.nominal ?? obj.price.value;
      } else if (obj.price !== undefined) {
        rawPrice = obj.price;
      } else if (obj.offers !== undefined && obj.offers !== null) {
        if (typeof obj.offers === "object") {
          rawPrice = obj.offers.price ?? obj.offers.lowPrice;
        } else if (typeof obj.offers === "number" || typeof obj.offers === "string") {
          rawPrice = obj.offers;
        }
      } else if (obj.nominal !== undefined) {
        rawPrice = obj.nominal;
      } else if (obj.final_price !== undefined) {
        rawPrice = obj.final_price;
      } else if (obj.selling_price !== undefined) {
        rawPrice = obj.selling_price;
      }

      if (typeof name === "string" && rawPrice !== undefined && rawPrice !== null) {
        let numPrice = 0;
        if (typeof rawPrice === "number") {
          numPrice = rawPrice;
        } else {
          numPrice = Number(String(rawPrice).replace(/[^\d]/g, ""));
        }

        if (numPrice > 0 && numPrice < 100_000_000) {
          const kataKunciValid = /(?:diamond|\bdm\b|robux|roblox|pass|membership|member|voucher|uc|point|coin|token)/i;
          if (kataKunciValid.test(name)) {
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

async function extractMetadataRows(page) {
  try {
    const rawJsonPayloads = await page.evaluate(() => {
      const payloads = [];
      const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
      for (const script of scripts) {
        try {
          const parsed = JSON.parse(script.textContent || "");
          if (parsed) payloads.push(parsed);
        } catch {}
      }
      if (Array.isArray(window.dataLayer)) {
        payloads.push(window.dataLayer);
      }
      return payloads;
    });

    if (rawJsonPayloads && rawJsonPayloads.length > 0) {
      const structuredRows = [];
      const seen = new Set();
      for (const payload of rawJsonPayloads) {
        const rows = extractProductPairsFromJson(payload);
        for (const row of rows) {
          const key = `${row.Produk.toLowerCase()}|${row.Harga.toLowerCase()}`;
          if (!seen.has(key)) {
            seen.add(key);
            structuredRows.push(row);
          }
        }
      }
      if (structuredRows.length >= 3) {
        return structuredRows;
      }
    }
  } catch {}

  return [];
}

module.exports = {
  extractMetadataRows,
  extractProductPairsFromJson,
};
