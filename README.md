# @makarimalahmad/price-scraper-sdk

SDK Node.js untuk komparasi harga voucher game (Mobile Legends, Free Fire, dan Roblox) berbasis pencarian Google Organik via SerpAPI. Modul ini mengotomasi pencarian toko kompetitor, normalisasi denominasi produk terhadap toko patokan (UPoint dan DuniaGames), perhitungan perbandingan selisih harga pasar, penyesuaian PPN atau biaya transaksi, serta ekspor hasil dalam format Excel (.xlsx) dan CSV.

---

## Daftar Isi

- [Fitur](#fitur)
- [Game yang Didukung](#game-yang-didukung)
- [Instalasi](#instalasi)
  - [Autentikasi GitHub Packages (.npmrc)](#autentikasi-github-packages-npmrc)
  - [Instalasi Paket](#instalasi-paket)
  - [Instalasi Dependensi Browser](#instalasi-dependensi-browser)
- [Konfigurasi Lingkungan (.env)](#konfigurasi-lingkungan-env)
- [Panduan Penggunaan](#panduan-penggunaan)
- [Referensi API](#referensi-api)
  - [compareGame(gameId, options)](#comparegamegameid-options)
  - [compareUrls(mainUrl, competitorUrl, options)](#compareurlsmainurl-competitorurl-options)
  - [scrapeUrl(url, options)](#scrapeurlurl-options)
  - [applyTaxCalculation(taxRules, payload)](#applytaxcalculationtaxrules-payload)
- [Struktur Data Return](#struktur-data-return)
- [Penyesuaian Pajak dan Biaya Toko](#penyesuaian-pajak-dan-biaya-toko)
- [Konfigurasi Proxy](#konfigurasi-proxy)
- [Status Hasil Ekstraksi](#status-hasil-ekstraksi)
- [Penggunaan Melalui CLI](#penggunaan-melalui-cli)
- [Pengujian](#pengujian)

---

## Fitur

- **Peringkat Google Organik**: Mengambil peringkat toko kompetitor langsung dari hasil pencarian Google Indonesia melalui SerpAPI.
- **Normalisasi Denominasi**: Memetakan varian nama produk (misal: "Weekly Diamond Pass", "86 Diamonds", "Robux Game Card") ke format standar agar dapat dibandingkan secara akurat.
- **Komparasi Toko Patokan**: Menghitung selisih nominal (Rp) dan persentase (%) terhadap toko patokan resmi (UPoint dan DuniaGames).
- **Penanganan Anti-Bot**: Menggunakan Playwright Extra dengan plugin stealth dan penanganan Cloudflare Turnstile.
- **Fail-Fast Resilient**: Melewati toko secara langsung apabila akses diblokir (HTTP 403) atau konfigurasi proxy mengalami kegagalan autentikasi, guna mencegah penundaan proses.
- **Ekspor Data**: Menghasilkan file Excel (.xlsx) terformat dengan penanda harga terendah dan tertinggi, serta file CSV mentah.
- **Penyesuaian Biaya Transaksi**: Mendukung kalkulasi PPN (11%) atau biaya pembayaran (QRIS) per domain toko atau per game.

---

## Game yang Didukung

| Game | ID Game (`gameId`) | Toko Patokan Utama | Denominasi yang Dinormalisasi |
| :--- | :--- | :--- | :--- |
| Mobile Legends: Bang Bang | `mobile-legends` | UPoint, DuniaGames | Diamonds, Weekly Diamond Pass, Twilight Pass |
| Free Fire | `free-fire` | UPoint, DuniaGames | Diamonds, Membership Mingguan/Bulanan |
| Roblox | `roblox` | UPoint, DuniaGames | Robux, Roblox Gift Card / Game Card (IDR & USD) |

---

## Instalasi

### Autentikasi GitHub Packages (.npmrc)

Paket ini di-hosting pada **GitHub Packages** (`npm.pkg.github.com`). 

Kebijakan GitHub mewajibkan autentikasi menggunakan **Personal Access Token (PAT)** untuk seluruh proses pengunduhan paket dari GitHub Packages, meskipun repositori publik. Tanpa token autentikasi, perintah instalasi akan mengembalikan error `401 Unauthorized`.

Buat atau tambahkan konfigurasi berikut pada file `.npmrc` di root project Anda (atau pada file global `~/.npmrc` di direktori user):

```ini
@makarimalahmad:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=GITHUB_PERSONAL_ACCESS_TOKEN
```

> **Catatan Token:** Ganti `GITHUB_PERSONAL_ACCESS_TOKEN` dengan token akun GitHub Anda yang memiliki hak akses (*permission scope*) **`read:packages`**.

### Instalasi Paket

Jalankan perintah berikut pada terminal proyek:

```bash
npm install @makarimalahmad/price-scraper-sdk
```

### Instalasi Dependensi Browser

SDK ini memerlukan Chromium yang dikelola oleh Playwright. Jalankan instalasi biner browser setelah paket terpasang:

```bash
npx playwright install chromium
```

Untuk server berbasis Linux (Ubuntu/Debian) tanpa GUI, jalankan perintah berikut untuk melengkapi pustaka sistem yang diperlukan:

```bash
npx playwright install-deps chromium
```

---

## Konfigurasi Lingkungan (.env)

Definisikan variabel lingkungan pada file `.env` di root direktori aplikasi:

```env
# Kredensial SerpAPI (Wajib untuk fungsi compareGame)
SERPAPI_KEY=kunci_serpapi_anda

# Konfigurasi LLM AI Fallback (Opsional: pemulihan otomatis jika DOM toko berubah)
AI_API_KEY=kunci_api_llm_anda
AI_BASE_URL=https://api.openai.com/v1/chat/completions
AI_MODEL=gpt-4o-mini

# Konfigurasi Proxy (Opsional: digunakan untuk toko yang memblokir IP datacenter)
PROXY_URL=http://username:password@proxy-host:port
PROXY_DOMAINS=bangjeff.com,tokogame.com

# Parameter Runtime Scraper (Opsional)
SCRAPER_CONCURRENCY=3       # Jumlah tab browser paralel (Default: 3, di VPS disarankan 2)
SCRAPER_LIMIT=10            # Jumlah kompetitor Google yang diproses (Default: 10, Maksimal: 10)
SCRAPER_MAX_ATTEMPTS=3     # Batas percobaan ulang per toko jika terjadi timeout jaringan (Default: 3)
PAGE_TIMEOUT_MS=90000       # Batas waktu muat halaman dalam milidetik (Default: 90000)
ADDITIONAL_BLACKLIST_DOMAINS=domainiklan.com,blogpribadi.id
```

---

## Panduan Penggunaan

Contoh eksekusi komparasi harga otomatis untuk game **Free Fire**:

```javascript
const { compareGame } = require("@makarimalahmad/price-scraper-sdk");

async function main() {
  const result = await compareGame("free-fire", {
    limit: 10,
    concurrency: 3,
    exportXlsxDirectory: "./output",
  });

  console.log(`Game: ${result.game}`);
  console.log(`Status Toko: ${result.successfulStoreCount}/${result.storeCount} berhasil`);
  console.log(`Lokasi File Excel: ${result.xlsxFilePath}`);

  // Menampilkan 3 produk pertama dengan harga termurah
  result.summary.slice(0, 3).forEach((item) => {
    console.log(`- ${item.product}: Termurah di ${item.cheapestStore} (Rp ${item.cheapestPrice.toLocaleString("id-ID")})`);
  });
}

main().catch(console.error);
```

---

## Referensi API

### compareGame(gameId, options)

Fungsi komparasi harga otomatis end-to-end: mengambil kompetitor dari SerpAPI, scraping paralel, normalisasi produk, perhitungan selisih, dan ekspor laporan Excel.

```javascript
const result = await compareGame(gameId, options);
```

#### Parameter:
- `gameId` (*string*, Wajib): Pilihan game yang didukung (`"mobile-legends"`, `"free-fire"`, atau `"roblox"`).
- `options` (*object*, Opsional):
  | Opsi | Tipe | Default | Keterangan |
  | :--- | :---: | :---: | :--- |
  | `apiKey` | `string` | `process.env.SERPAPI_KEY` | Kunci SerpAPI alternatif jika tidak didefinisikan pada `.env`. |
  | `limit` | `number` | `10` | Jumlah maksimal toko kompetitor Google yang diproses (1–10). |
  | `concurrency` | `number` | `3` | Jumlah browser tab yang berjalan secara paralel (1–4). |
  | `maxAttempts` | `number` | `3` | Batas perulangan jika terjadi gangguan jaringan sementara (1–5). |
  | `headed` | `boolean` | `false` | Menampilkan antarmuka visual browser jika diset `true`. |
  | `exportXlsxDirectory` | `string` | `null` | Direktori tujuan penyimpanan file laporan Excel (.xlsx). |
  | `calculateTax` | `object` | `null` | Aturan persentase pajak atau biaya transaksi per domain toko. |
  | `proxy` | `string` / `object` | `null` | URL proxy spesifik untuk request ini. |

---

### compareUrls(mainUrl, competitorUrl, options)

Membandingkan harga secara langsung antara dua alamat URL toko tanpa menggunakan kuota SerpAPI Google.

```javascript
const { compareUrls } = require("@makarimalahmad/price-scraper-sdk");

const result = await compareUrls(
  "https://upoint.id/top-up/mobile_legends",
  "https://itemku.com/id/g/mobile-legends/top-up",
  {
    game: "mobile-legends",
    exportCsvPath: "./mlbb-comparison.csv",
  }
);
```

#### Parameter:
- `mainUrl` (*string*, Wajib): URL toko patokan utama.
- `competitorUrl` (*string*, Wajib): URL toko kompetitor.
- `options` (*object*, Opsional):
  - `game` (*string*): ID game (default: `"mobile-legends"`).
  - `exportCsvPath` (*string*): Lokasi penyimpanan file CSV hasil komparasi.
  - `calculateTax` (*object*): Aturan kalkulasi biaya transaksi.

---

### scrapeUrl(url, options)

Melakukan scraping daftar produk dan harga dari satu URL toko.

```javascript
const { scrapeUrl } = require("@makarimalahmad/price-scraper-sdk");

const result = await scrapeUrl("https://upoint.id/top-up/roblox", {
  headed: false,
  exportCsvPath: "./upoint-roblox.csv",
});

if (result.success) {
  console.log(`Ditemukan ${result.count} produk:`);
  result.products.forEach((p) => {
    console.log(`- ${p.name}: ${p.price} (raw: ${p.rawPrice})`);
  });
} else {
  console.error("Scrape gagal:", result.error || result.status);
}
```

---

### applyTaxCalculation(taxRules, payload)

Fungsi utilitas murni untuk menghitung harga setelah disesuaikan dengan aturan pajak atau biaya transaksi:

```javascript
const { applyTaxCalculation } = require("@makarimalahmad/price-scraper-sdk");

const taxRules = {
  "unipin.com": 11,          // PPN 11%
  "itemku.com": "0.7%",      // Biaya QRIS 0.7%
  "codashop.com": {
    "mobile-legends": 12.11, // PPN 11% + QRIS 1.11%
    "roblox": 0,             // Tanpa penyesuaian biaya
  },
};

const finalPrice = applyTaxCalculation(taxRules, {
  rawPrice: 100000,
  domain: "unipin.com",
  game: "free-fire",
});

console.log(finalPrice); // Output: 111000
```

---

## Struktur Data Return

Format data yang dikembalikan oleh fungsi `compareGame`:

```javascript
{
  game: "Free Fire",
  gameId: "free-fire",
  generatedAt: "2026-09-17T08:00:00.000Z",
  storeCount: 12,
  successfulStoreCount: 12,

  // Metadata dan status scraping masing-masing toko
  stores: [
    {
      name: "UPoint",
      classification: "MAIN_STORE",
      position: null,
      organicPosition: null,
      url: "https://upoint.id/top-up/free_fire",
      productCount: 18,
      status: "SUCCESS",
      usedProxy: false,
      reason: null,
      confidence: 0.95
    },
    {
      name: "itemku.com",
      classification: "COMPETITOR",
      position: 1,
      organicPosition: 1,
      url: "https://itemku.com/id/g/garena-free-fire/top-up",
      productCount: 15,
      status: "SUCCESS",
      usedProxy: false,
      reason: null,
      confidence: 0.90
    }
  ],

  // Matriks komparasi produk terhadap patokan dan pasar
  comparisonTable: [
    {
      Produk: "5 Diamonds",
      UPoint: 1000,
      DuniaGames: 960,
      "itemku.com": 796,
      "codashop.com": 901,
      "Harga Terendah | UPoint": 1000,
      "Harga Terendah | UPoint Selisih": 204,
      "Harga Terendah | UPoint %": "20.4000%",
      "Harga Terendah | DuniaGames": 960,
      "Harga Terendah | DuniaGames Selisih": 164,
      "Harga Terendah | DuniaGames %": "17.0833%"
    }
  ],

  // Ringkasan toko termurah per denominasi produk
  summary: [
    {
      product: "5 Diamonds",
      cheapestStore: "itemku.com",
      cheapestPrice: 796
    }
  ],

  // Path file Excel yang dihasilkan
  xlsxFilePath: "./output/2026-09-17/comparison/free-fire/scrape-free-fire.xlsx"
}
```

---

## Penyesuaian Pajak dan Biaya Toko

Secara default, scraper mengambil harga asli mentah (*raw price*) yang tertera di website toko. Parameter `calculateTax` digunakan jika diperlukan perhitungan estimasi harga final:

```javascript
const result = await compareGame("mobile-legends", {
  calculateTax: {
    // 1. Tarif seragam per domain toko:
    "unipin.com": 11,           // PPN 11% (format angka)
    "itemku.com": "0.7%",       // Biaya QRIS (format string persentase)
    "ditusi.co.id": 12.11,      // PPN 11% + QRIS 1%

    // 2. Tarif berbeda per game dalam satu domain:
    "codashop.com": {
      "mobile-legends": 12.11,
      "free-fire": 11,
      "roblox": 0,
    },
  },
});
```

Aturan Perhitungan:
- Domain dinormalisasi secara otomatis (huruf kecil dan tanpa awalan `www.`).
- Toko patokan utama (UPoint dan DuniaGames) atau domain yang tidak didefinisikan dalam aturan tidak akan dikenakan penyesuaian biaya (menggunakan harga asli).

---

## Konfigurasi Proxy

Untuk toko dengan proteksi jaringan ketat atau pemblokiran IP datacenter, konfigurasi proxy dapat diteruskan melalui opsi `proxy`:

```javascript
// Format URL standar
const result = await compareGame("roblox", {
  proxy: "http://username:password@isp-proxy.net:10001",
});

// Format host:port:user:pass
const result = await compareGame("roblox", {
  proxy: "isp-proxy.net:10001:username:password",
});
```

---

## Status Hasil Ekstraksi

Field `status` pada tiap toko di dalam `result.stores` merepresentasikan hasil ekstraksi:

| Status | Deskripsi |
| :--- | :--- |
| `SUCCESS` | Data berhasil diekstrak melalui parser DOM HTML standar toko. |
| `SUCCESS_FALLBACK` | Data berhasil dipulihkan melalui AI LLM Fallback saat DOM HTML tidak standar atau berubah. |
| `FAILED_FALLBACK` | Gagal mengekstrak data setelah melalui parser DOM dan AI LLM Fallback. |
| `FAILED` | Gagal pada tahap koneksi browser (timeout jaringan, blokir HTTP 403, error proxy, atau proteksi Cloudflare). |

---

## Penggunaan Melalui CLI

SDK menyediakan script CLI untuk eksekusi manual atau integrasi cron job:

```bash
# Komparasi game tunggal
node compare-game.js --game mobile-legends
node compare-game.js --game free-fire
node compare-game.js --game roblox

# Komparasi seluruh game secara berurutan
node compare-game.js --game all

# Script otomasi harian VPS
./scrape-daily.sh
```

---

## Pengujian

Menjalankan seluruh rangkaian validasi sintaks dan unit test:

```bash
npm test
```

Menjalankan pengujian logika kalkulasi pajak dan normalisasi toko saja:

```bash
npm run test:tax
```
