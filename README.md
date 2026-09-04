# @makarimalahmad/price-scraper-sdk

Scraper harga voucher game (**Mobile Legends**, **Free Fire**, dan **Roblox**) berbasis pencarian Google Organik (SerpAPI) dengan ekspor ke format Excel (.xlsx) dan CSV.

---

## ⚙️ Persiapan & Konfigurasi

### 1. File `.env`
Buat file `.env` di root direktori:
```env
SERPAPI_KEY=your_serpapi_key_here
GROQ_API_KEY=your_groq_api_key_here  # Opsional: untuk AI fallback jika DOM tidak lengkap
PROXY_URL=http://user:pass@host:port # Opsional: jika ada toko yang memblokir IP Datacenter VPS (misal Bangjeff)
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
Secara *default*, SDK mengembalikan harga asli mentah (*raw price*) apa adanya dari website toko. Anda dapat menyertakan fungsi `calculateTax` untuk menyesuaikan harga atau menambahkan PPN/biaya admin pada toko tertentu.

Fungsi `calculateTax` menerima parameter objek:
* `hostname` *(string)*: Domain toko target (misal: `"codashop.com"`).
* `rawPrice` *(number)*: Harga nominal asli sebelum penyesuaian (misal: `20000`).
* `productName` *(string)*: Nama produk yang diekstrak (misal: `"140 Diamonds"`).
* `game` *(string)*: ID game yang sedang diproses (`"mobile-legends"`, `"free-fire"`, atau `"roblox"`).

#### Contoh 1: Menerapkan PPN 11% untuk Banyak Toko Sekaligus
Jika Anda ingin menerapkan penyesuaian PPN 11% ke banyak toko kompetitor secara kolektif:

```javascript
const { compareGame } = require("@makarimalahmad/price-scraper-sdk");

async function main() {
  // Daftar domain toko yang dikenakan PPN 11%
  const tokoKenaPPN11 = [
    "codashop.com",
    "unipin.com",
    "itemku.com",
    "lapakgaming.com",
    "vcgamers.com",
    "tokopedia.com",
    "blibli.com",
    "kiosgamer.co.id",
  ];

  const result = await compareGame("free-fire", {
    limit: 10,
    calculateTax: ({ hostname, rawPrice }) => {
      // Cek apakah hostname toko termasuk dalam daftar toko PPN 11%
      const kenaPajak = tokoKenaPPN11.some((domain) => hostname.includes(domain));
      if (kenaPajak) {
        return Math.round(rawPrice * 1.11);
      }

      // Toko lainnya (atau toko utama seperti UPoint & DuniaGames) tetap harga normal
      return rawPrice;
    },
  });

  console.log("Daftar Toko:", result.stores);
  console.log("File Laporan:", result.xlsxFilePath);
}

main();
```

#### Contoh 2: Multi-Toko & Multi-Tarif (Kombinasi PPN & Biaya Khusus)
Jika masing-masing kelompok toko memiliki ketentuan tarif pajak atau biaya layanan yang berbeda:

```javascript
const { compareGame } = require("@makarimalahmad/price-scraper-sdk");

async function main() {
  const result = await compareGame("mobile-legends", {
    limit: 10,
    calculateTax: ({ hostname, rawPrice }) => {
      // Kelompok 1: Toko dengan PPN 11%
      const tokoPPN11 = ["codashop.com", "unipin.com", "itemku.com", "vcgamers.com"];
      if (tokoPPN11.some((store) => hostname.includes(store))) {
        return Math.round(rawPrice * 1.11);
      }

      // Kelompok 2: Toko dengan biaya platform / admin 2%
      const tokoAdmin2 = ["lapakgaming.com", "tokopedia.com"];
      if (tokoAdmin2.some((store) => hostname.includes(store))) {
        return Math.round(rawPrice * 1.02);
      }

      // Toko lainnya tetap menggunakan harga asli
      return rawPrice;
    },
  });

  console.log("Daftar Toko:", result.stores);
  console.log("File Laporan:", result.xlsxFilePath);
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
| `calculateTax` | `function` | `null` | Fungsi callback kustom untuk mengatur PPN/biaya per toko (menerima `{ hostname, rawPrice, productName, game }`). |
| `proxy` | `string` / `object` | `null` | Konfigurasi proxy opsional (`host:port:user:pass` atau `http://...`). |

### 3. Parameter SDK (`scrapeUrl`)
| Opsi | Tipe | Default | Keterangan |
| :--- | :---: | :---: | :--- |
| `url` | `string` | **Wajib** | URL halaman toko target yang akan diekstrak. |
| `headed` | `boolean` | `false` | Menampilkan jendela visual browser jika `true`. |
| `exportCsvPath` | `string` | `null` | Path file tujuan untuk menyimpan hasil ke CSV. |
| `calculateTax` | `function` | `null` | Fungsi callback kustom untuk mengatur PPN/biaya toko target. |
| `proxy` | `string` / `object` | `null` | Konfigurasi proxy opsional (`host:port:user:pass` atau `http://...`). |

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

## 📁 Struktur Proyek & Arsitektur Direktori

```text
price-scraper/
├── lib/                             # Core internal modules terorganisir
│   ├── anti-bot/                    # Bypass Cloudflare Turnstile & Real Browser
│   │   ├── cloudflare.js
│   │   └── real-browser.js
│   ├── browser/                     # Playwright Chromium & Stealth configuration
│   │   └── playwright.js
│   ├── config/                      # Konfigurasi game & toko utama (UPoint/DuniaGames)
│   │   └── game-config.js
│   ├── extractors/                  # Ekstraktor harga game
│   │   ├── ai-extractor.js          # Groq AI LLM extraction fallback
│   │   ├── generic-extractor.js     # Universal fallback JSON/DOM extractor
│   │   ├── parsers.js               # Parser teks kartu/opsi produk
│   │   └── special-extractors.js    # 15+ ekstraktor khusus toko besar (Tokopedia, Shopee, Blibli, dll)
│   ├── google/                      # SerpAPI search & koordinasi kompetitor Google
│   │   └── google-search.js
│   ├── matcher/                     # Mesin normalisasi & pencocokan produk kompetitor
│   │   └── product-matcher.js
│   ├── proxy/                       # Smart proxy manager & fallback
│   │   └── proxy-manager.js
│   ├── utils/                       # Utilitas ekspor CSV & laporan error
│   │   └── export-csv.js
│   └── validation/                  # Validasi kualitas scrape & confidence score
│       └── validate-results.js
├── index.js                         # Public SDK Facade (@makarimalahmad/price-scraper-sdk)
├── compare-game.js                  # CLI runner: komparasi game Google & ekspor Excel
├── compare-url.js                   # CLI runner: komparasi 2 URL spesifik
├── scrape.js                        # CLI runner: scraping single URL
├── scrape-daily.sh                  # Runner cron harian otomatis di VPS
├── package.json
└── README.md
```

---

## 🧪 Verifikasi & Uji Script

```bash
npm test
```

