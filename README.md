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

> **Prasyarat:** Pastikan runtime Chromium Playwright sudah terpasang:
> ```bash
> npx playwright install chromium
> ```

---

## ⚙️ Konfigurasi Environment (`.env`)

```env
SERPAPI_KEY=your_serpapi_key_here
GROQ_API_KEY=your_groq_api_key_here # (Opsional: untuk ekstraksi fallback berbasis AI pada DOM anomali)
```

---

## 🚀 Panduan Penggunaan

### 1. Ekstraksi Data dari 1 URL Toko (`scrapeUrl`)
Mengambil seluruh daftar produk dan harga dari halaman toko target.

```javascript
const { scrapeUrl } = require("@makarimalahmad/price-scraper-sdk");

async function main() {
  const result = await scrapeUrl("https://hiddengame.id/games/roblox-giftcard", {
    headed: false,               // true jika ingin menjalankan browser dengan tampilan
    exportCsvPath: "./data.csv", // Opsional: simpan hasil langsung ke CSV
  });

  console.log("Status:", result.success);
  console.log("Total Produk:", result.count);
  console.log("Daftar Produk:", result.products);
}

main();
```

---

### 2. Komparasi Harga Game via Google (`compareGame`)
Mencari kompetitor organik Google melalui SerpAPI, melakukan scraping multi-store secara paralel, menormalkan paket nominal, dan menyusun tabel komparasi harga terendah beserta ekspor Excel.

```javascript
const { compareGame } = require("@makarimalahmad/price-scraper-sdk");

async function main() {
  // Pilihan game: "mobile-legends", "free-fire", atau "roblox"
  const result = await compareGame("roblox", {
    limit: 5,                          // Jumlah toko kompetitor Google (default: 10)
    concurrency: 2,                     // Jumlah browser paralel (default: 3)
    exportXlsxDirectory: "./laporan",   // Opsional: simpan file Excel (.xlsx)
  });

  console.log("Game:", result.game);
  console.log("Toko Berhasil:", result.successfulStoreCount);
  console.log("Tabel Komparasi:", result.comparisonTable);
  console.log("Toko Termurah:", result.summary);
  console.log("File Excel:", result.xlsxFilePath);
}

main();
```

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

  console.log("Hasil Komparasi:", result.comparisonRows);
}

main();
```

---

### 4. Normalisasi Produk (`parseProduct`)
Menstandarisasi string nama paket menjadi objek terstruktur.

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
| `options.maxAttempts` | `number` | Tidak | `3` | Batas percobaan ulang per toko jika gagal (1–5). |
| `options.headed` | `boolean` | Tidak | `false` | Menampilkan jendela browser jika bernilai `true`. |
| `options.apiKey` | `string` | Tidak | `.env` | SerpAPI Key jika tidak diset via environment variable. |
| `options.exportXlsxDirectory` | `string` | Tidak | `null` | Path folder untuk menyimpan file Excel (.xlsx). |

### `scrapeUrl(url, [options])`
| Parameter | Tipe | Wajib | Default | Deskripsi |
| :--- | :--- | :---: | :---: | :--- |
| `url` | `string` | **Ya** | - | URL toko target yang akan diekstraksi. |
| `options.gameId` | `string` | Tidak | `null` | ID game untuk validasi domain. |
| `options.headed` | `boolean` | Tidak | `false` | Menjalankan browser terlihat. |
| `options.exportCsvPath` | `string` | Tidak | `null` | Path file untuk menyimpan hasil ke CSV. |

### `compareUrls(mainUrl, competitorUrl, [options])`
| Parameter | Tipe | Wajib | Default | Deskripsi |
| :--- | :--- | :---: | :---: | :--- |
| `mainUrl` | `string` | **Ya** | - | URL toko utama acuan. |
| `competitorUrl` | `string` | **Ya** | - | URL toko pembanding. |
| `options.game` | `string` | Tidak | `"mobile-legends"` | Game target komparasi. |
| `options.exportCsvPath` | `string` | Tidak | `null` | Path file untuk menyimpan hasil ke CSV. |

---

## ⚠️ Catatan Operasional
Scraper ini dirancang adaptif terhadap berbagai struktur situs top-up game. Namun, perubahan struktur DOM, proteksi Cloudflare Turnstile/CAPTCHA, atau pembaruan layout dari situs target dapat memengaruhi hasil ekstraksi.

---

## 🧪 Pengujian

```bash
npm test
```
