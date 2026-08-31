# @makarimalahmad/price-scraper-sdk

SDK Node.js untuk ekstraksi data harga dan perbandingan harga kompetitor voucher game (**Mobile Legends**, **Free Fire**, dan **Roblox**) berbasis pencarian Google Organik (SerpAPI), dilengkapi dengan modul normalisasi produk, validasi kelayakan data, serta opsi ekspor ke format CSV dan Excel (.xlsx).

---

## 📦 Instalasi

### 1. Konfigurasi `.npmrc`
Karena paket ini didistribusikan melalui GitHub Packages, tambahkan konfigurasi registry pada file `.npmrc` di root direktori project Anda:

```text
@makarimalahmad:registry=https://npm.pkg.github.com
```

### 2. Install Paket
```bash
npm install @makarimalahmad/price-scraper-sdk
```

> **Prasyarat Browser:** Pastikan runtime Chromium Playwright sudah terpasang di sistem:
> ```bash
> npx playwright install chromium
> ```

---

## ⚙️ Konfigurasi Environment (`.env`)

Untuk fitur pencarian kompetitor otomatis melalui SerpAPI, sediakan environment variable berikut:

```env
SERPAPI_KEY=your_serpapi_key_here
GROQ_API_KEY=your_groq_api_key_here # (Opsional: untuk ekstraksi fallback berbasis AI pada DOM anomali)
```

---

## 🚀 Panduan Penggunaan

### 1. Ekstraksi Data dari 1 URL Toko (`scrapeUrl`)
Mengambil daftar produk dan harga dari URL toko target secara langsung.

```javascript
const { scrapeUrl } = require("@makarimalahmad/price-scraper-sdk");

async function main() {
  const result = await scrapeUrl("https://hiddengame.id/games/roblox-giftcard", {
    headed: false,               // true untuk menjalankan browser terlihat
    exportCsvPath: "./data.csv", // Opsional: simpan hasil ke CSV
  });

  console.log("Status Berhasil:", result.success);
  console.log("Jumlah Produk:", result.count);
  console.log("Skor Confidence:", result.confidence);
  console.log("Daftar Produk:", result.products);
}

main();
```

---

### 2. Komparasi Harga Game via Google (`compareGame`)
Mencari kompetitor organik Google melalui SerpAPI, melakukan scraping multi-store secara paralel, menormalkan paket nominal, dan menyusun tabel komparasi harga terendah.

```javascript
const { compareGame } = require("@makarimalahmad/price-scraper-sdk");

async function main() {
  // Pilihan game: "roblox", "free-fire", atau "mobile-legends"
  const result = await compareGame("roblox", {
    limit: 5,                          // Jumlah kompetitor Google yang di-scrape (default: 10)
    concurrency: 2,                     // Jumlah browser paralel (default: 3)
    exportXlsxDirectory: "./laporan",   // Opsional: simpan hasil ke file Excel (.xlsx)
  });

  console.log("Game:", result.game);
  console.log("Toko Berhasil:", result.successfulStoreCount);
  console.log("Tabel Komparasi:", result.comparisonTable);
  console.log("Ringkasan Toko Termurah:", result.summary);
  console.log("Lokasi File Excel:", result.xlsxFilePath);
}

main();
```

---

### 3. Komparasi Langsung Antara 2 URL (`compareUrls`)
Membandingkan harga antara dua URL toko spesifik secara *pairwise* tanpa memerlukan SerpAPI Google.

```javascript
const { compareUrls } = require("@makarimalahmad/price-scraper-sdk");

async function main() {
  const result = await compareUrls(
    "https://upoint.id/top-up/free_fire",
    "https://lapakhuda.com/id/free-fire",
    {
      game: "free-fire",
      exportCsvPath: "./komparasi-ff.csv",
    }
  );

  console.log("Hasil Pasangan Komparasi:", result.comparisonRows);
}

main();
```

---

### 4. Normalisasi & Pencocokan Produk
Modul untuk standarisasi nama paket dan pencocokan nominal produk antar toko.

```javascript
const { parseProduct, matchProducts } = require("@makarimalahmad/price-scraper-sdk");

// Normalisasi string produk menjadi objek terstruktur
const item = parseProduct("500 Robux Promo", "roblox");
console.log(item);
// Output: { key: '500 Robux', category: 'robux', quantity: 500, unit: 'Robux' }
```

---

## 📖 Referensi Parameter API

### `compareGame(gameId, [options])`
| Parameter | Tipe | Wajib | Default | Deskripsi |
| :--- | :--- | :---: | :---: | :--- |
| `gameId` | `string` | **Ya** | - | ID game target: `"mobile-legends"`, `"free-fire"`, atau `"roblox"`. |
| `options.limit` | `number` | Tidak | `10` | Jumlah kompetitor teratas dari pencarian Google (1–10). |
| `options.concurrency` | `number` | Tidak | `3` | Jumlah proses browser paralel (1–4). |
| `options.maxAttempts` | `number` | Tidak | `3` | Batas percobaan ulang (retry) per toko jika terjadi kendala jaringan (1–5). |
| `options.headed` | `boolean` | Tidak | `false` | Menampilkan window browser jika bernilai `true`. |
| `options.apiKey` | `string` | Tidak | `.env` | SerpAPI Key jika tidak dikonfigurasi melalui environment variable. |
| `options.exportXlsxDirectory` | `string` | Tidak | `null` | Path folder untuk menyimpan laporan Excel (.xlsx). |

### `scrapeUrl(url, [options])`
| Parameter | Tipe | Wajib | Default | Deskripsi |
| :--- | :--- | :---: | :---: | :--- |
| `url` | `string` | **Ya** | - | URL halaman produk toko yang akan diekstraksi. |
| `options.gameId` | `string` | Tidak | `null` | ID game untuk keperluan validasi relevansi data. |
| `options.selector` | `string` | Tidak | `null` | Custom CSS selector target elemen produk jika diperlukan. |
| `options.headed` | `boolean` | Tidak | `false` | Menjalankan browser dalam mode visible. |
| `options.exportCsvPath` | `string` | Tidak | `null` | Path file untuk menyimpan hasil scraping ke format CSV. |

### `compareUrls(mainUrl, competitorUrl, [options])`
| Parameter | Tipe | Wajib | Default | Deskripsi |
| :--- | :--- | :---: | :---: | :--- |
| `mainUrl` | `string` | **Ya** | - | URL toko utama sebagai acuan komparasi. |
| `competitorUrl` | `string` | **Ya** | - | URL toko pembanding. |
| `options.game` | `string` | Tidak | `"mobile-legends"` | ID game target komparasi. |
| `options.exportCsvPath` | `string` | Tidak | `null` | Path file untuk menyimpan hasil komparasi ke CSV. |

---

## 🛠️ Daftar Modul & Fungsi yang Diekspor

| Kategori | Nama Fungsi / Variabel |
| :--- | :--- |
| **Fasade Utama** | `scrapeUrl`, `compareGame`, `compareUrls` |
| **Utilitas Ekspor** | `exportXlsx`, `exportCsv`, `createScrapeWorkbook`, `saveInvalidReport` |
| **Normalisasi & Pencocokan** | `matchProducts`, `parseProduct`, `parsePrice`, `selectCheapestProducts`, `createProductAnchors`, `createScrapeRows`, `matchStoreToAnchors`, `calculateComparison`, `selectBenchmark` |
| **Validasi & AI Fallback** | `validateScrapeResults`, `extractWithGroq` |
| **Integrasi Google & Scraper** | `searchGoogle`, `selectGoogleCompetitors`, `classifyTopUpCompetitorResult`, `scrapeStore`, `createPairRows`, `exportComparisonFiles`, `scrape` |
| **Konfigurasi & Metadata** | `GAME_CONFIGS`, `MAIN_STORE_DOMAINS`, `isMainStoreUrl`, `normalizeHostname` |

---

## ⚠️ Catatan Operasional
Scraper ini dirancang adaptif terhadap berbagai struktur halaman e-commerce voucher game di Indonesia. Namun, perubahan struktur DOM, proteksi bot (Cloudflare/CAPTCHA), atau pembaruan layout dari situs target dapat memengaruhi hasil ekstraksi.

---

## 🧪 Pengujian

Jalankan rangkaian unit test lokal:

```bash
npm test
```
