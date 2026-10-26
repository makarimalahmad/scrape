// Ekstraksi produk khusus untuk toko dengan DOM unik, multi-tab, atau endpoint API
const { extractProductPairsFromJson } = require("./metadata-extractor");

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

// Helper ekstraksi produk berbasis kartu DOM standar (nama produk & harga Rp)
async function extractCards(page, selector, options = {}) {
  const { nameSelector = "", priceSelector = "", preferLastPrice = false } = options;

  return await page.evaluate(
    ({ selectorKartu, selectorNama, selectorHarga, ambilHargaTerakhir }) => {
      const daftarKartu = Array.from(document.querySelectorAll(selectorKartu));
      const hasil = [];

      for (const kartu of daftarKartu) {
        // Lewati kartu yang tersembunyi
        if (kartu.offsetParent === null) continue;

        let namaProduk = "";
        let hargaProduk = "";

        // 1. Ambil nama produk dari selector khusus jika ditentukan
        if (selectorNama) {
          const elemenNama = kartu.querySelector(selectorNama);
          if (elemenNama) {
            const teksNamaMentah = elemenNama.getAttribute("data-title") || elemenNama.getAttribute("title") || elemenNama.textContent;
            namaProduk = (teksNamaMentah || "").replace(/\s+/g, " ").trim();
          }
        }

        // 2. Ambil harga produk dari selector khusus jika ditentukan
        if (selectorHarga) {
          const daftarElemenHarga = Array.from(kartu.querySelectorAll(selectorHarga));
          if (daftarElemenHarga.length > 0) {
            const elemenHargaTarget = ambilHargaTerakhir ? daftarElemenHarga[daftarElemenHarga.length - 1] : daftarElemenHarga[0];
            const teksHargaMentah = (elemenHargaTarget.textContent || "").replace(/\s+/g, " ").trim();
            const formatHargaRp = teksHargaMentah.match(/(?:Rp\.?|IDR)\s*[\d.]+/gi);
            if (formatHargaRp && formatHargaRp.length > 0) {
              hargaProduk = ambilHargaTerakhir ? formatHargaRp[formatHargaRp.length - 1] : formatHargaRp[0];
            } else {
              hargaProduk = teksHargaMentah;
            }
          }
        }

        // 3. Ambil teks lengkap dari kartu dan pisahkan per baris
        const teksUtuhKartu = (kartu.innerText || kartu.textContent || "").replace(/\u00a0/g, " ");
        const daftarBarisTeks = teksUtuhKartu.split("\n");

        // 4. Jika harga belum didapat, cari nominal Rupiah di dalam teks kartu
        if (!hargaProduk) {
          if (ambilHargaTerakhir) {
            const semuaNominalRp = teksUtuhKartu.match(/(?:Rp\.?|IDR)\s*[\d.]+/gi);
            if (semuaNominalRp && semuaNominalRp.length > 0) {
              hargaProduk = semuaNominalRp[semuaNominalRp.length - 1];
            }
          } else {
            for (const baris of daftarBarisTeks) {
              const barisBersih = baris.trim();
              if (!barisBersih) continue;

              const cocokHarga = barisBersih.match(/(?:Rp\.?|IDR)\s*[\d.]+/i);
              if (cocokHarga) {
                hargaProduk = cocokHarga[0];
                break;
              }
            }
          }
        }

        // 5. Jika nama produk belum didapat, ambil dari baris teks kartu
        if (!namaProduk) {
          if (ambilHargaTerakhir && hargaProduk) {
            const posisiHarga = teksUtuhKartu.lastIndexOf(hargaProduk);
            if (posisiHarga > 0) {
              namaProduk = teksUtuhKartu.slice(0, posisiHarga).replace(/\s+/g, " ").trim();
            }
          }

          if (!namaProduk) {
            const kumpulanTeksNama = [];

            for (let i = 0; i < daftarBarisTeks.length; i += 1) {
              const barisBersih = daftarBarisTeks[i].trim();
              if (!barisBersih) continue;

              // Lewati baris harga Rupiah
              if (/(?:Rp\.?|IDR)\s*[\d.]+/i.test(barisBersih)) continue;

              // Lewati baris persentase diskon (contoh: "-10%" atau "%")
              if (barisBersih === "%" || /^-?\d+\s*%/i.test(barisBersih)) continue;
              const barisBerikutnya = (daftarBarisTeks[i + 1] || "").trim();
              if (barisBerikutnya === "%" && /^-?\d+$/.test(barisBersih)) continue;

              // Lewati label promo
              if (/^(?:promo|hot|laris|best seller|diskon|termurah|hemat|\d+%\s*off)$/i.test(barisBersih)) continue;

              kumpulanTeksNama.push(barisBersih);
            }

            namaProduk = kumpulanTeksNama.join(" ").trim();
          }
        }

        // 6. Bersihkan harga coret dan teks promosi dari nama produk
        const daftarElemenCoret = Array.from(kartu.querySelectorAll("del, s, [class*='line-through']"));
        for (const elemenCoret of daftarElemenCoret) {
          const teksCoret = (elemenCoret.textContent || "").trim();
          if (teksCoret) namaProduk = namaProduk.replace(teksCoret, "");
        }
        if (hargaProduk) {
          namaProduk = namaProduk.replace(hargaProduk, "");
        }
        namaProduk = namaProduk.replace(/^(?:promo|hot|laris|best seller|diskon|termurah|hemat|\d+%\s*off)\b/gi, "").replace(/\s+/g, " ").trim();

        // 7. Simpan produk jika nama dan harga valid
        if (namaProduk && hargaProduk) {
          const hargaFormat = /^Rp\.?|^IDR/i.test(hargaProduk) ? hargaProduk : `Rp ${hargaProduk}`;
          hasil.push({ Produk: namaProduk, Harga: hargaFormat });
        }
      }

      return hasil;
    },
    {
      selectorKartu: selector,
      selectorNama: nameSelector,
      selectorHarga: priceSelector,
      ambilHargaTerakhir: preferLastPrice,
    },
  );
}

// Toko Utama (UPoint & DuniaGames)

/** UPoint (upoint.id) */
async function extractUPointRows(page) {
  // 1. Ekstraksi kartu modern UPoint ([data-denom-label])
  const items = await page.evaluate(() => {
    const list = [];
    const labels = document.querySelectorAll("[data-denom-label]");
    for (const label of labels) {
      const name = (label.getAttribute("title") || label.textContent || "").trim();
      const parent = label.closest("button");
      if (!parent) continue;
      const priceSpan = Array.from(parent.querySelectorAll("span")).find(
        (s) => s !== label && /\d{1,3}(?:\.\d{3})*/.test(s.textContent),
      );
      const priceText = priceSpan ? priceSpan.textContent.trim() : "";
      if (name && priceText) {
        list.push({
          Produk: name,
          Harga: priceText.startsWith("Rp") ? priceText : `Rp ${priceText}`,
        });
      }
    }
    return list;
  });

  if (items.length >= 3) return dedupeRows(items);

  // 2. Fallback: Ekstraksi kartu tombol dari section 'Pilih Denom / Nominal' (mencegah metode pembayaran terambil)
  const fallback = await page.evaluate(() => {
    const list = [];
    const denomSection = Array.from(document.querySelectorAll("section")).find((sec) =>
      /pilih (?:denom|nominal|item)/i.test(sec.querySelector("h1, h2, h3, h4")?.textContent || ""),
    );
    const buttons = denomSection
      ? denomSection.querySelectorAll("button")
      : document.querySelectorAll("button.rounded-xl.flex-col");

    for (const btn of buttons) {
      const text = (btn.innerText || "").replace(/\s+/g, " ").trim();
      const match = text.match(/(?:PROMO\s+)?(.*?)\s+((?:\d{1,3}(?:\.\d{3})+|Rp\s*[\d.]+))$/i);
      if (match) {
        const name = match[1].trim();
        const price = match[2].trim();
        if (name && !/dana|qris|shopee|gopay|ovo|linkaja|telkomsel|indosat|xl|tri/i.test(name)) {
          list.push({
            Produk: name,
            Harga: price.startsWith("Rp") ? price : `Rp ${price}`,
          });
        }
      }
    }
    return list;
  });

  return dedupeRows(fallback);
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

  // 2. Ambil data produk menggunakan helper kartu DOM
  const hasilProduk = await extractCards(page, ".denom", {
    nameSelector: ".head-dnm",
    priceSelector: ".price-dnm .pr",
  });

  return dedupeRows(hasilProduk);
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

// Mem-parsing kartu produk Roblox (jumlah Robux dan nominal harga)
function parseRobloxProductCard(text) {
  if (!text) return null;
  const teksBersih = String(text).replace(/\s+/g, " ").trim();

  // 1. Ambil angka jumlah Robux (angka di awal teks)
  const kecocokanJumlah = teksBersih.match(/^([\d.,]+)/);
  // 2. Ambil harga (misal: "Rp 150.000" atau "Rp 150 rb")
  const kecocokanHarga = teksBersih.match(/(?:Rp\.?|IDR)\s*([\d.,]+)\s*(rb|ribu|jt|juta)?/i);

  if (!kecocokanJumlah || !kecocokanHarga) return null;

  const jumlahRobux = Number(kecocokanJumlah[1].replace(/[.,]/g, ""));
  const angkaHargaTeks = kecocokanHarga[1];
  const akhiran = (kecocokanHarga[2] || "").toLowerCase();

  let angkaFormat = angkaHargaTeks;
  if (akhiran) {
    angkaFormat = angkaFormat.replace(",", ".");
  } else {
    angkaFormat = angkaFormat.replace(/\./g, "").replace(",", ".");
  }
  const angkaDesimal = Number(angkaFormat);

  let pengali = 1;
  if (akhiran === "rb" || akhiran === "ribu") {
    pengali = 1000;
  } else if (akhiran === "jt" || akhiran === "juta") {
    pengali = 1000000;
  }

  const hargaFinal = Math.round(angkaDesimal * pengali);
  if (!jumlahRobux || jumlahRobux <= 0 || !hargaFinal || hargaFinal <= 0) {
    return null;
  }

  return {
    Produk: `${jumlahRobux} Robux`,
    Harga: `Rp ${hargaFinal.toLocaleString("id-ID")}`,
  };
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

  // 2. Ambil data produk menggunakan helper kartu DOM
  const hasilProduk = await extractCards(page, ".mobapay-recharge-item");

  // Khusus Mobile Legends di MobaPay: jika nama hanya angka, beri label Diamonds
  for (const item of hasilProduk) {
    if (/^\d[\d.,]*(?:\s*\+\s*\d[\d.,]*)?$/.test(item.Produk)) {
      item.Produk = `${item.Produk} Diamonds`;
    }
  }

  return dedupeRows(hasilProduk);
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

    // 2. Ambil produk dari tab yang aktif menggunakan helper kartu DOM
    const tabRows = await extractCards(page, '[role="tabpanel"][data-state="active"] > div', {
      nameSelector: "h3",
    });

    allRows.push(...tabRows);
  }

  return dedupeRows(allRows);
}

// Mem-parsing opsi dropdown Blibli (format: "[Produk] Rp [Harga]")
function parseBlibliOptionText(text) {
  if (!text) return null;
  const teksBersih = String(text).replace(/\s+/g, " ").trim();

  const kecocokanHarga = teksBersih.match(/Rp\s*\d[\d.]*/i);
  if (!kecocokanHarga) return null;

  const hargaTeks = kecocokanHarga[0];
  const angkaSaja = hargaTeks.replace(/[^\d]/g, "");
  if (!angkaSaja || Number(angkaSaja) <= 0) return null;

  const namaProduk = teksBersih.slice(0, kecocokanHarga.index).trim();
  if (!namaProduk) return null;

  return {
    Produk: namaProduk,
    Harga: hargaTeks,
  };
}

/** Blibli (blibli.com) */
async function extractBlibliRows(page, url, interceptedPayloads = []) {
  const payloads = Array.isArray(url)
    ? url
    : Array.isArray(interceptedPayloads)
      ? interceptedPayloads
      : [];
  let blibliApi = payloads.find((responPayload) => responPayload?.url && responPayload.url.includes("/backend/digital-product/products"));

  // 1. Tunggu respon API backend jika belum ter-intercept saat domcontentloaded
  if (!blibliApi && page?.waitForResponse) {
    const res = await page
      .waitForResponse(
        (resp) => resp.url().includes("/backend/digital-product/products") && resp.status() === 200,
        { timeout: 5_000 },
      )
      .catch(() => null);
    if (res) {
      const data = await res.json().catch(() => null);
      if (data) blibliApi = { url: res.url(), data };
    }
  }

  if (blibliApi?.data) {
    const apiRows = extractProductPairsFromJson(blibliApi.data);
    if (apiRows.length) return apiRows;
  }

  // 2. Fallback: Ekstraksi via dropdown tray virtualized jika API tidak tertangkap
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
      { timeout: 15_000, polling: 250 },
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

  await activeTray.evaluate((tray) => (tray.scrollTop = 0)).catch(() => {});
  await page.waitForTimeout(250);
  await collectVisible();

  for (let i = 0; i < 25; i += 1) {
    const prevCount = rows.length;
    await activeTray.evaluate((tray) => (tray.scrollTop += 250)).catch(() => {});
    await page.waitForTimeout(150);
    await collectVisible();
    const atBottom = await activeTray.evaluate((tray) => tray.scrollTop + tray.clientHeight >= tray.scrollHeight - 5).catch(() => true);
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
    const items = await extractCards(page, buttonSelector, {
      nameSelector: ".title",
      priceSelector: ".current-price, .price",
      preferLastPrice: true,
    });
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
  // 1. Ekstraksi dari opsi dropdown picker produk Shopee jika tersedia
  const productPicker = page.getByText(/Pilih Nominal (?:Roblox|Free Fire)/i, { exact: true }).first();
  const pickerReady = await productPicker.waitFor({ state: "visible", timeout: 10_000 }).then(() => true).catch(() => false);

  if (pickerReady) {
    await productPicker.click().catch(() => {});
    await page.locator("li").filter({ hasText: /Roblox Gift Card|Diamonds?/i }).first().waitFor({ state: "visible", timeout: 8_000 }).catch(() => {});

    // Ambil seluruh opsi dropdown
    const optionRows = await page.evaluate(() => {
      const daftarOpsi = document.querySelectorAll("li");
      const hasil = [];

      for (const opsi of daftarOpsi) {
        const teks = (opsi.innerText || "").replace(/\s+/g, " ").trim();

        // Cari nama produk (contoh: "Rp50.000,- Roblox Gift Card" atau "50 Diamonds")
        const cariProduk = teks.match(/(?:Rp[\d.]+,-\s+Roblox Gift Card|\d[\d.]*\s+Diamonds?)/i);
        const namaProduk = cariProduk ? cariProduk[0] : "";

        // Cari harga Rupiah (ambil harga diskon terakhir di baris)
        const daftarHarga = teks.match(/Rp\s*[\d.]+/gi) || [];
        const hargaFinal = daftarHarga.length > 0 ? daftarHarga[daftarHarga.length - 1] : "";

        if (namaProduk && hargaFinal) {
          hasil.push({ Produk: namaProduk, Harga: hargaFinal });
        }
      }

      return hasil;
    });

    if (optionRows.length > 0) return dedupeRows(optionRows);
  }

  // 2. Fallback: Ekstraksi teks tabel dari deskripsi produk seller (contoh: "Jumlah Diamond ... Harga")
  const bodyText = await page.locator("body").innerText().catch(() => "");
  const diamondSectionMatch = bodyText.match(/Jumlah Diamond\s+Harga([\s\S]*?)(?:Untuk membeli item|Cara\s+redeem)/i);
  if (!diamondSectionMatch || !diamondSectionMatch[1]) return [];

  const rows = [];
  const diamondPattern = /(\d[\d.]*)\s+Diamonds?\s+(Rp\s*[\d.]+)/gi;
  for (const match of diamondSectionMatch[1].matchAll(diamondPattern)) {
    rows.push({ Produk: `${match[1]} Diamonds`, Harga: match[2] });
  }
  return dedupeRows(rows);
}

/** Itemku (itemku.com) */
async function extractItemkuRows(page) {
  const rawRows = await extractCards(page, ".grid > .h-full > .group.cursor-pointer", {
    preferLastPrice: true,
  });
  return dedupeRows(rawRows);
}

// Toko Voucher Game

/** UniPin (unipin.com) */
async function extractUniPinRows(page) {
  // 1. Ekstraksi kartu tombol voucher UniPin menggunakan helper standar
  const rows = await extractCards(
    page,
    ".denom-container button, button.position-relative, div.form-check-label-rounded-lg",
    {
      nameSelector: ".fsemibold, .title, .denomination-name",
      priceSelector: ".price, .text-right, span.text-primary, [class*='text-white']:last-child",
      preferLastPrice: true,
    },
  );

  if (rows.length > 0) return dedupeRows(rows);

  // 2. Fallback jika format teks berupa "Nama Produk IDR Nominal"
  const semuaTeksKartu = await page
    .locator(".denom-container > button, button.position-relative")
    .allInnerTexts()
    .catch(() => []);
  const daftarProduk = [];

  for (const teks of semuaTeksKartu) {
    const teksBersih = teks.replace(/\s+/g, " ").trim();
    const cariHarga = teksBersih.match(/\b(?:IDR|Rp\.?)\s*([\d.]+)\b/i);
    if (!cariHarga) continue;

    const namaProduk = teksBersih.split(/(?:IDR|Rp\.?)/i)[0].trim();
    if (!namaProduk || namaProduk.toLowerCase() === "total") continue;

    daftarProduk.push({
      Produk: namaProduk,
      Harga: `IDR ${cariHarga[1]}`,
    });
  }

  return dedupeRows(daftarProduk);
}

/** UniPin Roblox (unipin.com) */
async function extractUnipinRobloxRows(page) {
  const bodyText = await page.locator("body").innerText().catch(() => "");
  const sectionMatch = bodyText.match(/Pilih Jumlah([\s\S]*?)(?:Pilih Saluran Pembayaran|Checkout)/i);
  if (!sectionMatch || !sectionMatch[1]) return [];

  const rows = [];
  const pattern = /Rp([\d.]+),?-?\s+Roblox Gift Card\s+IDR\s*([\d.]+)/gi;
  for (const match of sectionMatch[1].matchAll(pattern)) {
    rows.push({ Produk: `Roblox IDR ${match[1]}`, Harga: `IDR ${match[2]}` });
  }
  return dedupeRows(rows);
}

/** VCGamers (vcgamers.com) */
async function extractVcgamersRows(page) {
  const nextData = await page.evaluate(() => {
    const elemenNextData = document.getElementById("__NEXT_DATA__");
    return elemenNextData ? JSON.parse(elemenNextData.textContent) : null;
  }).catch(() => null);

  if (nextData) {
    const rows = extractProductPairsFromJson(nextData);
    if (rows.length) return rows;
  }
  return [];
}

/** Lootbar (lootbar.com) */
async function extractLootbarRows(page) {
  const rawRows = await extractCards(page, "li.topup-list-con-item", {
    nameSelector: ".topup-name",
    priceSelector: ".discount-price, .price",
  });
  return dedupeRows(rawRows);
}

/** Topup GGWP (topup.ggwp.id) */
async function extractTopupGGWPRows(page) {
  const rawRows = await extractCards(page, "article.card-product, .card-product", {
    nameSelector: ".product-name",
    priceSelector: "[class*='currency-'], .currency-idr1",
  });
  return dedupeRows(rawRows);
}

/** GoPay (gopay.co.id) */
async function extractGopayRows(page) {
  const items = await extractCards(page, '[id^="variant-"] .grid > div', {
    nameSelector: "h3",
  });
  return dedupeRows(items);
}

/** Ditusi (ditusi.co.id) */
async function extractDitusiRows(page) {
  if (/roblox/i.test(page.url()) && !page.url().includes("voucher-roblox-robux")) {
    await page.goto("https://ditusi.co.id/voucher-roblox-robux", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1_500);
  }

  await page.evaluate(() => {
    const modals = document.querySelectorAll(".modal, .modal-backdrop, #modal-request-permission, #customModal");
    for (const elemenModal of modals) elemenModal.remove();
    document.body.classList.remove("modal-open");
  });

  const allCards = [];

  const collectVisible = async () => {
    const cards = await extractCards(page, ".item-product-click");
    allCards.push(...cards);
  };

  await collectVisible();

  const subTabLabels = await page.evaluate(() => {
    const labels = document.querySelectorAll("#group-category-game label");
    const daftar = [];
    for (const label of labels) {
      const teksLabel = label.innerText ? label.innerText.trim() : "";
      if (teksLabel) daftar.push(teksLabel);
    }
    return daftar;
  });

  for (const labelText of subTabLabels) {
    if (/usd|global|foreign|sar|brl/i.test(labelText)) continue;
    await page.evaluate((targetLabel) => {
      const labels = document.querySelectorAll("#group-category-game label");
      for (const label of labels) {
        if (label.innerText && label.innerText.trim() === targetLabel) {
          label.click();
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

  const items = await extractCards(page, "div.product-item", {
    nameSelector: "input[data-title], .product-title",
    priceSelector: ".current-price, .pricing",
  });
  return dedupeRows(items);
}

/** VexaGame (vexagame.com) */
async function extractVexagameRows(page) {
  const items = await extractCards(page, '#diamond-cards [role="option"]', {
    nameSelector: "p",
  });
  return dedupeRows(items);
}

/** Lapakgaming (lapakgaming.com) */
async function extractLapakgamingRows(page) {
  // 1. Ekstraksi via metadata terstruktur __NEXT_DATA__ (bersih, cepat, dan presisi)
  const nextData = await page.evaluate(() => {
    const elemenNextData = document.getElementById("__NEXT_DATA__");
    return elemenNextData ? JSON.parse(elemenNextData.textContent) : null;
  }).catch(() => null);

  if (nextData) {
    const rows = extractProductPairsFromJson(nextData);
    if (rows.length >= 3) return dedupeRows(rows);
  }

  // 2. Fallback kartu DOM jika data JSON tidak tersedia
  const fallbackRows = await extractCards(page, 'div[class*="rounded-xl"][class*="cursor-pointer"], button[class*="cursor-pointer"]', {
    preferLastPrice: true,
  });

  return dedupeRows(fallbackRows);
}

/** GOGOGO (gogogo.com / gogogo.id) */
async function extractGogogoRows(page) {
  const cardSelector = '[data-testid^="qa-product-item-card-container-"], div[class*="hover:border-golden-yellow"], div[class*="rounded-xl"]';
  await page
    .waitForFunction(
      (sel) => {
        const cards = document.querySelectorAll(sel);
        for (const kartu of cards) {
          if (/(?:Rp|IDR)\s*[\d.]+/i.test(kartu.innerText || "")) return true;
        }
        return false;
      },
      cardSelector,
      { timeout: 15_000, polling: 250 },
    )
    .catch(() => {});

  const rawRows = await extractCards(page, cardSelector, {
    nameSelector: '[data-testid^="qa-product-item-card-name-"]',
    priceSelector: '[data-testid^="qa-product-item-card-current-price-"]',
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

  const rows = await extractCards(page, ".box-border.cursor-pointer");
  return dedupeRows(rows);
}

// Parser data stream Next.js RSC (React Server Components) untuk platform VocaGame (topupnolimit.com, dll)
function extractVocaGameProductsFromHtml(html) {
  if (!html) return [];
  const clean = html.replace(/\\n/g, "\n").replace(/\\"/g, '"');
  const lines = clean.split("\n");

  const prices = new Map();
  const arrays = new Map();

  // Langkah 1: Kumpulkan referensi harga diskon IDR dan daftar negara dari stream Next.js
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

  // Langkah 2: Ambil daftar nama denominasi aktif dan pasangkan dengan referensi harga IDR
  for (const line of lines) {
    const denomMatch = line.match(/^([0-9a-zA-Z]+):\{"id":"([^"]+)","variant_id":\d+,"name":"([^"]+)"/);
    if (!denomMatch) continue;

    const name = denomMatch[3].trim();
    const isActive = /"is_active":true/.test(line);
    if (!isActive) continue;

    // Pastikan denominasi berlaku untuk region Indonesia (ID)
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
  const domRows = await extractCards(
    page,
    ".form-denomination li, .form-denomination button, [class*='denomination'] li",
  );
  return dedupeRows(domRows || []);
}

/** GarudaKu (garudaku.com) */
async function extractGarudakuRows(page, url, interceptedPayloads = []) {
  // 1. Cek dari intercepted network payloads untuk endpoint produk Garudaku
  let payload = interceptedPayloads.find(
    (itemPayload) => itemPayload.url && itemPayload.url.includes("topup-store-api.garudaku.com/v1/products"),
  );

  // 2. Jika belum ter-intercept saat domcontentloaded, tunggu sebentar respon API-nya
  if (!payload) {
    const res = await page
      .waitForResponse(
        (respon) =>
          respon.url().includes("topup-store-api.garudaku.com/v1/products") &&
          respon.status() === 200,
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
  "itemku.com": extractItemkuRows,
  "lootbar.com": extractLootbarRows,
  "topup.ggwp.id": extractTopupGGWPRows,
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
  STORE_EXTRACTORS,
  extractBlibliRows,
  extractSpecialRows,
  parseBlibliOptionText,
  parseRobloxProductCard,
};
