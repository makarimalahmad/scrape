# @makarimalahmad/price-scraper-sdk

SDK Node.js untuk ekstraksi data harga dan perbandingan harga kompetitor voucher game (**Mobile Legends**, **Free Fire**, dan **Roblox**) berbasis pencarian Google Organik (SerpAPI), dilengkapi dengan normalisasi produk, validasi kelayakan data, serta opsi ekspor ke format CSV dan Excel (.xlsx).

---

## 📦 Instalasi

### 1. Konfigurasi `.npmrc`
Tambahkan konfigurasi registry GitHub Packages pada file `.npmrc` di root direktori project Anda:

```text
@makarimalahmad:registry=https://npm.pkg.github.com
```

### 2. Install Paket
```bash
npm install @makarimalahmad/price-scraper-sdk
```

> **Prasyarat:** Pastikan runtime Chromium Playwright sudah terpasang di sistem:
> ```bash
> npx playwright install chromium
> ```

---

## ⚙️ Konfigurasi Environment (`.env`)

Sediakan API Key SerpAPI di file `.env` project Anda untuk fitur pencarian kompetitor Google otomatis:

```env
SERPAPI_KEY=your_serpapi_key_here
GROQ_API_KEY=your_groq_api_key_here # (Opsional: untuk ekstraksi fallback berbasis AI pada DOM anomali)
```

---

## 🚀 Panduan Penggunaan

### 1. Komparasi Harga Game dari Google (`compareGame`)
Mencari kompetitor organik Google via SerpAPI, melakukan scraping multi-store paralel, menormalkan paket nominal, menyusun tabel komparasi terhadap toko utama (UPoint & DuniaGames), serta otomatis mengekspor ke file Excel (.xlsx).

```javascript
const { compareGame } = require("@makarimalahmad/price-scraper-sdk");

async function main() {
  // Pilihan game: "mobile-legends", "free-fire", atau "roblox"
  const result = await compareGame("roblox", {
    limit: 5,                          // Jumlah kompetitor Google yang di-scrape (default: 10)
    concurrency: 2,                     // Jumlah browser paralel (default: 3)
    exportXlsxDirectory: "./laporan",   // Opsional: simpan file Excel (.xlsx)
  });

  console.log("Game:", result.game);
  console.log("Toko Berhasil:", result.successfulStoreCount);
  console.log("File Excel:", result.xlsxFilePath);
  console.log("Tabel Komparasi:", result.comparisonTable);
  console.log("Toko Termurah per Nominal:", result.summary);
}

main();
```

<details>
<summary><b>🔍 Lihat Contoh Struktur Return Object <code>compareGame</code></b></summary>

```json
{
  "game": "Roblox",
  "gameId": "roblox",
  "generatedAt": "2026-08-31T06:00:00.000Z",
  "storeCount": 7,
  "successfulStoreCount": 7,
  "stores": [
    { "name": "UPoint", "url": "https://upoint.id/top-up/roblox", "position": "Utama", "success": true, "productCount": 5, "confidence": 95 },
    { "name": "DuniaGames", "url": "https://duniagames.co.id/...", "position": "Utama", "success": true, "productCount": 7, "confidence": 95 },
    { "name": "itemku.com", "url": "https://www.itemku.com/...", "position": 1, "success": true, "productCount": 31, "confidence": 100 }
  ],
  "comparisonTable": [
    {
      "Produk": "800 Robux",
      "itemku.com": 140999,
      "ditusi.co.id": 170698,
      "Harga Terendah | UPoint": "-",
      "Harga Terendah | DuniaGames": 235000,
      "Harga Terendah | DuniaGames Selisih": 94001,
      "Harga Terendah | DuniaGames %": "40.0004%",
      "Harga Tertinggi | DuniaGames": 235000,
      "Harga Tertinggi | DuniaGames Selisih": 64302,
      "Harga Tertinggi | DuniaGames %": "27.3626%"
    }
  ],
  "summary": [
    { "product": "800 Robux", "cheapestStore": "itemku.com", "cheapestPrice": 140999 },
    { "product": "Roblox IDR 50000", "cheapestStore": "itemku.com", "cheapestPrice": 46499 }
  ],
  "xlsxFilePath": "./laporan/scrape-roblox.xlsx"
}
```
</details>

---

### 2. Ekstraksi Data dari 1 URL Toko (`scrapeUrl`)
Mengambil seluruh daftar produk dan harga dari satu halaman toko tertentu secara langsung.

```javascript
const { scrapeUrl } = require("@makarimalahmad/price-scraper-sdk");

async function main() {
  const result = await scrapeUrl("https://hiddengame.id/games/roblox-giftcard", {
    headed: false,               // true jika ingin menjalankan browser dengan tampilan
    exportCsvPath: "./data.csv", // Opsional: simpan hasil langsung ke CSV
  });

  console.log("Status:", result.success);      // true
  console.log("Total Produk:", result.count);  // 19
  console.log("Confidence:", result.confidence);// 100
  console.log("Daftar Produk:", result.products);
}

main();
```

<details>
<summary><b>🔍 Lihat Contoh Struktur Return Object <code>scrapeUrl</code></b></summary>

```json
{
  "success": true,
  "url": "https://hiddengame.id/games/roblox-giftcard",
  "products": [
    { "name": "Roblox IDR 50.000", "price": "Rp 48.110", "rawPrice": 48110 },
    { "name": "800 Robux", "price": "Rp 163.853", "rawPrice": 163853 }
  ],
  "count": 19,
  "confidence": 100,
  "status": "VALID",
  "reasons": [],
  "csvPath": "./data.csv"
}
```
</details>

---

### 3. Komparasi Langsung Antara 2 URL (`compareUrls`)
Membandingkan harga antara dua link toko secara langsung tanpa memerlukan SerpAPI Google.

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

  console.log("Jumlah Produk Utama:", result.mainProductCount);
  console.log("Jumlah Produk Pembanding:", result.competitorProductCount);
  console.log("Tabel Komparasi Pasangan:", result.comparisonRows);
}

main();
```

---

### 4. Normalisasi Produk (`parseProduct`)
Menstandarisasi string nama paket voucher menjadi objek kuantitas dan kategori terstruktur.

```javascript
const { parseProduct } = require("@makarimalahmad/price-scraper-sdk");

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
| `options.concurrency` | `number` | Tidak | `3` | Jumlah browser paralel (1–4). |
| `options.maxAttempts` | `number` | Tidak | `3` | Batas percobaan ulang per toko jika gagal/timeout (1–5). |
| `options.headed` | `boolean` | Tidak | `false` | Menampilkan jendela browser jika bernilai `true`. |
| `options.apiKey` | `string` | Tidak | `.env` | SerpAPI Key jika tidak diset via environment variable. |
| `options.exportXlsxDirectory` | `string` | Tidak | `null` | Path folder untuk menyimpan file Excel (.xlsx). |

### `scrapeUrl(url, [options])`
| Parameter | Tipe | Wajib | Default | Deskripsi |
| :--- | :--- | :---: | :---: | :--- |
| `url` | `string` | **Ya** | - | URL toko target yang akan diekstraksi. |
| `options.gameId` | `string` | Tidak | `null` | ID game untuk validasi kelayakan data. |
| `options.selector` | `string` | Tidak | `null` | Custom CSS selector target elemen produk jika diperlukan. |
| `options.headed` | `boolean` | Tidak | `false` | Menjalankan browser terlihat. |
| `options.exportCsvPath` | `string` | Tidak | `null` | Path file untuk menyimpan hasil ke CSV. |

### `compareUrls(mainUrl, competitorUrl, [options])`
| Parameter | Tipe | Wajib | Default | Deskripsi |
| :--- | :--- | :---: | :---: | :--- |
| `mainUrl` | `string` | **Ya** | - | URL toko utama acuan komparasi. |
| `competitorUrl` | `string` | **Ya** | - | URL toko pembanding. |
| `options.game` | `string` | Tidak | `"mobile-legends"` | ID game target komparasi. |
| `options.exportCsvPath` | `string` | Tidak | `null` | Path file untuk menyimpan hasil komparasi ke CSV. |

---

## ⚠️ Catatan Operasional
Scraper ini dirancang adaptif terhadap berbagai struktur situs top-up game. Namun, perubahan struktur DOM, proteksi Cloudflare Turnstile/CAPTCHA, atau pembaruan layout dari situs target dapat memengaruhi hasil ekstraksi.

---

## 🧪 Pengujian

```bash
npm test
```
