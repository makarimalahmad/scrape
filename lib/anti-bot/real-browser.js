// Fallback browser riil (puppeteer-real-browser) untuk toko berproteksi Cloudflare ketat
const fs = require("fs");
const { chromium } = require("../browser/playwright");
const { getProxyForUrl, toRealBrowserProxy } = require("../proxy/proxy-manager");

// Helper jeda waktu sederhana dalam hitungan detik
function tungguDetik(detik) {
  return new Promise((resolve) => setTimeout(resolve, detik * 1000));
}

function getRealBrowserDomains() {
  const teksDomain = process.env.REAL_BROWSER_DOMAINS || "";
  if (!teksDomain) return [];

  const daftarDomain = [];
  const potonganDomain = teksDomain.split(",");

  for (const nama of potonganDomain) {
    const domainBersih = nama.trim().toLowerCase();
    // Hanya simpan jika teks tidak kosong
    if (domainBersih) {
      daftarDomain.push(domainBersih);
    }
  }

  return daftarDomain;
}

async function scrapeWithRealBrowser(url, _selector, headed, options = {}) {
  let connect;
  try {
    const realBrowser = require("puppeteer-real-browser");
    connect = realBrowser.connect;
  } catch (error) {
    console.log("[Real Browser] require failed:", error.message);
    return null;
  }

  // Auto-detect Playwright Chromium path jika CHROME_PATH belum diatur
  if (!process.env.CHROME_PATH) {
    try {
      const pwPath = chromium.executablePath();
      if (pwPath && fs.existsSync(pwPath)) {
        process.env.CHROME_PATH = pwPath;
      }
    } catch {
      // Abaikan jika tidak tersedia
    }
  }

  const domain = url.hostname.replace(/^www\./, "");
  console.log(`[Real Browser] Menghubungkan puppeteer-real-browser untuk ${domain}...`);
  let browser;

  try {
    const isHeadless = !headed || (process.platform === "linux" && !process.env.DISPLAY);
    const connectOptions = {
      headless: isHeadless,
      turnstile: true,
      args: ["--no-sandbox"],
    };

    const proxyConfig = getProxyForUrl(url, options);
    const realProxy = toRealBrowserProxy(proxyConfig);
    if (realProxy) {
      connectOptions.proxy = realProxy;
      console.log(
        `[Real Browser] Menggunakan proxy untuk ${domain}: ${realProxy.host}:${realProxy.port}`,
      );
    }

    const connection = await connect(connectOptions);
    browser = connection.browser;
    const page = connection.page;

    await page.goto(url.href, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });

    // Tunggu sampai verifikasi Cloudflare selesai (maksimal 35 detik)
    let lolosVerifikasi = false;
    for (let detik = 1; detik <= 35; detik += 1) {
      await tungguDetik(1);
      const title = await page.title().catch(() => "");
      const adaTandaBlokir =
        !title ||
        /just a moment|tunggu sebentar|403 forbidden|access denied|attention required|error 403|security service/i.test(
          title,
        );

      if (!adaTandaBlokir) {
        console.log(`[Real Browser] Berhasil melewati verifikasi Cloudflare (${detik}s) - ${title}`);
        lolosVerifikasi = true;
        break;
      }
    }

    if (!lolosVerifikasi) {
      const judulHalaman = await page.title().catch(() => "");
      throw new Error(`Verifikasi Cloudflare/Akses ke ${domain} ditolak (Title: "${judulHalaman}"). Kemungkinan IP server diblokir WAF situs.`);
    }

    await tungguDetik(2.5);

    // Hapus popup modal yang mungkin menghalangi tampilan
    await page.evaluate(() => {
      const daftarModal = document.querySelectorAll(
        ".modal, .modal-backdrop, #modal-request-permission, #customModal, [class*='modal-backdrop']",
      );
      for (const modal of daftarModal) {
        modal.remove();
      }
      if (document.body) {
        document.body.classList.remove("modal-open");
      }
    });

    let collectedRawRows = [];

    // Coba delegasikan ke Special Extractor toko jika tersedia (misal: topupnolimit.com, dll)
    try {
      const { extractSpecialRows } = require("../extractors/special-extractors");
      const special = await extractSpecialRows(page, url);
      if (special && special.length > 0) {
        collectedRawRows = special;
      }
    } catch {
      // Abaikan dan gunakan ekstraksi bawaan jika tidak ada special extractor
    }

    // 1. Ekstraksi Khusus Ditusi (Multi-Tab Kategori) jika belum terambil
    if (collectedRawRows.length === 0 && domain === "ditusi.co.id") {
      const daftarKategori = await page.evaluate(() => {
        const semuaLabel = document.querySelectorAll("#group-category-game label, .wrapp-title-category");
        const hasil = [];

        for (const label of semuaLabel) {
          const teks = (label.innerText || "").trim();
          // Ambil kategori game yang relevan (seperti Gift Card atau Robux)
          if (/gift\s*card|robux|voucher/i.test(teks) && teks.length < 40 && !hasil.includes(teks)) {
            hasil.push(teks);
          }
        }

        return hasil;
      });

      const ambilProdukDitusi = async () => {
        return await page.evaluate(() => {
          const kartu = document.querySelectorAll(
            ".item-product-click, .product-item, .card-product, [class*='item-product']",
          );
          const daftar = [];

          for (const item of kartu) {
            if (item.offsetParent === null) continue; // Lewati elemen tersembunyi

            const teks = (item.innerText || "").replace(/\s+/g, " ").trim();
            const cocokHarga = teks.match(/Rp\.?\s*[\d.]+/i);
            if (!cocokHarga) continue;

            const harga = cocokHarga[0];
            const namaProduk = teks.split(/Rp\.?/i)[0].replace(/Termurah/gi, "").trim();

            if (namaProduk && harga) {
              daftar.push({ Produk: namaProduk, Harga: harga });
            }
          }

          return daftar;
        });
      };

      collectedRawRows.push(...(await ambilProdukDitusi()));

      for (const kategori of daftarKategori) {
        await page.evaluate((targetKategori) => {
          const tombolList = document.querySelectorAll(
            "#group-category-game label, .wrapp-title-category, button, a",
          );
          for (const tombol of tombolList) {
            if ((tombol.innerText || "").trim() === targetKategori) {
              tombol.click();
              break;
            }
          }
        }, kategori);

        await tungguDetik(1.2);
        collectedRawRows.push(...(await ambilProdukDitusi()));
      }
    }

    // 2. Ekstraksi Toko Umum & Berbasis API (Bangjeff, Ourastore, dll) jika data masih kosong
    else if (collectedRawRows.length === 0) {
      console.log(`[Real Browser] Menunggu produk ${domain} dimuat...`);
      for (let percobaan = 0; percobaan < 25; percobaan += 1) {
        const adaProduk = await page.evaluate(() => {
          const teks = document.body ? document.body.innerText || "" : "";
          const adaHarga = /(?:Rp\.?|IDR)\s*\d/i.test(teks);
          const adaKataGame = /(?:diamond|member|card|pass|pack|roblox|robux|voucher)/i.test(teks);
          return adaHarga && adaKataGame;
        });

        if (adaProduk) break;
        await tungguDetik(1);
      }

      collectedRawRows = await page.evaluate(() => {
        const cardSelectors = [
          '[class*="group/variant"]',
          '.denom',
          '.form-denomination li',
          '.form-denomination button',
          '[class*="denomination"] li',
          '[class*="product-item"]',
          '[class*="card-product"]',
          '[class*="item-product"]',
          '[class*="product"]',
          '[class*="card"]',
          'article',
          'li',
          'label',
          'button',
          '[role="radio"]',
        ];

        const semuaKartu = document.querySelectorAll(cardSelectors.join(", "));
        const items = [];
        const seen = new Set();

        for (const kartu of semuaKartu) {
          if (kartu.offsetParent === null) continue; // Lewati elemen tersembunyi
          const teksKartu = (kartu.innerText || "").replace(/\s+/g, " ").trim();
          if (teksKartu.length === 0 || teksKartu.length >= 250) continue;

          // Cari harga Rupiah normal (misal: "Rp 15.000" atau "IDR 20.000")
          const cocokHarga = teksKartu.match(/(?:Rp\.?|IDR)\s*[\d.]+/i);
          if (!cocokHarga) continue;

          const harga = cocokHarga[0];
          // Ambil nama sebelum harga dan bersihkan kata promosi
          let produk = teksKartu
            .split(/(?:Rp\.?|IDR)\s*[\d.]+/i)[0]
            .replace(/\b(?:beli|buy|pilih|select|diskon|promo|flashsale|termurah|best seller|out of stock)\b/gi, "")
            .replace(/-\d+%/g, "")
            .trim();

          if (!produk || produk.length < 2 || produk.length > 80) continue;

          const key = `${produk.toLowerCase()}|${harga.toLowerCase()}`;
          if (!seen.has(key)) {
            seen.add(key);
            items.push({ Produk: produk, Harga: harga });
          }
        }

        return items;
      });
    }

    if (collectedRawRows.length === 0) return null;

    // Deduplikasi produk yang sama persis
    const seen = new Set();
    const rows = [];
    for (const item of collectedRawRows) {
      const key = `${item.Produk.toLowerCase()}|${item.Harga.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        rows.push(item);
      }
    }

    const finalRows = rows.map((row, index) => ({
      No: index + 1,
      ...row,
      Sumber: url.href,
    }));

    console.log(`[Real Browser] Selesai mengekstrak ${finalRows.length} produk untuk ${domain}.`);
    return finalRows;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

module.exports = {
  getRealBrowserDomains,
  scrapeWithRealBrowser,
};
