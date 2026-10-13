# Price Scraper SDK

SDK Node.js untuk mengambil, menstandarkan, dan membandingkan harga voucher game (**Mobile Legends**, **Free Fire**, dan **Roblox**) secara otomatis dari kompetitor Google Search Indonesia (Serper API).

Dirancang untuk diintegrasikan langsung ke dalam backend, API service, atau dashboard monitoring web harga voucher game.

---

## 📦 Instalasi

Pastikan runtime menggunakan **Node.js 18+**.

```bash
# 1. Pasang paket SDK
npm install @makarimalahmad/price-scraper-sdk

# 2. Pasang browser Chromium Playwright
npx playwright install chromium
```

---

## 🔑 Konfigurasi Environment (`.env`)

SDK membutuhkan API Key dari [Serper.dev](https://serper.dev) untuk mencari kompetitor organik Google. Buat file `.env` di root project Anda:

```env
SERPER_API_KEY=your_serper_api_key_here

# Konfigurasi Opsional (dapat juga diatur via options function)
SCRAPER_LIMIT=10          # Jumlah kompetitor Google (Default: 10, batas 1 - 10)
SCRAPER_CONCURRENCY=3     # Tab browser paralel (Default: 3, batas 1 - 4)
SCRAPER_MAX_ATTEMPTS=3   # Batas retry saat toko lambat (Default: 3, batas 1 - 5)
```

---

## 🚀 Quick Start

### 1. Komparasi Harga Game Lengkap (`compareGame`)

Fungsi utama untuk mengambil harga toko benchmark (**UPoint** & **DuniaGames**), mencari top kompetitor di Google, dan mengembalikan data komparasi terstruktur dalam bentuk JSON yang siap ditampilkan ke tabel/grafik dashboard web.

```javascript
const { compareGame } = require("@makarimalahmad/price-scraper-sdk");

async function getDashboardData() {
  const result = await compareGame("mobile-legends", {
    limit: 10, // Ambil top 10 kompetitor Google
    calculateTax: {
      "unipin.com": 11, // Tambah PPN 11% untuk UniPin
      "itemku.com": "0.7%", // Tambah biaya QRIS 0.7% untuk Itemku
    },
  });

  console.log(`Game: ${result.game}`);
  console.log(`Total Toko Berhasil: ${result.successfulStoreCount}/${result.storeCount}`);

  // Data perbandingan harga per nominal produk (siap di-loop ke tabel dashboard)
  console.log(result.comparisonTable);

  // Ringkasan toko termurah per nominal produk
  console.log(result.summary);

  return result;
}

getDashboardData();
```

### 2. Scrape Toko Tunggal (`scrapeUrl`)

Jika Anda hanya ingin mengambil daftar produk & harga dari satu URL toko spesifik:

```javascript
const { scrapeUrl } = require("@makarimalahmad/price-scraper-sdk");

async function scrapeSingleStore() {
  const result = await scrapeUrl("https://upoint.id/top-up/mobile_legends", {
    gameId: "mobile-legends",
  });

  if (result.success) {
    console.log(`Ditemukan ${result.count} produk:`);
    console.log(result.products); 
    // Output: [{ name: "86 Diamonds", price: "Rp 20.000", rawPrice: 20000 }, ...]
  } else {
    console.error(`Gagal scrape: ${result.error}`);
  }
}
```

---

## 📊 Format Output Data (JSON Response)

Format data yang dikembalikan oleh `compareGame(gameId)`:

```json
{
  "game": "Mobile Legends: Bang Bang",
  "gameId": "mobile-legends",
  "generatedAt": "2026-10-13T04:30:00.000Z",
  "storeCount": 12,
  "successfulStoreCount": 12,
  "stores": [
    {
      "name": "UPoint",
      "classification": "MAIN_STORE",
      "position": null,
      "organicPosition": null,
      "url": "https://upoint.id/top-up/mobile_legends",
      "productCount": 24,
      "status": "SUCCESS",
      "reason": null,
      "confidence": 100,
      "usedProxy": false
    },
    {
      "name": "Codashop",
      "classification": "COMPETITOR",
      "position": 1,
      "organicPosition": 1,
      "url": "https://www.codashop.com/id-id/mobile-legends",
      "productCount": 22,
      "status": "SUCCESS",
      "reason": null,
      "confidence": 100,
      "usedProxy": false
    }
  ],
  "comparisonTable": [
    {
      "Produk": "86 Diamonds",
      "UPoint": 20000,
      "DuniaGames": 21000,
      "Codashop": 19500,
      "UniPin": 20500,
      "Harga Terendah | UPoint": 20000,
      "Harga Terendah | UPoint Selisih": -500,
      "Harga Terendah | UPoint %": -2.5,
      "Harga Terendah | DuniaGames": 21000,
      "Harga Terendah | DuniaGames Selisih": -1500,
      "Harga Terendah | DuniaGames %": -7.1,
      "Harga Tertinggi | UPoint": 20000,
      "Harga Tertinggi | UPoint Selisih": 500,
      "Harga Tertinggi | UPoint %": 2.5
    }
  ],
  "summary": [
    {
      "product": "86 Diamonds",
      "cheapestStore": "Codashop",
      "cheapestPrice": 19500
    }
  ],
  "xlsxFilePath": "/path/to/output/scrape-mobile-legends.xlsx"
}
```

### Penjelasan Properti Utama untuk Dashboard:

| Properti | Tipe Data | Deskripsi |
| :--- | :--- | :--- |
| `game` | `string` | Nama resmi game yang discrape. |
| `successfulStoreCount` | `number` | Jumlah toko yang berhasil discrape tanpa error. |
| `stores` | `Array<Object>` | Metadata setiap toko (nama, URL, ranking Google, status `SUCCESS`/`FAILED`). |
| `comparisonTable` | `Array<Object>` | **Data utama tabel**: Berisi baris produk dan kolom harga tiap toko serta selisih nominal dan persentase terhadap benchmark. |
| `summary` | `Array<Object>` | Ringkasan cepat produk dan toko mana yang menawarkan harga termurah. |
| `xlsxFilePath` | `string \| null` | Path file Excel (.xlsx) jika opsi ekspor diaktifkan. |

---

## ⚙️ API Reference

### `compareGame(gameId, options)`

Melakukan pencarian kompetitor di Google lalu melakukan scraping dan kalkulasi perbandingan harga.

#### Parameter `gameId` (String - Wajib):
Pilih salah satu:
* `'mobile-legends'`
* `'free-fire'`
* `'roblox'`

#### Parameter `options` (Object - Opsional):

| Nama Opsi | Tipe Data | Default | Keterangan |
| :--- | :--- | :--- | :--- |
| `limit` | `number` | `10` | Jumlah kompetitor organik Google yang diambil (1 - 10). |
| `calculateTax` | `Object` | `null` | Aturan penambahan pajak/biaya admin per domain (lihat bagian Pajak). |
| `apiKey` | `string` | `process.env.SERPER_API_KEY` | API Key Serper.dev jika tidak menggunakan `.env`. |
| `concurrency` | `number` | `3` | Jumlah tab browser paralel (1 - 4). |
| `maxAttempts` | `number` | `3` | Batas coba ulang saat halaman lambat/timeout (1 - 5). |
| `headed` | `boolean` | `false` | Jalankan browser secara visual (`true` hanya untuk debugging lokal). |
| `exportXlsxDirectory`| `string` | Folder harian default | Folder tujuan penyimpanan laporan Excel (.xlsx). |
| `proxy` | `string \| Object`| `null` | Proxy URL jika server hosting diblokir oleh toko tertentu. |

---

## 🎮 Game yang Didukung

| Game | `gameId` | Toko Benchmark Utama | Varian Produk yang Dipantau |
| :--- | :--- | :--- | :--- |
| **Mobile Legends: Bang Bang** | `mobile-legends` | UPoint, DuniaGames | Diamonds, Weekly Diamond Pass, Twilight Pass |
| **Free Fire** | `free-fire` | UPoint, DuniaGames | Diamonds, Membership Mingguan & Bulanan |
| **Roblox** | `roblox` | UPoint, DuniaGames | Robux, Roblox Gift Card / Game Card (IDR & USD) |

---

## 🏷️ Penyesuaian Pajak & Biaya Transaksi (`calculateTax`)

Secara default, SDK mengambil harga netto asli yang tertera di situs toko. Jika ingin menambahkan PPN atau biaya transaksi (seperti QRIS / payment gateway), masukkan aturan di opsi `calculateTax`:

```javascript
const result = await compareGame("mobile-legends", {
  calculateTax: {
    // 1. Persentase per domain toko (angka atau string %):
    "unipin.com": 11,       // PPN 11%
    "itemku.com": "0.7%",   // QRIS 0.7%
    "ditusi.co.id": 12.11,  // PPN 11% + Fee 1.11%

    // 2. Persentase spesifik per game dalam satu domain:
    "codashop.com": {
      "mobile-legends": 11,
      "free-fire": 11,
      "roblox": 0,
    },
  },
});
```

* Domain yang tidak didaftarkan otomatis menggunakan harga asli tanpa penyesuaian.
* Mendukung format angka (`11`), string angka (`"11"`), maupun string persen (`"11%"`).

---

## 🛠️ CLI Runner & Pengujian (Opsional)

Untuk pengujian cepat melalui terminal tanpa menulis kode:

```bash
# Jalankan komparasi semua game via CLI
node compare-game.js --game all

# Jalankan game tertentu dengan batas 5 kompetitor
node compare-game.js --game mobile-legends --limit 5

# Jalankan automated test suite
npm test
```
