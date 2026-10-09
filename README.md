# Price Scraper & Comparison

Scraper untuk memantau dan membandingkan harga voucher game (**Mobile Legends**, **Free Fire**, dan **Roblox**).

Script ini mencari kompetitor teratas di Google Indonesia (Serper API), mengambil harga produk, menstandarkan nama item, lalu membuat laporan perbandingan harga antara toko utama (**UPoint** dan **DuniaGames**) dengan kompetitor dalam format **Excel (.xlsx)** dan **CSV**.

---

## Game yang Didukung

| Game                          | ID Game (`gameId`) | Toko Utama         | Varian Produk yang Dipantau                     |
| :---------------------------- | :----------------- | :----------------- | :---------------------------------------------- |
| **Mobile Legends: Bang Bang** | `mobile-legends`   | UPoint, DuniaGames | Diamonds, Weekly Diamond Pass, Twilight Pass    |
| **Free Fire**                 | `free-fire`        | UPoint, DuniaGames | Diamonds, Membership Mingguan & Bulanan         |
| **Roblox**                    | `roblox`           | UPoint, DuniaGames | Robux, Roblox Gift Card / Game Card (IDR & USD) |

---

## Instalasi

Kebutuhan: **Node.js 18+**.

```bash
# Pasang dependensi dan browser Chromium
npm install
npx playwright install chromium
```

---

## Konfigurasi (`.env`)

Salin `.env.example` menjadi `.env` di folder utama, lalu isi konfigurasi:

```env
# Google Search API (Serper.dev)
SERPER_API_KEY=ISI_KEY_SERPER

# Pengaturan Opsional
SCRAPER_LIMIT=10            # Jumlah kompetitor yang diambil (Default: 10, batas 1 - 10)
SCRAPER_CONCURRENCY=3       # Tab browser paralel (Default: 3, batas 1 - 4)
SCRAPER_MAX_ATTEMPTS=3     # Batas coba ulang saat halaman lambat (Default: 3, batas 1 - 5)

# Proxy (Diperlukan jika toko memblokir IP server)
# PROXY_URL=http://username:password@host:port
# PROXY_DOMAINS=bangjeff.com
```

---

## Cara Menjalankan

### 1. Semua Game Sekaligus

```bash
node compare-game.js --game all
```

### 2. Game Tertentu

```bash
# Mobile Legends
node compare-game.js --game mobile-legends

# Free Fire
node compare-game.js --game free-fire

# Roblox
node compare-game.js --game roblox
```

### 3. Opsi Flags

- `--limit <jumlah>`: Batasi jumlah kompetitor Google (contoh: `node compare-game.js --game mobile-legends --limit 5`).
- `--headed`: Buka jendela browser secara visual (untuk debug lokal).

### 4. Eksekusi Otomatis Harian di Server

Runner untuk cron job harian di server:

```bash
./scrape-daily.sh
```

---

## Output

Setiap proses komparasi membuat folder baru berdasarkan tanggal di dalam `output/`:

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
│   └── summary-scrape.json              # Ringkasan status scraping (JSON)
└── scrapes/                             # Data mentah CSV per toko
```

### Format Excel (.xlsx):

- **Tabel Perbandingan**: Harga toko utama vs semua kompetitor per produk.
- **Warna**:
  - 🟩 **Hijau**: Harga termurah.
  - 🟥 **Merah**: Harga termahal.
- **Selisih**: Nominal (Rp) dan persentase (%) terhadap harga toko utama.

---

## Penyesuaian Pajak & Biaya (`calculateTax`)

Default: scraper mengambil harga asli yang tertera di situs toko.

Jika harga kompetitor perlu disesuaikan dengan PPN (misal 11%) atau biaya transaksi (QRIS 0.7%), gunakan opsi `calculateTax`:

```javascript
const { compareGame } = require("@makarimalahmad/price-scraper-sdk");

const result = await compareGame("mobile-legends", {
  calculateTax: {
    // Persentase per domain toko:
    "unipin.com": 11, // PPN 11% (angka)
    "itemku.com": "0.7%", // QRIS 0.7% (string %)
    "ditusi.co.id": 12.11, // PPN 11% + QRIS 1.11%

    // Khusus per game dalam satu domain:
    "codashop.com": {
      "mobile-legends": 11,
      "free-fire": 11,
      roblox: 0,
    },
  },
});
```

Catatan:
- Domain yang tidak terdaftar di dictionary tetap memakai harga asli.
- Format nilai menerima string persen (`"11%"`, `"0.7%"`), string angka (`"11"`), atau angka murni (`11`).
- Domain dicocokkan otomatis (tidak terpengaruh awalan `www.` atau huruf besar/kecil).

---

## Pengujian

Jalankan test suite:

```bash
npm test
```
