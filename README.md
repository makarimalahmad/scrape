# @makarimalahmad/price-scraper-sdk

Scraper harga voucher game (**Mobile Legends**, **Free Fire**, dan **Roblox**) berbasis pencarian Google Organik (SerpAPI) dengan ekspor ke format Excel (.xlsx) dan CSV.

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
```bash
# Komparasi game tertentu
node compare-game.js --game roblox
node compare-game.js --game free-fire
node compare-game.js --game mobile-legends

# Komparasi seluruh game sekaligus
node compare-game.js --game all

# Opsi tambahan (opsional)
node compare-game.js --game roblox --limit 10 --attempts 3 --concurrency 3 --headed
```

### 2. Scrape Cepat 1 URL Toko
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
    limit: 5,
    concurrency: 2,
    exportXlsxDirectory: "./laporan",
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
  const result = await scrapeUrl("https://garudaku.com/gstore/roblox", {
    headed: false,
    exportCsvPath: "./data.csv",
  });

  console.log("Status:", result.success);
  console.log("Produk:", result.products);
}

main();
```

### 3. Kustomisasi Pajak / Biaya Toko (`calculateTax`)

#### A. Menggunakan Fungsi Panah Bawaan SDK (`defaultTaxCalculator`):
```javascript
const { compareGame, defaultTaxCalculator } = require("@makarimalahmad/price-scraper-sdk");

async function main() {
  // Menggunakan aturan pajak bawaan resmi (Codashop direct top-up +11% PPN):
  const result = await compareGame("free-fire", {
    limit: 5,
    calculateTax: defaultTaxCalculator,
  });
}

main();
```

#### B. Menulis Fungsi Panah Kustom Sendiri:
```javascript
const { compareGame } = require("@makarimalahmad/price-scraper-sdk");

async function main() {
  const result = await compareGame("roblox", {
    limit: 5,
    // Fungsi panah custom buatan Tim IT:
    calculateTax: ({ hostname, rawPrice }) => {
      const tokoPPN11 = ["codashop.com", "unipin.com"];
      if (tokoPPN11.some((toko) => hostname.includes(toko))) {
        return Math.round(rawPrice * 1.11);
      }
      return rawPrice;
    },
  });
}

main();
```

---

## 📖 Referensi Parameter

### 1. Parameter CLI (`compare-game.js`)
| Parameter | Default | Keterangan |
| :--- | :---: | :--- |
| `--game` | **Wajib** | Pilihan game: `all`, `mobile-legends`, `free-fire`, atau `roblox`. |
| `--limit` | `10` | Jumlah toko kompetitor Google yang diambil (1–10). |
| `--attempts` | `3` | Batas percobaan ulang (*retry*) per toko jika terjadi kendala jaringan (1–5). |
| `--concurrency` | `3` | Jumlah browser paralel yang berjalan bersamaan (1–4). |
| `--headed` | `false` | Menampilkan jendela visual browser jika disertakan. |

### 2. Parameter SDK (`compareGame`)
| Opsi | Tipe | Default | Keterangan |
| :--- | :---: | :---: | :--- |
| `gameId` | `string` | **Wajib** | ID game: `"mobile-legends"`, `"free-fire"`, atau `"roblox"`. |
| `limit` | `number` | `10` | Jumlah toko kompetitor Google yang diambil (1–10). |
| `concurrency` | `number` | `3` | Jumlah browser paralel yang berjalan bersamaan (1–4). |
| `maxAttempts` | `number` | `3` | Batas percobaan ulang (*retry*) per toko jika timeout (1–5). |
| `headed` | `boolean` | `false` | Menampilkan jendela visual browser jika `true`. |
| `exportXlsxDirectory` | `string` | `null` | Path folder tujuan untuk menyimpan file Excel (.xlsx). |
| `calculateTax` | `function` | `null` | Fungsi lambda panah untuk menyesuaikan harga/pajak toko tertentu (contoh: `({ hostname, rawPrice }) => hostname.includes("coda") ? rawPrice * 1.11 : rawPrice`). |

### 3. Parameter SDK (`scrapeUrl`)
| Opsi | Tipe | Default | Keterangan |
| :--- | :---: | :---: | :--- |
| `url` | `string` | **Wajib** | URL halaman toko target yang akan diekstrak. |
| `headed` | `boolean` | `false` | Menampilkan jendela visual browser jika `true`. |
| `exportCsvPath` | `string` | `null` | Path file tujuan untuk menyimpan hasil ke CSV. |
| `calculateTax` | `function` | `null` | Fungsi lambda panah untuk transformasi harga/pajak custom. |

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
