// Ekstraksi produk khusus untuk toko dengan DOM unik, multi-tab, atau endpoint API
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

// Toko Utama (UPoint & DuniaGames)

/** UPoint (upoint.id) */
async function extractUPointRows(page) {
  // 1. Ekstraksi untuk DOM baru UPoint (elemen dengan atribut [data-denom-label])
  const hasilBaru = await page.evaluate(() => {
    const list = [];
    const denomLabels = Array.from(document.querySelectorAll("[data-denom-label]"));
    if (denomLabels.length > 0) {
      for (const labelEl of denomLabels) {
        const productName = (labelEl.getAttribute("title") || labelEl.textContent || "").trim();
        const parent = labelEl.closest("button") || labelEl.parentElement;
        if (!parent) continue;

        // Cari elemen harga di dalam kartu
        const spans = Array.from(parent.querySelectorAll("span"));
        let priceText = "";
        for (const span of spans) {
          if (span === labelEl) continue;
          const text = span.textContent.trim();
          // Format angka Rupiah seperti 20.398 atau 1.540.725
          if (/^\d{1,3}(?:\.\d{3})*$/.test(text) || /^Rp\.?\s*\d+/i.test(text)) {
            priceText = text;
            break;
          }
        }

        if (productName && priceText) {
          list.push({
            Produk: productName,
            Harga: priceText.startsWith("Rp") ? priceText : `Rp ${priceText}`,
          });
        }
      }
    } else {
      // Fallback deteksi kartu button berformat nama & harga
      const cards = Array.from(document.querySelectorAll("button")).filter(
        (b) =>
          b.className &&
          typeof b.className === "string" &&
          b.className.includes("rounded-xl") &&
          b.className.includes("flex-col"),
      );
      for (const card of cards) {
        const lines = (card.innerText || "")
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l && !/promo|hot|laris/i.test(l));
        if (lines.length >= 2) {
          const productName = lines[0];
          const priceLine = lines.find(
            (l) => /^\d{1,3}(?:\.\d{3})*$/.test(l) || /^Rp\.?\s*\d+/i.test(l),
          );
          if (productName && priceLine) {
            list.push({
              Produk: productName,
              Harga: priceLine.startsWith("Rp") ? priceLine : `Rp ${priceLine}`,
            });
          }
        }
      }
    }
    return list;
  });

  if (hasilBaru && hasilBaru.length > 0) {
    return hasilBaru;
  }

  // 2. Fallback untuk versi lama UPoint (format "Nama from Harga" dengan class .cursor-pointer)
  const semuaTeksKartu = await page
    .locator(".cursor-pointer")
    .allInnerTexts()
    .catch(() => []);
  const daftarProduk = [];

  for (const teks of semuaTeksKartu) {
    const teksBersih = teks.replace(/\s+/g, " ").trim();
    if (teksBersih.toLowerCase().includes(" from ")) {
      const bagian = teksBersih.split(/ from /i);
      const nama = bagian[0].trim();
      const harga = bagian[1]?.trim() || "";

      const angkaSaja = harga.replace(/\./g, "");
      if (nama && angkaSaja && !isNaN(Number(angkaSaja)) && Number(angkaSaja) > 0) {
        daftarProduk.push({
          Produk: nama,
          Harga: `Rp ${harga}`,
        });
      }
    }
  }

  return daftarProduk;
}

/** DuniaGames (duniagames.co.id) */
async function extractDuniaGamesRows(page) {
  // 1. Tunggu sampai kartu produk DuniaGames (.denom) selesai dirender di layar
  const ready = await page
    .waitForFunction(
      () => {
        const popupError = document.querySelector(
          "app-popup-error-transaction, .error-payment-wrapper, [class*='error-payment']",
        );
        if (popupError) return true;

        const kartuPertama = document.querySelector(".denom");
        if (!kartuPertama) return false;

        const adaNama = kartuPertama.querySelector(".head-dnm")?.textContent?.trim();
        const adaHarga = kartuPertama.querySelector(".price-dnm .pr")?.textContent?.trim();
        return Boolean(adaNama && adaHarga);
      },
      null,
      { timeout: 30_000, polling: 250 },
    )
    .then(() => true)
    .catch(() => false);

  if (!ready) return [];

  // 2. Ambil data produk langsung dari elemen DOM di dalam browser
  const hasilProduk = await page.evaluate(() => {
    const semuaKartu = document.querySelectorAll(".denom");
    const daftar = [];

    // 3. Periksa setiap kartu satu per satu
    for (const kartu of semuaKartu) {
      // Ambil teks nama produk dari elemen .head-dnm
      const elemenNama = kartu.querySelector(".head-dnm");
      const nama = elemenNama ? elemenNama.textContent.replace(/\s+/g, " ").trim() : "";

      // Ambil teks harga dari elemen .price-dnm .pr
      const elemenHarga = kartu.querySelector(".price-dnm .pr");
      const harga = elemenHarga ? elemenHarga.textContent.replace(/\s+/g, " ").trim() : "";

      // Validasi: pastikan nama dan harga ada serta harga berupa angka positif
      const angkaSaja = harga.replace(/\./g, "");
      if (nama && harga && !isNaN(Number(angkaSaja)) && Number(angkaSaja) > 0) {
        daftar.push({
          Produk: nama,
          Harga: `Rp ${harga}`,
        });
      }
    }

    return daftar;
  });

  return hasilProduk;
}

// Publisher & Toko Resmi

/** KiosGamer (kiosgamer.co.id) - Garena Free Fire API */
async function extractKiosgamerRows(page) {
  // 1. Ambil data produk resmi dari endpoint API KiosGamer
  const urlApi = "https://kiosgamer.co.id/api/shop/apps/channels?app_id=100067&region=CO.ID&language=id";
  const respons = await page.request.get(urlApi);
  if (!respons.ok()) return [];

  const data = await respons.json();
  if (!data.channels) return [];

  // 2. Cari jalur pembayaran QRIS
  let saluranQris = null;
  for (const saluran of data.channels) {
    if (saluran.name === "QRIS") {
      saluranQris = saluran;
      break;
    }
  }

  if (!saluranQris || !saluranQris.items) return [];

  // 3. Susun daftar produk dan harga
  const hasilProduk = [];
  for (const item of saluranQris.items) {
    const adaDiamond = item.app_point_amount > 0;
    const adaKartuMember = Boolean(item.rebate_card && item.rebate_card.name);

    if (adaDiamond || adaKartuMember) {
      const nama = adaKartuMember ? item.rebate_card.name : `${item.app_point_amount} Diamonds`;
      const harga = `Rp ${Number(item.currency_amount).toLocaleString("id-ID")}`;

      hasilProduk.push({
        Produk: nama,
        Harga: harga,
      });
    }
  }

  return hasilProduk;
}

/** Roblox Official (roblox.com) */
async function extractRobloxRows(page) {
  // 1. Tunggu kartu produk Roblox tampil di layar
  const daftarElemen = page.locator("[data-product-id]");
  const kartuPertama = daftarElemen.filter({ hasText: /(?:Rp\.?|IDR)/i }).first();
  const ready = await kartuPertama.waitFor({ state: "visible", timeout: 30_000 }).then(() => true).catch(() => false);
  if (!ready) return [];

  // 2. Ambil teks dari seluruh kartu produk
  const semuaTeksKartu = await daftarElemen.allInnerTexts();
  const daftarProduk = [];

  // 3. Ekstraksi nama dan harga dari setiap teks kartu
  for (const teks of semuaTeksKartu) {
    const item = parseRobloxProductCard(teks);
    if (item) {
      daftarProduk.push(item);
    }
  }

  return dedupeRows(daftarProduk);
}

/** MobaPay (mobapay.com) */
async function extractMobapayRows(page) {
  // 1. Klik tombol panah scroll jika ada agar katalog terbuka penuh
  const tombolPanah = page.locator(".mobapay-scroll-recharge-arrow").first();
  if (await tombolPanah.count()) {
    await tombolPanah.click({ force: true }).catch(() => {});
    await page.waitForTimeout(1_000);
  }

  // 2. Ambil data produk langsung dari DOM browser
  const hasilProduk = await page.evaluate(() => {
    const semuaKartu = document.querySelectorAll(".mobapay-recharge-item");
    const daftar = [];

    for (const kartu of semuaKartu) {
      const barisTeks = (kartu.innerText || "").split("\n");
      const barisBersih = [];
      for (const b of barisTeks) {
        const teks = b.trim();
        if (teks) barisBersih.push(teks);
      }

      // Ambil harga dari baris yang memuat format Rp
      let harga = "";
      for (const baris of barisBersih) {
        if (/^Rp\.?\s*[\d.]+/i.test(baris)) {
          harga = baris;
        }
      }

      // Ambil nama dari baris selain harga dan selain diskon persen
      const bagianNama = [];
      for (let i = 0; i < barisBersih.length; i += 1) {
        const baris = barisBersih[i];
        if (/^Rp\.?\s*[\d.]+/i.test(baris)) continue;
        if (baris === "%" || /^-?\d+\s*%/i.test(baris)) continue;
        if (barisBersih[i + 1] === "%" && /^-?\d+$/.test(baris)) continue;
        bagianNama.push(baris);
      }

      let nama = bagianNama.join(" ").trim();
      // Khusus Mobile Legends di MobaPay: jika nama hanya angka, beri label Diamonds
      if (/^\d[\d.,]*(?:\s*\+\s*\d[\d.,]*)?$/.test(nama)) {
        nama = `${nama} Diamonds`;
      }

      if (nama && harga) {
        daftar.push({
          Produk: nama,
          Harga: harga,
        });
      }
    }

    return daftar;
  });

  return hasilProduk;
}

// Marketplace & E-Commerce

/** Tokopedia (tokopedia.com) */
async function extractTokopediaRows(page) {
  const allRows = [];
  const consentButton = page.getByText("Saya mengerti", { exact: true });
  if (await consentButton.count()) {
    await consentButton.click({ force: true }).catch(() => {});
    await page.waitForTimeout(250);
  }

  // 1. Loop setiap tab kategori produk di Tokopedia
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

    // 2. Ambil produk dari tab yang aktif menggunakan loop sederhana
    const tabRows = await page.evaluate(() => {
      const kartuProduk = document.querySelectorAll('[role="tabpanel"][data-state="active"] > div');
      const hasil = [];

      for (const kartu of kartuProduk) {
        const elemenNama = kartu.querySelector("h3");
        const nama = elemenNama ? elemenNama.textContent.replace(/\s+/g, " ").trim() : "";
        const teks = kartu.textContent ? kartu.textContent.replace(/\s+/g, " ").trim() : "";
        const hargaCocok = teks.match(/Rp\s*\d[\d.]*/i);
        const harga = hargaCocok ? hargaCocok[0] : "";

        if (nama && harga) {
          hasil.push({ Produk: nama, Harga: harga });
        }
      }

      return hasil;
    });

    allRows.push(...tabRows);
  }

  return dedupeRows(allRows);
}

/** Blibli (blibli.com) */
async function extractBlibliRows(page, url, interceptedPayloads = []) {
  const payloads = Array.isArray(url)
    ? url
    : Array.isArray(interceptedPayloads)
      ? interceptedPayloads
      : [];
  const blibliApi = payloads.find((r) => r?.url && r.url.includes("/backend/digital-product/products"));
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
    const items = await page.evaluate((selector) => {
      const btns = document.querySelectorAll(selector);
      const daftar = [];

      for (const btn of btns) {
        const titleEl = btn.querySelector(".title");
        const title = titleEl ? titleEl.innerText.trim() : "";

        const priceEl = btn.querySelector(".current-price") || btn.querySelector(".price");
        const price = priceEl ? priceEl.innerText.trim() : "";

        if (title && price) {
          daftar.push({ Produk: title, Harga: price });
        }
      }

      return daftar;
    }, buttonSelector);

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

    const optionRows = await page.evaluate(() => {
      const options = document.querySelectorAll("li");
      const daftar = [];

      for (const option of options) {
        const text = (option.innerText || "").replace(/\s+/g, " ").trim();
        const productMatch = text.match(/(?:Rp[\d.]+,-\s+Roblox Gift Card|\d[\d.]*\s+Diamonds?)/i);
        const product = productMatch ? productMatch[0] : "";
        const prices = text.match(/Rp\s*[\d.]+/gi) || [];
        const price = prices.length > 0 ? prices[prices.length - 1] : "";

        if (product && price) {
          daftar.push({ Produk: product, Harga: price });
        }
      }

      return daftar;
    });

    if (optionRows.length) return dedupeRows(optionRows);
  }

  const bodyText = await page.locator("body").innerText();
  const diamondSectionMatch = bodyText.match(/Jumlah Diamond\s+Harga([\s\S]*?)(?:Untuk membeli item|Cara\s+redeem)/i);
  if (!diamondSectionMatch || !diamondSectionMatch[1]) return [];

  const rows = [];
  const diamondPattern = /(\d[\d.]*)\s+Diamonds?\s+(Rp\s*[\d.]+)/gi;
  for (const match of diamondSectionMatch[1].matchAll(diamondPattern)) {
    rows.push({ Produk: `${match[1]} Diamonds`, Harga: match[2] });
  }
  return dedupeRows(rows);
}

// Toko Voucher Game

/** UniPin (unipin.com) */
async function extractUniPinRows(page) {
  // 1. Ambil teks dari seluruh tombol nominal voucher di UniPin
  const semuaTeksKartu = await page.locator(".denom-container > button").allInnerTexts();
  const daftarProduk = [];

  // 2. Periksa setiap tombol satu per satu menggunakan perulangan biasa
  for (const teks of semuaTeksKartu) {
    const teksBersih = teks.replace(/\s+/g, " ").trim();
    if (!teksBersih.toLowerCase().includes("idr")) continue;

    const priceMatch = teksBersih.match(/\bIDR\s*(\d[\d.]*)\b/i);
    if (!priceMatch) continue;

    const nominalAngka = priceMatch[1];
    const angkaSaja = nominalAngka.replace(/\./g, "");
    if (!angkaSaja || isNaN(Number(angkaSaja)) || Number(angkaSaja) <= 0) continue;

    const nama = teksBersih.slice(0, priceMatch.index).trim();
    if (!nama || nama.toLowerCase() === "total") continue;

    daftarProduk.push({
      Produk: nama,
      Harga: `IDR ${nominalAngka}`,
    });
  }

  return daftarProduk;
}

/** UniPin Roblox (unipin.com) */
async function extractUnipinRobloxRows(page) {
  const bodyText = await page.locator("body").innerText();
  const sectionMatch = bodyText.match(/Pilih Jumlah([\s\S]*?)(?:Pilih Saluran Pembayaran|Checkout)/i);
  if (!sectionMatch || !sectionMatch[1]) return [];

  const rows = [];
  const pattern = /Rp([\d.]+),?-?\s+Roblox Gift Card\s+IDR\s*([\d.]+)/gi;
  for (const match of sectionMatch[1].matchAll(pattern)) {
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
  // 1. Ambil data kartu varian produk di GoPay
  const hasilProduk = await page.evaluate(() => {
    const semuaKartu = document.querySelectorAll('[id^="variant-"] .grid > div');
    const daftar = [];

    // 2. Periksa setiap kartu satu per satu
    for (const card of semuaKartu) {
      const elemenJudul = card.querySelector("h3");
      const nama = elemenJudul ? elemenJudul.innerText.trim() : "";

      const teksKartu = card.innerText || "";
      const daftarHarga = teksKartu.match(/Rp\s*[\d.]+/gi) || [];
      const harga = daftarHarga.length > 0 ? daftarHarga[0] : "";

      if (nama && harga) {
        daftar.push({
          Produk: nama,
          Harga: harga,
        });
      }
    }

    return daftar;
  });

  return hasilProduk;
}

/** Ditusi (ditusi.co.id) */
async function extractDitusiRows(page) {
  if (/roblox/i.test(page.url()) && !page.url().includes("voucher-roblox-robux")) {
    await page.goto("https://ditusi.co.id/voucher-roblox-robux", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1_500);
  }

  await page.evaluate(() => {
    const modals = document.querySelectorAll(".modal, .modal-backdrop, #modal-request-permission, #customModal");
    for (const el of modals) el.remove();
    document.body.classList.remove("modal-open");
  });

  const allCards = [];

  const collectVisible = async () => {
    const cards = await page.evaluate(() => {
      const items = document.querySelectorAll(".item-product-click");
      const daftar = [];

      for (const el of items) {
        if (el.offsetParent === null) continue;
        const t = (el.innerText || "").replace(/\s+/g, " ").trim();
        const prices = t.match(/Rp\.?\s*[\d.]+/gi) || [];
        const prod = t.split(/Rp\.?/i)[0].replace(/Termurah/gi, "").trim();

        if (prod && prices.length > 0) {
          daftar.push({ Produk: prod, Harga: prices[0] });
        }
      }

      return daftar;
    });

    allCards.push(...cards);
  };

  await collectVisible();

  const subTabLabels = await page.evaluate(() => {
    const labels = document.querySelectorAll("#group-category-game label");
    const daftar = [];
    for (const l of labels) {
      const txt = l.innerText ? l.innerText.trim() : "";
      if (txt) daftar.push(txt);
    }
    return daftar;
  });

  for (const labelText of subTabLabels) {
    if (/usd|global|foreign|sar|brl/i.test(labelText)) continue;
    await page.evaluate((txt) => {
      const labels = document.querySelectorAll("#group-category-game label");
      for (const lbl of labels) {
        if (lbl.innerText && lbl.innerText.trim() === txt) {
          lbl.click();
          break;
        }
      }
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

  const rawList = await page.evaluate(() => {
    const items = document.querySelectorAll("div.product-item");
    const daftar = [];

    for (const card of items) {
      const inputEl = card.querySelector("input[data-title]");
      const titleEl = card.querySelector(".product-title");
      const title = inputEl ? inputEl.getAttribute("data-title") : (titleEl ? titleEl.innerText.trim() : "");

      const priceEl = card.querySelector(".current-price, .pricing");
      const priceText = priceEl ? priceEl.innerText : "";
      const priceMatch = priceText.match(/Rp\s*[\d.]+/i);
      const price = priceMatch ? priceMatch[0] : "";

      if (title && price) {
        daftar.push({
          Produk: title.replace(/\s+/g, " ").trim(),
          Harga: price,
        });
      }
    }

    return daftar;
  });

  return dedupeRows(rawList);
}

/** VexaGame (vexagame.com) */
async function extractVexagameRows(page) {
  const hasilProduk = await page.evaluate(() => {
    const cards = document.querySelectorAll('#diamond-cards [role="option"]');
    const daftar = [];

    for (const card of cards) {
      const prodEl = card.querySelector("p");
      const product = prodEl ? prodEl.innerText.trim() : "";

      const text = (card.innerText || "").replace(/\s+/g, " ").trim();
      const prices = text.match(/Rp\s*[\d.]+/gi) || [];
      const price = prices.length > 0 ? prices[prices.length - 1] : "";

      if (product && price) {
        daftar.push({ Produk: product, Harga: price });
      }
    }

    return daftar;
  });

  return hasilProduk;
}

/** Lapakgaming (lapakgaming.com) */
async function extractLapakgamingRows(page) {
  await page
    .waitForFunction(
      () => {
        const elements = document.querySelectorAll("div, button");
        for (const el of elements) {
          const text = el.innerText || "";
          if (/Rp\s*[\d.]+/i.test(text) && text.includes("\n")) return true;
        }
        return false;
      },
      null,
      { timeout: 25_000 },
    )
    .catch(() => {});

  const rawRows = await page.evaluate(() => {
    const allElements = document.querySelectorAll("div, button");
    const matchingCards = [];

    for (const el of allElements) {
      const lines = (el.innerText || "").split("\n");
      const cleanLines = [];
      for (const l of lines) {
        const t = l.trim();
        if (t) cleanLines.push(t);
      }

      if (cleanLines.length >= 2 && cleanLines.length <= 8) {
        let hasPrice = false;
        let hasProduct = false;
        let isPaymentMethod = false;

        for (const l of cleanLines) {
          if (/^Rp[\d.]+/i.test(l) || /^Dari\s*Rp[\d.]+/i.test(l)) hasPrice = true;
          if (/\b(?:diamonds?|robux|dm|voucher|gift\s*card|pass|membership)\b/i.test(l) || /^\d+[\d.,]*\s*(?:diamonds?|robux|dm)?$/i.test(l)) hasProduct = true;
          if (/^(?:QRIS|DANA|GoPay|OVO|ShopeePay|Virtual Account|Alfamart|ATM Bersama)$/i.test(l)) isPaymentMethod = true;
        }

        if (hasPrice && hasProduct && !isPaymentMethod) {
          matchingCards.push(el);
        }
      }
    }

    // Ambil kartu paling spesifik (daun terdalam)
    const leafCards = [];
    for (const c of matchingCards) {
      let containsOther = false;
      for (const other of matchingCards) {
        if (other !== c && c.contains(other)) {
          containsOther = true;
          break;
        }
      }
      if (!containsOther) {
        leafCards.push(c);
      }
    }

    const daftar = [];
    for (const card of leafCards) {
      const lines = (card.innerText || "").split("\n");
      const cleanLines = [];
      for (const l of lines) {
        const t = l.trim();
        if (t) cleanLines.push(t);
      }

      let name = "";
      let price = "";

      for (const l of cleanLines) {
        if (!name && !/^(?:Dari|Promo|Diskon|\+[\d%]+ Bonus|Termurah|\d+%)$/i.test(l) && !/^Rp[\d.]+/i.test(l)) {
          name = l;
        }
        if (/^Rp[\d.]+/i.test(l) || /^Dari\s*Rp[\d.]+/i.test(l)) {
          const match = l.match(/Rp[\d.]+/i);
          price = match ? match[0] : l;
        }
      }

      if (!name && cleanLines.length > 0) name = cleanLines[0];

      if (name && price) {
        daftar.push({ Produk: name, Harga: price });
      }
    }

    return daftar;
  });

  return dedupeRows(rawRows);
}

/** GOGOGO (gogogo.com / gogogo.id) */
async function extractGogogoRows(page) {
  await page
    .waitForFunction(
      () => {
        const cards = document.querySelectorAll('div[class*="hover:border-golden-yellow"], div[class*="rounded-xl"]');
        for (const c of cards) {
          if (/Rp[\d.]+/i.test(c.innerText || "")) return true;
        }
        return false;
      },
      null,
      { timeout: 15_000, polling: 250 },
    )
    .catch(() => {});

  const rawRows = await page.evaluate(() => {
    const cards = document.querySelectorAll('div[class*="hover:border-golden-yellow"], div[class*="rounded-xl"]');
    const daftar = [];

    for (const el of cards) {
      const text = el.innerText || "";
      if (!/Rp[\d.]+/i.test(text)) continue;
      if (el.querySelector('div[class*="hover:border-golden-yellow"], div[class*="rounded-xl"]')) continue;

      const lines = text.split("\n");
      const cleanLines = [];
      for (const l of lines) {
        const t = l.trim();
        if (t) cleanLines.push(t);
      }

      let name = "";
      let price = "";

      for (const l of cleanLines) {
        if (!name && !/^Rp[\d.]+/i.test(l) && !/^\d+%\s*OFF/i.test(l)) {
          name = l;
        }
        if (/^Rp[\d.]+/i.test(l)) {
          const match = l.match(/Rp\s*([\d.]+)/i);
          price = match ? `Rp ${match[1]}` : l;
        }
      }

      if (!name && cleanLines.length > 0) name = cleanLines[0];

      if (name && price) {
        daftar.push({ Produk: name, Harga: price });
      }
    }

    return daftar;
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

  const texts = await page.locator(".box-border.cursor-pointer").allInnerTexts();
  const rows = [];

  for (const text of texts) {
    const cleanText = text.replace(/\s+/g, " ").trim();
    const priceMatch = cleanText.match(/Rp\s*[\d.]+/i);
    if (!priceMatch) continue;

    const price = priceMatch[0];
    const product = cleanText.replace(/^PROMO\s*/i, "").split(/Rp\s*[\d.]+/i)[0].trim();

    if (product && price) {
      rows.push({ Produk: product, Harga: price });
    }
  }

  return dedupeRows(rows);
}

// Parser data Next.js RSC Flight stream untuk platform VocaGame (topupnolimit.com, dll)
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
    const cards = document.querySelectorAll(
      ".form-denomination li, .form-denomination button, [class*='denomination'] li",
    );
    const daftar = [];

    for (const card of cards) {
      const text = (card.innerText || "").replace(/\s+/g, " ").trim();
      const priceMatch = text.match(/Rp\.?\s*[\d.]+/i);
      if (!priceMatch) continue;

      const harga = priceMatch[0];
      const produk = text.split(/Rp\.?/i)[0].trim();

      if (produk && harga) {
        daftar.push({ Produk: produk, Harga: harga });
      }
    }

    return daftar;
  });

  return dedupeRows(domRows || []);
}

/** GarudaKu (garudaku.com) */
async function extractGarudakuRows(page, url, interceptedPayloads = []) {
  // 1. Cek dari intercepted network payloads untuk endpoint produk Garudaku
  let payload = interceptedPayloads.find(
    (p) => p.url && p.url.includes("topup-store-api.garudaku.com/v1/products"),
  );

  // 2. Jika belum ter-intercept saat domcontentloaded, tunggu sebentar respon API-nya
  if (!payload) {
    const res = await page
      .waitForResponse(
        (r) =>
          r.url().includes("topup-store-api.garudaku.com/v1/products") &&
          r.status() === 200,
        { timeout: 10_000 },
      )
      .catch(() => null);
    if (res) {
      const data = await res.json().catch(() => null);
      if (data) payload = { url: res.url(), data };
    }
  }

  const items = payload?.data?.result || payload?.data?.data || [];
  if (Array.isArray(items) && items.length > 0) {
    const rows = [];
    for (const item of items) {
      const name = (item.short_name || item.name || "").trim();
      const priceNum = Number(item.selling_price || item.product_price || item.price || 0);
      if (name && priceNum > 0) {
        rows.push({
          Produk: name,
          Harga: `Rp ${priceNum.toLocaleString("id-ID")}`,
        });
      }
    }
    if (rows.length > 0) {
      return dedupeRows(rows);
    }
  }

  return [];
}

// Mapping Domain & Dispatcher
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
  "garudaku.com": extractGarudakuRows,
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
  extractGarudakuRows,
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
