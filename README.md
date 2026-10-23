# Price Scraper & Comparison

Otomatisasi untuk memantau dan membandingkan harga voucher game (**Mobile Legends**, **Free Fire**, dan **Roblox**).

Sistem ini secara otomatis menelusuri toko kompetitor teratas di Google Indonesia, mengambil harga terkini dari masing-masing situs, menyetarakan nama produk, lalu menyusun laporan perbandingan harga antara toko utama (**UPoint** dan **DuniaGames**) dengan toko kompetitor ke dalam format **Excel (.xlsx)** dan **CSV**.

---

## Game yang Didukung

| Game                          | ID Game (`gameId`) | Toko Utama         | Cakupan Produk                                  |
| :---------------------------- | :----------------- | :----------------- | :---------------------------------------------- |
| **Mobile Legends: Bang Bang** | `mobile-legends`   | UPoint, DuniaGames | Diamonds, Weekly Diamond Pass, Twilight Pass    |
| **Free Fire**                 | `free-fire`        | UPoint, DuniaGames | Diamonds, Membership Mingguan & Bulanan         |
| **Roblox**                    | `roblox`           | UPoint, DuniaGames | Robux, Roblox Gift Card / Game Card (IDR & USD) |

---

## Installation

Requirements: **Node.js 18+**.

```bash
# Install SDK package
npm install @makarimalahmad/price-scraper-sdk

# Install browser Chromium Playwright
npx playwright install chromium
```

---

## Configuration (`.env`)

Copy `.env.example` ke `.env`, lalu sesuaikan konfigurasi:

```env
# Google Search API (Serper.dev)
SERPER_API_KEY=ISI_KEY_SERPER

# Optional Settings
SCRAPER_LIMIT=10            # Jumlah kompetitor organik Google (Default: 10, batas 1 - 10)
SCRAPER_CONCURRENCY=3       # Tab browser paralel (Default: 3, batas 1 - 4)
SCRAPER_MAX_ATTEMPTS=3     # Batas coba ulang saat halaman lambat (Default: 3, batas 1 - 5)

# Proxy (Diperlukan jika toko memblokir IP server)
# PROXY_URL=http://username:password@host:port
# PROXY_DOMAINS=bangjeff.com
```

---

## Usage & Examples

### 1. Compare Game Prices (`compareGame`)

Mengambil harga toko utama (UPoint & DuniaGames), mencari kompetitor di Google, dan mengembalikan data perbandingan harga:

```javascript
const { compareGame } = require("@makarimalahmad/price-scraper-sdk");

async function run() {
  const result = await compareGame("mobile-legends", {
    limit: 10,
    calculateTax: {
      "unipin.com": 11,
      "itemku.com": "0.7%",
    },
  });

  console.log(`Game: ${result.game}`);
  console.log(`Toko berhasil: ${result.successfulStoreCount}/${result.storeCount}`);
  console.log(result.comparisonTable);
  console.log(result.summary);
}

run();
```

### 2. Scrape Single URL (`scrapeUrl`)

Mengambil daftar produk dan harga dari satu URL toko:

```javascript
const { scrapeUrl } = require("@makarimalahmad/price-scraper-sdk");

async function run() {
  const result = await scrapeUrl("https://upoint.id/top-up/mobile_legends", {
    gameId: "mobile-legends",
  });

  if (result.success) {
    console.log(`Ditemukan ${result.count} produk:`, result.products);
  }
}

run();
```

---

## Output Format

Struktur objek yang dikembalikan oleh `compareGame(gameId)`:

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

### Properti Utama:

| Properti | Tipe | Deskripsi |
| :--- | :--- | :--- |
| `game` | `string` | Nama game. |
| `successfulStoreCount` | `number` | Jumlah toko yang berhasil discrape. |
| `stores` | `Array<Object>` | Metadata toko (nama, URL, peringkat Google, status scraping). |
| `comparisonTable` | `Array<Object>` | Baris produk dan kolom harga per toko beserta selisih nominal dan persentase. |
| `summary` | `Array<Object>` | Toko dan harga termurah per produk. |
| `xlsxFilePath` | `string \| null` | Path file Excel (.xlsx) jika opsi ekspor aktif. |

---

## Parameters & Options (`compareGame`)

### `gameId` (String):
- `'mobile-legends'`
- `'free-fire'`
- `'roblox'`

### `options` (Object):

| Opsi | Tipe | Default | Keterangan |
| :--- | :--- | :--- | :--- |
| `limit` | `number` | `10` | Jumlah kompetitor organik Google (1 - 10). |
| `calculateTax` | `Object` | `null` | Aturan penyesuaian pajak/biaya transaksi per domain. |
| `apiKey` | `string` | `process.env.SERPER_API_KEY` | Serper API key. |
| `concurrency` | `number` | `3` | Jumlah tab browser paralel (1 - 4). |
| `maxAttempts` | `number` | `3` | Batas coba ulang saat halaman lambat (1 - 5). |
| `headed` | `boolean` | `false` | Jalankan browser secara visual (debug lokal). |
| `exportXlsxDirectory` | `string` | Folder harian default | Folder penyimpanan file Excel (.xlsx). |
| `proxy` | `string \| Object` | `null` | Konfigurasi proxy. |

---

## Tax & Fee Calculation (`calculateTax`)

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

## CLI Runner & Testing

### Run via CLI:

```bash
# Semua game
node compare-game.js --game all

# Game tertentu
node compare-game.js --game mobile-legends --limit 5
```

### Run Tests:

```bash
npm test
```
