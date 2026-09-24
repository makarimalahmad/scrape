# Price Scraper & Voucher Comparison

Aplikasi otomatisasi untuk memantau dan membandingkan harga voucher game (**Mobile Legends**, **Free Fire**, dan **Roblox**) di pasar Indonesia. 

Sistem ini secara otomatis menelusuri toko kompetitor teratas di Google Indonesia, mengambil harga terkini dari masing-masing situs, menyetarakan nama produk, lalu menyusun laporan perbandingan harga antara toko utama (**UPoint** dan **DuniaGames**) dengan toko kompetitor ke dalam format **Excel (.xlsx)** dan **CSV**.

---

## Game yang Didukung

| Game | ID Game (`gameId`) | Toko Utama | Varian Produk yang Dipantau |
| :--- | :--- | :--- | :--- |
| **Mobile Legends: Bang Bang** | `mobile-legends` | UPoint, DuniaGames | Diamonds, Weekly Diamond Pass, Twilight Pass |
| **Free Fire** | `free-fire` | UPoint, DuniaGames | Diamonds, Membership Mingguan & Bulanan |
| **Roblox** | `roblox` | UPoint, DuniaGames | Robux, Roblox Gift Card / Game Card (IDR & USD) |

---

## Panduan Instalasi

Pastikan server atau komputer Anda sudah terpasang **Node.js (versi 18+)**.

```bash
# 1. Pasang dependensi proyek
npm install

# 2. Pasang browser Chromium (Playwright)
npx playwright install chromium
```

> **Untuk Pengguna VPS Linux (Ubuntu/Debian):**  
> Jika server tidak memiliki tampilan antarmuka visual (GUI), jalankan perintah pendukung berikut:  
> `npx playwright install-deps chromium`

---

## Konfigurasi Lingkungan (`.env`)

Duplikat file `.env.example` menjadi `.env` di folder utama proyek, lalu sesuaikan konfigurasinya:

```env
# ==============================================================================
# PENCARIAN GOOGLE (Pilih: 'brightdata' atau 'serpapi')
# ==============================================================================
SERP_PROVIDER=brightdata

# Konfigurasi Bright Data (Rekomendasi - Lebih hemat & stabil)
BRIGHTDATA_API_KEY=token_brightdata_anda
BRIGHTDATA_ZONE=serp_api

# Konfigurasi SerpApi (Opsional: Digunakan otomatis jika Bright Data tidak diatur)
# SERPAPI_KEY=key_serpapi_anda

# ==============================================================================
# PENGATURAN OPSIONAL
# ==============================================================================
SCRAPER_LIMIT=10            # Jumlah toko kompetitor yang diambil (Default: 10)
SCRAPER_CONCURRENCY=3       # Jumlah tab browser berjalan paralel (Default: 3, di VPS disarankan 2)
SCRAPER_MAX_ATTEMPTS=3     # Batas percobaan ulang jika toko lambat dimuat (Default: 3)

# Proxy (Hanya diperlukan jika ada toko yang membatasi IP server Anda)
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
* `--limit <jumlah>`: Membatasi jumlah kompetitor Google (contoh: `--limit 5`).
* `--headed`: Membuka jendela browser secara visual (sangat berguna untuk pengecekan langsung di komputer lokal).

### 4. Eksekusi Otomatis Harian di VPS
Proyek ini dilengkapi dengan skrip runner untuk jadwal harian (*cron job*):
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
│   │   ├── scrape-mobile-legends.xlsx   # Laporan Excel siap pakai
│   │   └── scrape-mobile-legends.csv
│   ├── free-fire/
│   │   └── scrape-free-fire.xlsx
│   ├── roblox/
│   │   └── scrape-roblox.xlsx
│   └── summary-scrape.json              # Ringkasan status scraping semua game
└── scrapes/                             # Data mentah CSV per masing-masing toko
```

### Fitur Laporan Excel (.xlsx):
* **Tabel Perbandingan Lengkap**: Menampilkan harga dari Toko Utama bersanding dengan seluruh Toko Kompetitor.
* **Penanda Warna Visual**:
  * 🟩 **Hijau**: Harga termurah di pasar untuk produk tersebut.
  * 🟥 **Merah**: Harga tertinggi di pasar untuk produk tersebut.
* **Analisis Selisih Harga**: Menghitung secara otomatis selisih nominal (Rp) dan selisih persentase (%) terhadap harga toko utama.

---

## Pengujian Kualitas Kode

Untuk memastikan seluruh modul penyesuaian nama produk, aturan pajak, dan fungsi pencarian berjalan normal:

```bash
npm test
```
