# @makarimalahmad/price-scraper-sdk

SDK otomatisasi perbandingan harga voucher game (**Mobile Legends**, **Free Fire**, dan **Roblox**) berbasis pencarian Google Organik (SerpAPI). Menghasilkan analisis komparasi harga pasar (harga terendah & tertinggi), selisih nominal rupiah, persentase selisih, serta ekspor langsung ke format Excel (.xlsx) dan CSV.

---

## 📦 Instalasi & Persiapan

### 1. Instalasi Package
```bash
npm install @makarimalahmad/price-scraper-sdk
```

*(Jika menggunakan GitHub Packages registry, pastikan token read package terpasang di file `.npmrc`)*

### 2. Environment Variables (`.env`)
Buat atau tambahkan variabel berikut di file `.env` aplikasi Anda:
```env
SERPAPI_KEY=your_serpapi_key_here
GROQ_API_KEY=your_groq_api_key_here   # Opsional: fallback AI jika DOM toko berubah
PROXY_URL=http://user:pass@host:port  # Opsional: untuk bypass proteksi IP datacenter
```

### 3. Install Playwright Browser
```bash
npx playwright install chromium
```

---

## 🚀 Penggunaan Utama: `compareGame`

Fungsi inti untuk melakukan scraping toko kompetitor Google secara otomatis, mencocokkan produk dengan toko patokan utama (**UPoint** & **DuniaGames**), menghitung harga terendah/tertinggi pasar, dan membuat laporan file Excel.

### Quick Start (Untuk Backend / Web Dashboard / Cron)

```javascript
const { compareGame } = require("@makarimalahmad/price-scraper-sdk");

async function main() {
  const result = await compareGame("free-fire", {
    limit: 10,                           // Default 10 kompetitor Google
    exportXlsxDirectory: "./downloads",  // Folder tujuan penyimpanan file Excel
  });

  console.log("Game:", result.game);
  console.log("Statistik:", result.summary);
  console.log("File Excel:", result.xlsxFilePath);
}

main();
```

---

## 📊 Struktur Return Object (`result`)

Struktur objek yang dikembalikan oleh fungsi `compareGame`:

```javascript
{
  game: "Free Fire",
  gameId: "free-fire",
  success: true,

  // Ringkasan status toko (total, berhasil, gagal)
  summary: {
    totalStores: 12,
    successfulStores: 12,
    failedStores: 0,
  },

  // Path file Excel yang diekspor
  xlsxFilePath: "C:/.../downloads/scrape-free-fire.xlsx",

  // Status dan URL masing-masing toko
  stores: [
    {
      name: "UPoint",
      classification: "MAIN_STORE",
      url: "https://upoint.id/top-up/free_fire",
      productCount: 18,
      status: "SUCCESS",
    },
    {
      name: "itemku.com",
      classification: "COMPETITOR",
      position: 1,
      organicPosition: "-",
      productCount: 15,
      status: "SUCCESS",
    },
    {
      name: "kiosgamer.co.id",
      classification: "COMPETITOR",
      position: 2,
      organicPosition: 1,
      productCount: 12,
      status: "SUCCESS",
    },
    // ... toko kompetitor lainnya
  ],

  // Tabel perbandingan harga produk, benchmark terendah/tertinggi, selisih, dan persentase
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
      "Harga Terendah | DuniaGames %": "17.0833%",
      // ... perbandingan harga tertinggi dst
    }
  ]
}
```

---

## ⚙️ Kustomisasi Tambahan

### 1. Kustomisasi Pajak / Biaya Toko (`calculateTax`)
Secara default, SDK mengembalikan harga asli mentah (*raw price*) apa adanya dari website toko. Anda dapat mengoper objek **Dictionary** untuk menerapkan PPN 11%, biaya admin QRIS, atau penyesuaian harga khusus per toko:

```javascript
const result = await compareGame("free-fire", {
  limit: 10,
  calculateTax: {
    "codashop.com": 1.11,                               // PPN 11%
    "unipin.com": 1.11,                                 // PPN 11%
    "itemku.com": 1.007,                                // Biaya QRIS 0.7%
    "ditusi.co.id": (price) => (price * 1.11) * 1.007, // Gabungan PPN 11% + QRIS 0.7%
  },
});
```

> **Tips:** 
> - Nama domain toko otomatis dinormalisasi oleh SDK (tanpa awalan `www.` dan berhuruf kecil), jadi Anda cukup menulis `"codashop.com"`.
> - Toko lain yang tidak dicantumkan di dalam dictionary (seperti UPoint atau DuniaGames) otomatis harganya tetap normal apa adanya.

### 2. Penggunaan Proxy (`proxy`)
Selain melalui file `.env` (`PROXY_URL`), opsi proxy dapat langsung dioperasikan saat pemanggilan fungsi:

```javascript
// Format URL Standar:
const result1 = await compareGame("roblox", {
  proxy: "http://user:pass@isp.proxy.com:10001",
});

// Format Raw Provider (Decodo/Webshare):
const result2 = await compareGame("roblox", {
  proxy: "isp.proxy.com:10001:username:password",
});
```

---

## 🛠️ Utilitas Tambahan

### 1. Scrape 1 URL Spesifik (`scrapeUrl`)
Untuk mengambil daftar harga dari satu alamat URL toko saja:

```javascript
const { scrapeUrl } = require("@makarimalahmad/price-scraper-sdk");

const result = await scrapeUrl("https://upoint.id/top-up/roblox", {
  headed: false,
  exportCsvPath: "./data.csv",
});

console.log("Status:", result.success);
console.log("Produk:", result.products);
```

### 2. Menjalankan via CLI / Terminal (Khusus Pengembang Repository)
Jika Anda meng-clone repository langsung dan ingin menjalankan scraper manual dari terminal:

```bash
# Komparasi game tertentu
node compare-game.js --game roblox
node compare-game.js --game free-fire
node compare-game.js --game mobile-legends

# Komparasi seluruh game sekaligus
node compare-game.js --game all

# Runner harian otomatis cron VPS
./scrape-daily.sh
```

---

## 📖 Referensi Parameter `compareGame`

| Opsi | Tipe | Default | Keterangan |
| :--- | :---: | :---: | :--- |
| `gameId` | `string` | **Wajib** | ID game: `"mobile-legends"`, `"free-fire"`, atau `"roblox"`. |
| `limit` | `number` | `10` | Jumlah toko kompetitor Google yang diambil (1–10). |
| `concurrency` | `number` | `3` | Jumlah browser paralel yang berjalan bersamaan (1–4). |
| `maxAttempts` | `number` | `3` | Batas percobaan ulang (*retry*) per toko jika timeout (1–5). |
| `headed` | `boolean` | `false` | Menampilkan jendela visual browser jika `true`. |
| `exportXlsxDirectory` | `string` | `null` | Path folder tujuan untuk menyimpan file Excel (.xlsx). |
| `calculateTax` | `object` | `null` | Dictionary aturan PPN / biaya per toko `{ "domain": multiplier/function }`. |
| `proxy` | `string` / `object` | `null` | Konfigurasi proxy opsional (`host:port:user:pass` atau `http://...`). |

---

## 📊 Status Ekstraksi Toko

Setiap toko pada array `result.stores` memiliki status terstandarisasi:

| Status | Keterangan |
| :--- | :--- |
| **`SUCCESS`** | Berhasil diekstrak murni melalui struktur DOM/HTML toko (`reason: null`). |
| **`SUCCESS_FALLBACK`** | Berhasil dipulihkan oleh Groq AI Fallback saat DOM awal kurang lengkap. |
| **`FAILED_FALLBACK`** | Gagal setelah dicoba via DOM dan Groq AI Fallback. |
| **`FAILED`** | Gagal teknis (timeout jaringan, blokir keamanan, atau kendala API). |

---

## 🧪 Verifikasi & Uji Script

```bash
npm test
```
