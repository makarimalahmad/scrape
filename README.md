# Price Scraper & Comparison

Otomatisasi untuk memantau dan membandingkan harga voucher game (**Mobile Legends**, **Free Fire**, dan **Roblox**).

Sistem ini secara otomatis menelusuri toko kompetitor teratas di Google Indonesia, mengambil harga terkini dari masing-masing situs, menyetarakan nama produk, lalu menyusun laporan perbandingan harga antara toko utama (**UPoint** dan **DuniaGames**) dengan toko kompetitor ke dalam format **Excel (.xlsx)** dan **CSV**.

---

## Game yang Didukung

| Game                          | ID Game (`gameId`) | Toko Utama         | Varian Produk yang Dipantau                     |
| :---------------------------- | :----------------- | :----------------- | :---------------------------------------------- |
| **Mobile Legends: Bang Bang** | `mobile-legends`   | UPoint, DuniaGames | Diamonds, Weekly Diamond Pass, Twilight Pass    |
| **Free Fire**                 | `free-fire`        | UPoint, DuniaGames | Diamonds, Membership Mingguan & Bulanan         |
| **Roblox**                    | `roblox`           | UPoint, DuniaGames | Robux, Roblox Gift Card / Game Card (IDR & USD) |

---

## Panduan Instalasi

Pastikan server atau komputer sudah terpasang **Node.js (versi 18+)**.

```bash
# 1. Pasang dependensi proyek
npm install

# 2. Pasang browser Chromium (Playwright)
npx playwright install chromium
```

> **Untuk Linux (Ubuntu/Debian):**  
> Jika server tidak memiliki tampilan antarmuka visual (GUI), jalankan perintah pendukung berikut:  
> `npx playwright install-deps chromium`

---

## Konfigurasi Environment (`.env`)

Duplikat file `.env.example` menjadi `.env` di folder utama, sesuaikan konfigurasi berikut:

```env
# Provider pencarian Google ('brightdata' atau 'serpapi')
SERP_PROVIDER=brightdata

# Bright Data SERP API
BRIGHTDATA_API_KEY=ISI_TOKEN_BRIGHTDATA
BRIGHTDATA_ZONE=serp_api

# SerpApi (Opsional: Digunakan otomatis jika Bright Data tidak diatur)
# SERPAPI_KEY=ISI_KEY_SERPAPI

# ==============================================================================
# PENGATURAN OPSIONAL
# ==============================================================================
SCRAPER_LIMIT=10            # Jumlah toko kompetitor yang diambil (Default: 10, batas 1 - 10)
SCRAPER_CONCURRENCY=3       # Jumlah tab browser berjalan paralel (Default: 3, batas 1 - 4)
SCRAPER_MAX_ATTEMPTS=3     # Batas percobaan ulang jika toko lambat dimuat (Default: 3, batas 1 - 5)

# Proxy (Hanya diperlukan jika ada toko yang membatasi IP server)
# PROXY_URL=http://username:password@host:port
# PROXY_DOMAINS=bangjeff.com
```

---

## Cara Menjalankan

### 1. Menjalankan Seluruh Game Sekaligus

```bash
node compare-game.js --game all
```

### 2. Menjalankan Game Tertentu

```bash
# Mobile Legends
node compare-game.js --game mobile-legends

# Free Fire
node compare-game.js --game free-fire

# Roblox
node compare-game.js --game roblox
```

### 3. Opsi Tambahan (Flags)

- `--limit <jumlah>`: Membatasi jumlah kompetitor Google (contoh: `node compare-game.js --game mobile-legends --limit 5`).
- `--headed`: Membuka jendela browser secara visual (untuk pengecekan langsung di komputer lokal).

### 4. Eksekusi Otomatis Harian di VPS

Proyek ini dilengkapi dengan skrip runner untuk jadwal harian (_cron job_):

```bash
./scrape-daily.sh
```

---

## Format Laporan Hasil Output

Setiap proses komparasi akan membuat folder baru berdasarkan tanggal di dalam direktori `output/`:

```text
output/YYYY-MM-DD/
├── comparison/
│   ├── mobile-legends/
│   │   ├── scrape-mobile-legends.xlsx  # Laporan Excel
│   │   └── scrape-mobile-legends.csv   # Laporan CSV
│   ├── free-fire/
│   │   └── scrape-free-fire.xlsx
│   ├── roblox/
│   │   └── scrape-roblox.xlsx
│   └── summary-scrape.json              # Ringkasan status scraping semua game (JSON)
└── scrapes/                             # Data mentah CSV per masing-masing toko
```

### Fitur Laporan Excel (.xlsx):

- **Tabel Perbandingan Lengkap**: Menampilkan perbandingan harga dari Toko Utama dengan seluruh Toko Kompetitor.
- **Penanda Warna Visual**:
  - 🟩 **Hijau**: Harga termurah di pasar untuk produk tersebut.
  - 🟥 **Merah**: Harga tertinggi di pasar untuk produk tersebut.
- **Analisis Selisih Harga**: Menghitung secara otomatis selisih nominal (Rp) dan selisih persentase (%) terhadap harga toko utama.

---

## Penyesuaian Pajak & Biaya Toko (Dictionary PPN)

Secara default, scraper mengambil harga asli yang tertera pada situs masing-masing toko. Jika ingin harga kompetitor disesuaikan dengan estimasi PPN (misal 11%) atau biaya transaksi (seperti QRIS 0.7%), SDK menyediakan opsi `calculateTax`:

```javascript
const { compareGame } = require("@makarimalahmad/price-scraper-sdk");

const result = await compareGame("mobile-legends", {
  calculateTax: {
    // 1. Penyesuaian persentase per domain toko:
    "unipin.com": 11, // Menambahkan PPN 11% (format angka)
    "itemku.com": "0.7%", // Menambahkan biaya QRIS 0.7% (format string %)
    "ditusi.co.id": 12.11, // PPN 11% + QRIS 1.11%

    // 2. Penyesuaian khusus per game dalam satu domain:
    "codashop.com": {
      "mobile-legends": 11, // PPN 11% khusus MLBB
      "free-fire": 11, // PPN 11% khusus Free Fire
      roblox: 0, // Tanpa penyesuaian untuk Roblox
    },
  },
});
```

**NOTE:**

- Domain toko yang tidak didaftarkan pada dictionary akan tetap menggunakan harga asli tanpa perubahan.
- Format bisa menggunakan string persen ("11%", "0.7%"), string angka ("11", "0.7"), maupun angka murni (11, 0.7).
- Nama domain dicocokkan secara otomatis (tidak terpengaruh awalan `www.` atau huruf besar/kecil).

---

## Pengujian Kualitas Kode

Untuk memastikan seluruh modul penyesuaian nama produk, aturan pajak, dan fungsi pencarian berjalan normal:

```bash
npm test
```
