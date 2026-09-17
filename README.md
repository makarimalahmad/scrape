# @makarimalahmad/price-scraper-sdk

[![NPM Version](https://img.shields.io/badge/version-1.0.19-blue.svg)](https://github.com/makarimalahmad/scrape/packages)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-green.svg)](https://nodejs.org/)
[![License: ISC](https://img.shields.io/badge/License-ISC-yellow.svg)](https://opensource.org/licenses/ISC)
[![Playwright](https://img.shields.io/badge/tested%20with-Playwright%20Extra-purple.svg)](https://playwright.dev/)

SDK otomasi komparasi harga voucher game (**Mobile Legends**, **Free Fire**, dan **Roblox**) berbasis penelusuran Google Organik (SerpAPI). SDK ini memindai toko kompetitor teratas secara otomatis, menormalisasi denominasi produk terhadap toko patokan (**UPoint** & **DuniaGames**), menghitung harga terendah/tertinggi pasar, menyesuaikan PPN/biaya transaksi, serta mengekspor hasil analisis langsung ke file **Excel (.xlsx)** berformat rapi dan **CSV**.

---

## 📑 Daftar Isi

- [Fitur Utama](#-fitur-utama)
- [Game yang Didukung](#-game-yang-didukung)
- [Instalasi & Persiapan](#-instalasi--persiapan)
  - [1. Konfigurasi Autentikasi (.npmrc)](#1-konfigurasi-autentikasi-npmrc)
  - [2. Install Package](#2-install-package)
  - [3. Install Browser Playwright](#3-install-browser-playwright)
- [Konfigurasi Environment (.env)](#-konfigurasi-environment-env)
- [Quick Start](#-quick-start)
- [Dokumentasi API Publik](#-dokumentasi-api-publik)
  - [1. `compareGame(gameId, options)`](#1-comparegamegameid-options)
  - [2. `compareUrls(mainUrl, competitorUrl, options)`](#2-compareurlsmainurl-competitorurl-options)
  - [3. `scrapeUrl(url, options)`](#3-scrapeurlurl-options)
  - [4. `applyTaxCalculation(taxRules, payload)`](#4-applytaxcalculationtaxrules-payload)
- [Struktur Return Object `compareGame`](#-struktur-return-object-comparegame)
- [Kustomisasi Pajak & Biaya Toko (`calculateTax`)](#-kustomisasi-pajak--biaya-toko-calculatetax)
- [Dukungan Proxy](#-dukungan-proxy)
- [Status Ekstraksi Toko](#-status-ekstraksi-toko)
- [Penggunaan via CLI / Terminal](#-penggunaan-via-cli--terminal)
- [Pengujian & Verifikasi](#-pengujian--verifikasi)

---

## ✨ Fitur Utama

- **Peringkat Organik Asli**: Mengambil posisi kompetitor top-up game langsung dari Google Search via SerpAPI.
- **Normalisasi Produk Cerdas**: Pencocokan varian denominasi (misal: "Weekly Diamond Pass", "86 Diamonds", "Robux Game Card") lintas toko yang memiliki format penamaan berbeda.
- **Anchor Patokan Toko Utama**: Membandingkan langsung selisih harga (Rp dan %) terhadap patokan resmi **UPoint** dan **DuniaGames**.
- **Anti-Bot & Cloudflare Bypass**: Terintegrasi dengan `playwright-extra`, plugin stealth, dan penanganan Turnstile otomatis.
- **Ekspor Excel Siap Pakai**: Otomatis menghasilkan workbook Excel `.xlsx` dengan styling tabel, highlight harga terendah/tertinggi, dan rumus perbandingan.
- **AI Fallback (Opsional)**: Pemulihan data otomatis berbasis LLM jika struktur DOM toko tidak lazim atau berubah.
- **Penyesuaian Pajak/Admin**: Perhitungan PPN (11%) atau biaya pembayaran (QRIS) dinamis per domain toko atau per game.

---

## 🎮 Game yang Didukung

| Game | `gameId` | Toko Patokan Utama | Denominasi / Mata Uang |
| :--- | :--- | :--- | :--- |
| **Mobile Legends: Bang Bang** | `mobile-legends` | UPoint, DuniaGames | Diamonds, WDP, Twilight Pass |
| **Free Fire** | `free-fire` | UPoint, DuniaGames | Diamonds, Membership |
| **Roblox** | `roblox` | UPoint, DuniaGames | Robux, Game Card, Gift Card |

---

## 📦 Instalasi & Persiapan

### 1. Konfigurasi Autentikasi (`.npmrc`)

Paket ini dipublikasikan pada **GitHub Packages**. Sebelum menginstal, buat atau tambahkan file `.npmrc` pada root project Anda (atau di direktori home pengguna `~/.npmrc`):

```ini
@makarimalahmad:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=YOUR_GITHUB_PERSONAL_ACCESS_TOKEN
```

> [!NOTE]
> Ganti `YOUR_GITHUB_PERSONAL_ACCESS_TOKEN` dengan token GitHub Anda yang memiliki permission **`read:packages`**.

### 2. Install Package

```bash
npm install @makarimalahmad/price-scraper-sdk
```

### 3. Install Browser Playwright

SDK membutuhkan Chromium untuk scraping. Jalankan perintah berikut satu kali setelah instalasi:

```bash
npx playwright install chromium
```

*(Jika dijalankan pada server Ubuntu/Debian, tambahkan dependensi OS: `npx playwright install-deps chromium`)*

---

## 🔐 Konfigurasi Environment (`.env`)

Buat file `.env` di root project Anda:

```env
# WAJIB: API key SerpAPI untuk membaca hasil pencarian Google kompetitor
SERPAPI_KEY=your_serpapi_key_here

# OPSIONAL: AI Fallback jika ekstraksi DOM toko gagal / tidak lengkap
AI_API_KEY=your_llm_api_key_here
AI_BASE_URL=https://api.openai.com/v1/chat/completions
AI_MODEL=gpt-4o-mini

# OPSIONAL: Pengaturan Proxy Global
PROXY_URL=http://username:password@proxy-host:port
PROXY_DOMAINS=bangjeff.com,tokogame.com

# OPSIONAL: Tuning Performa Scraper
SCRAPER_CONCURRENCY=3       # Tab paralel (Default: 3, di VPS disarankan 2)
SCRAPER_LIMIT=10            # Jumlah toko kompetitor Google (Default: 10, Maks: 10)
SCRAPER_MAX_ATTEMPTS=3     # Jumlah percobaan ulang per toko (Default: 3, Maks: 5)
PAGE_TIMEOUT_MS=90000       # Timeout navigasi per halaman web dalam ms (Default: 90000)
ADDITIONAL_BLACKLIST_DOMAINS=spamdomain.com,bloganeh.id
```

---

## 🚀 Quick Start

Contoh eksekusi komparasi harga otomatis untuk game **Free Fire**:

```javascript
const { compareGame } = require("@makarimalahmad/price-scraper-sdk");

async function main() {
  const result = await compareGame("free-fire", {
    limit: 10,                          // Ambil 10 toko kompetitor teratas Google
    concurrency: 3,                      // 3 browser tab paralel
    exportXlsxDirectory: "./output",     // Simpan file Excel ke folder ./output
  });

  console.log(`Game: ${result.game}`);
  console.log(`Toko Berhasil: ${result.successfulStoreCount}/${result.storeCount}`);
  console.log(`File Excel: ${result.xlsxFilePath}`);

  // Tampilkan 3 produk pertama dari summary harga termurah
  result.summary.slice(0, 3).forEach((item) => {
    console.log(`- ${item.product}: Termurah di ${item.cheapestStore} (Rp ${item.cheapestPrice.toLocaleString("id-ID")})`);
  });
}

main().catch(console.error);
```

---

## 🛠️ Dokumentasi API Publik

### 1. `compareGame(gameId, options)`

Fungsi utama untuk pencarian otomatis kompetitor Google via SerpAPI, scraping paralel, pencocokan denominasi, penghitungan selisih harga pasar, dan pembuatan laporan Excel.

```javascript
const result = await compareGame("mobile-legends", options);
```

#### Parameter:
- `gameId` *(string, Wajib)*: `"mobile-legends"` | `"free-fire"` | `"roblox"`
- `options` *(object, Opsional)*:
  | Opsi | Tipe | Default | Keterangan |
  | :--- | :---: | :---: | :--- |
  | `apiKey` | `string` | `process.env.SERPAPI_KEY` | SerpAPI Key jika tidak diset di `.env`. |
  | `limit` | `number` | `10` | Jumlah kompetitor Google yang discrape (1–10). |
  | `concurrency` | `number` | `3` | Jumlah browser tab paralel (1–4). |
  | `maxAttempts` | `number` | `3` | Batas percobaan ulang per toko jika gagal/timeout (1–5). |
  | `headed` | `boolean` | `false` | `true` untuk menampilkan visual jendela browser. |
  | `exportXlsxDirectory` | `string` | `null` | Path folder tujuan ekspor file Excel (`.xlsx`). |
  | `calculateTax` | `object` | `null` | Dictionary aturan PPN / biaya per domain toko. |
  | `proxy` | `string` / `object` | `null` | URL proxy per-request (`host:port:user:pass` atau format URL). |

---

### 2. `compareUrls(mainUrl, competitorUrl, options)`

Membandingkan harga secara *head-to-head* langsung antara dua URL toko tanpa menggunakan kuota SerpAPI Google.

```javascript
const { compareUrls } = require("@makarimalahmad/price-scraper-sdk");

const result = await compareUrls(
  "https://upoint.id/top-up/mobile_legends",
  "https://itemku.com/id/g/mobile-legends/top-up",
  {
    game: "mobile-legends",
    exportCsvPath: "./mlbb-comparison.csv", // Opsional: ekspor CSV
  }
);

console.log(`Matched Rows: ${result.comparisonRows.length}`);
console.log(result.comparisonRows[0]);
```

#### Parameter:
- `mainUrl` *(string, Wajib)*: URL toko patokan utama.
- `competitorUrl` *(string, Wajib)*: URL toko kompetitor.
- `options` *(object, Opsional)*:
  - `game` *(string)*: ID game (default: `"mobile-legends"`).
  - `exportCsvPath` *(string)*: Path file tujuan ekspor CSV.
  - `calculateTax` *(object)*: Aturan pajak/fee.

---

### 3. `scrapeUrl(url, options)`

Melakukan scraping produk dan harga dari satu alamat URL web toko tunggal.

```javascript
const { scrapeUrl } = require("@makarimalahmad/price-scraper-sdk");

const result = await scrapeUrl("https://upoint.id/top-up/roblox", {
  headed: false,
  exportCsvPath: "./upoint-roblox.csv", // Opsional: ekspor CSV
});

if (result.success) {
  console.log(`Ditemukan ${result.count} produk:`);
  result.products.forEach((p) => {
    console.log(`- ${p.name}: ${p.price} (raw: ${p.rawPrice})`);
  });
} else {
  console.error("Scrape gagal:", result.error || result.status);
}
```

#### Return Object `scrapeUrl`:
```javascript
{
  success: true,
  url: "https://upoint.id/top-up/roblox",
  products: [
    { name: "100 Robux", price: "Rp 22.000", rawPrice: 22000 },
    // ...
  ],
  count: 14,
  confidence: 0.95,
  status: "SUCCESS",
  usedAiFallback: false,
  extractionMethod: "standard", // "standard" | "ai_fallback" | "failed"
  reasons: [],
  csvPath: "./upoint-roblox.csv"
}
```

---

### 4. `applyTaxCalculation(taxRules, payload)`

Fungsi utilitas murni untuk menghitung harga setelah disesuaikan dengan persentase pajak atau biaya transaksi platform:

```javascript
const { applyTaxCalculation } = require("@makarimalahmad/price-scraper-sdk");

const taxRules = {
  "unipin.com": 11,          // PPN 11%
  "itemku.com": 0.7,         // QRIS 0.7%
  "codashop.com": {
    "mobile-legends": 12.11, // PPN 11% + QRIS 1%
    "roblox": 0,
  },
};

const finalPrice = applyTaxCalculation(taxRules, {
  rawPrice: 100000,
  domain: "unipin.com",
  game: "free-fire",
});

console.log(finalPrice); // 111000
```

---

## 📊 Struktur Return Object `compareGame`

Objek lengkap yang dikembalikan saat memanggil `await compareGame(...)`:

```javascript
{
  game: "Free Fire",
  gameId: "free-fire",
  generatedAt: "2026-09-15T07:00:00.000Z",
  storeCount: 12,
  successfulStoreCount: 12,

  // Detail status seluruh toko (patokan utama & kompetitor)
  stores: [
    {
      name: "UPoint",
      classification: "MAIN_STORE",
      position: null,
      organicPosition: null,
      url: "https://upoint.id/top-up/free_fire",
      productCount: 18,
      status: "SUCCESS",
      reason: null,
      confidence: 0.95
    },
    {
      name: "itemku.com",
      classification: "COMPETITOR",
      position: 1,
      organicPosition: 1,
      url: "https://itemku.com/id/g/garena-free-fire/top-up",
      productCount: 15,
      status: "SUCCESS",
      reason: null,
      confidence: 0.90
    }
  ],

  // Tabel matriks komparasi lengkap (denominasi vs semua toko & benchmark)
  comparisonTable: [
    {
      Produk: "5 Diamonds",
      UPoint: 1000,
      DuniaGames: 960,
      "itemku.com": 796,
      "kiosgamer.co.id": 1000,
      "codashop.com": 901,
      "Harga Terendah | UPoint": 1000,
      "Harga Terendah | UPoint Selisih": 204,
      "Harga Terendah | UPoint %": "20.4000%",
      "Harga Terendah | DuniaGames": 960,
      "Harga Terendah | DuniaGames Selisih": 164,
      "Harga Terendah | DuniaGames %": "17.0833%"
    }
  ],

  // Ringkasan toko termurah per item produk
  summary: [
    {
      product: "5 Diamonds",
      cheapestStore: "itemku.com",
      cheapestPrice: 796
    }
  ],

  // Path file Excel yang berhasil digenerate
  xlsxFilePath: "C:/.../output/2026-09-15/comparison/free-fire/scrape-free-fire.xlsx"
}
```

---

## ⚙️ Kustomisasi Pajak & Biaya Toko (`calculateTax`)

Secara default, scraper mengambil harga asli mentah (*raw price*) yang tertera di website toko. Jika ingin menghitung estimasi harga bayar final (setelah PPN atau biaya transaksi QRIS), teruskan opsi `calculateTax`:

```javascript
const result = await compareGame("mobile-legends", {
  calculateTax: {
    // 1. Tarif seragam per domain:
    "unipin.com": 11,           // PPN 11% (angka murni)
    "itemku.com": "0.7%",       // Biaya QRIS (string persen)
    "ditusi.co.id": 12.11,      // PPN 11% + QRIS 1%

    // 2. Tarif berbeda per game:
    "codashop.com": {
      "mobile-legends": 12.11,  // MLBB 12.11%
      "free-fire": 11,          // FF 11%
      "roblox": 0,              // Roblox 0% (harga normal)
    },
  },
});
```

> [!TIP]
> - Domain otomatis dinormalisasi oleh SDK (tanpa `www.` dan huruf kecil).
> - Toko patokan utama (**UPoint** & **DuniaGames**) atau toko yang tidak didefinisikan dalam dictionary akan otomatis menggunakan harga aslinya (0% penyesuaian).

---

## 🌐 Dukungan Proxy

Untuk mencegah pemblokiran IP saat scraping toko dengan proteksi ketat, gunakan opsi `proxy`:

```javascript
// 1. Format URL standar
const result = await compareGame("roblox", {
  proxy: "http://username:password@isp-proxy.net:10001",
});

// 2. Format penyedia proxy IP:Port:User:Pass
const result = await compareGame("roblox", {
  proxy: "isp-proxy.net:10001:username:password",
});
```

---

## 🚦 Status Ekstraksi Toko

Setiap toko pada `result.stores` memiliki label `status` untuk mempermudah monitoring kualitas data:

| Status | Penjelasan |
| :--- | :--- |
| **`SUCCESS`** | Berhasil diekstrak sempurna via parser DOM HTML standar toko (`reason: null`). |
| **`SUCCESS_FALLBACK`** | Berhasil dipulihkan secara otomatis oleh AI LLM Fallback saat DOM toko tidak lengkap. |
| **`FAILED_FALLBACK`** | Gagal mengekstrak setelah dicoba melalui DOM dan AI LLM Fallback. |
| **`FAILED`** | Gagal teknis sebelum ekstraksi (timeout koneksi, Cloudflare challenge berlanjut, atau error navigasi). |

---

## 💻 Penggunaan via CLI / Terminal

SDK menyediakan file runner CLI jika Anda ingin menjalankan komparasi langsung dari terminal, git clone, atau cron job server:

```bash
# Komparasi game tertentu
node compare-game.js --game mobile-legends
node compare-game.js --game free-fire
node compare-game.js --game roblox

# Komparasi seluruh game secara berurutan
node compare-game.js --game all

# Runner harian otomatis cron VPS (dengan rotasi folder output)
./scrape-daily.sh
```

---

## 🧪 Pengujian & Verifikasi

Untuk menjalankan seluruh rangkaian pemeriksaan sintaks dan unit test internal:

```bash
npm test
```

Uji kalkulasi pajak & normalisasi domain saja:

```bash
npm run test:tax
```

---

## 📄 Lisensi

Proyek ini dilisensikan di bawah [ISC License](LICENSE).
