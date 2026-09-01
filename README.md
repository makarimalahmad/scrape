# @makarimalahmad/price-scraper-sdk

Node.js Scraper & Price Comparison Engine untuk voucher game (**Mobile Legends**, **Free Fire**, dan **Roblox**) berbasis pencarian Google Organik (SerpAPI), dilengkapi normalisasi produk cerdas, AI Fallback extractor (Groq), dan ekspor otomatis ke Excel (.xlsx) serta CSV.

---

## ⚙️ Persiapan & Konfigurasi

### 1. File `.env`
Buat file `.env` di root direktori:
```env
SERPAPI_KEY=your_serpapi_key_here
GROQ_API_KEY=your_groq_api_key_here  # Opsional: untuk AI fallback jika DOM tidak lengkap
```

### 2. Install Playwright Chromium
```bash
npx playwright install chromium
```

---

## 🖥️ Penggunaan via CLI / Terminal

### 1. Komparasi Multi-Store Google & Ekspor Excel (Utama)
Menjalankan pencarian kompetitor organik Google, scraping toko utama (UPoint & DuniaGames) dan kompetitor, lalu mengekspor hasil ke format Excel (.xlsx):
```bash
# Komparasi game tertentu
node scrape-new.js --game roblox
node scrape-new.js --game free-fire
node scrape-new.js --game mobile-legends

# Komparasi seluruh game sekaligus
node scrape-new.js --game all
```

### 2. Scrape Cepat 1 URL Toko
Mengambil daftar harga dan produk langsung dari 1 link toko:
```bash
node scrape.js "https://garudaku.com/gstore/roblox"
```

### 3. Runner Harian VPS (Cron)
```bash
./scrape-daily.sh
```

---

## 🚀 Penggunaan via Node.js SDK

### 1. `compareGame(gameId, [options])`
```javascript
const { compareGame } = require("@makarimalahmad/price-scraper-sdk");

async function main() {
  const result = await compareGame("roblox", {
    limit: 5,                          // Jumlah kompetitor Google (default: 10)
    concurrency: 2,                     // Browser paralel (default: 3)
    exportXlsxDirectory: "./laporan",   // Folder output file Excel
  });

  console.log("Game:", result.game);
  console.log("Daftar Toko:", result.stores);
  console.log("File Excel:", result.xlsxFilePath);
}

main();
```

### 2. `scrapeUrl(url, [options])`
```javascript
const { scrapeUrl } = require("@makarimalahmad/price-scraper-sdk");

async function main() {
  const result = await scrapeUrl("https://garudaku.com/gstore/roblox");
  console.log("Status:", result.success);
  console.log("Produk:", result.products);
}

main();
```

---

## 📊 Definisi Status Ekstraksi Toko

Setiap toko di `summary-scrape.json` dan SDK memiliki status terstandarisasi:

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
