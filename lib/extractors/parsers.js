// Helper pembersih teks, parsing nominal harga (Rupiah), dan utilitas URL toko
function validateUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("URL harus memakai HTTP atau HTTPS.");
  }
  return url;
}

// Menstandarkan URL katalog Tokopedia ke halaman voucher resmi
function normalizeTokopediaUrl(value, gameId = null) {
  const url = value instanceof URL ? new URL(value.href) : validateUrl(value);
  const hostname = url.hostname.replace(/^www\./, "").toLowerCase();
  if (hostname !== "tokopedia.com") return url;

  // Daftar slug resmi Tokopedia untuk setiap game
  const slugResmi = {
    "mobile-legends": "mobile-legends-bang-bang",
    "free-fire": "free-fire",
    roblox: "roblox",
  };

  let slug = slugResmi[gameId];
  if (!slug) {
    const rute = decodeURIComponent(url.pathname).toLowerCase();
    if (/mobile[-_ ]?legends|\bmlbb\b/.test(rute)) {
      slug = slugResmi["mobile-legends"];
    } else if (/free[-_ ]?fire|\bff\b/.test(rute)) {
      slug = slugResmi["free-fire"];
    } else if (/roblox|robux/.test(rute)) {
      slug = slugResmi.roblox;
    }
  }

  if (!slug) return url;
  return new URL(`https://www.tokopedia.com/digital/voucher-game/${slug}`);
}

// Menstandarkan URL Funnerlife ke katalog Mobile Legends resmi
function normalizeFunnerlifeUrl(value, gameId = null) {
  const url = value instanceof URL ? new URL(value.href) : validateUrl(value);
  const hostname = url.hostname.replace(/^www\./, "").toLowerCase();
  if (hostname !== "funnerlife.id") return url;

  if ((gameId === "mobile-legends" || !gameId) && url.pathname.includes("/beli/mlbb")) {
    return new URL("https://funnerlife.id/id/beli/mobile-legend");
  }
  return url;
}

// Mem-parsing teks kartu UPoint (contoh: "53 Diamonds from 12.000")
function parseUPointCardText(text) {
  if (!text) return null;
  const teksBersih = String(text).replace(/\s+/g, " ").trim();

  // Format kartu UPoint memuat kata ' from '
  if (!teksBersih.toLowerCase().includes(" from ")) {
    return null;
  }

  const bagian = teksBersih.split(/ from /i);
  const nama = bagian[0].trim();
  const harga = bagian[1]?.trim() || "";

  // Pastikan nama ada dan harga berupa angka positif
  const angkaSaja = harga.replace(/\./g, "");
  if (!nama || !angkaSaja || isNaN(Number(angkaSaja)) || Number(angkaSaja) <= 0) {
    return null;
  }

  return {
    Produk: nama,
    Harga: `Rp ${harga}`,
  };
}

// Mem-parsing teks kartu DuniaGames (mengambil nama produk dan angka harga)
function parseDuniaGamesCardText(text, productName, priceText = null) {
  const teksBersih = String(text || "").replace(/\s+/g, " ").trim();
  const nama = String(productName || "").replace(/\s+/g, " ").trim();
  const hargaKhusus = String(priceText || "").replace(/\s+/g, " ").trim();

  // Cari nominal harga dari parameter khusus atau dari teks kartu
  let harga = "";
  if (/^\d{1,3}(?:\.\d{3})*$/.test(hargaKhusus)) {
    harga = hargaKhusus;
  } else {
    const daftarAngka = teksBersih.match(/\b\d{1,3}(?:\.\d{3})*\b/g) || [];
    harga = daftarAngka.length > 0 ? daftarAngka[daftarAngka.length - 1] : "";
  }

  const angkaSaja = harga.replace(/\./g, "");
  if (!nama || !angkaSaja || isNaN(Number(angkaSaja)) || Number(angkaSaja) <= 0) {
    return null;
  }

  return {
    Produk: nama,
    Harga: `Rp ${harga}`,
  };
}

// Mem-parsing teks kartu UniPin (format: "[Produk] IDR [Harga]")
function parseUniPinCardText(text) {
  if (!text) return null;
  const teksBersih = String(text).replace(/\s+/g, " ").trim();

  const kecocokanHarga = teksBersih.match(/\bIDR\s*(\d[\d.]*)\b/i);
  if (!kecocokanHarga) return null;

  const nominalHarga = kecocokanHarga[1];
  const angkaSaja = nominalHarga.replace(/\./g, "");
  if (!angkaSaja || Number(angkaSaja) <= 0) return null;

  // Nama produk berada di teks sebelum tulisan IDR
  const namaProduk = teksBersih.slice(0, kecocokanHarga.index).trim();
  if (!namaProduk || namaProduk.toLowerCase() === "total") return null;

  return {
    Produk: namaProduk,
    Harga: `IDR ${nominalHarga}`,
  };
}

// Menstandarkan nama produk MobaPay khusus Mobile Legends
function normalizeMobapayProductName(name, pathname) {
  const produk = String(name || "").replace(/\s+/g, " ").trim();
  if (!/\/mlbb(?:\/|$)/i.test(pathname)) return produk;

  // Jika nama hanya berupa angka (misal "86"), tambahkan label "Diamonds"
  if (/^\d[\d.,]*(?:\s*\+\s*\d[\d.,]*)?$/.test(produk)) {
    return `${produk} Diamonds`;
  }
  return produk;
}

// Mem-parsing opsi dropdown Blibli (format: "[Produk] Rp [Harga]")
function parseBlibliOptionText(text) {
  if (!text) return null;
  const teksBersih = String(text).replace(/\s+/g, " ").trim();

  const kecocokanHarga = teksBersih.match(/Rp\s*\d[\d.]*/i);
  if (!kecocokanHarga) return null;

  const hargaTeks = kecocokanHarga[0];
  const angkaSaja = hargaTeks.replace(/[^\d]/g, "");
  if (!angkaSaja || Number(angkaSaja) <= 0) return null;

  const namaProduk = teksBersih.slice(0, kecocokanHarga.index).trim();
  if (!namaProduk) return null;

  return {
    Produk: namaProduk,
    Harga: hargaTeks,
  };
}

// Mem-parsing kartu produk Roblox (jumlah Robux dan nominal harga)
function parseRobloxProductCard(text) {
  if (!text) return null;
  const teksBersih = String(text).replace(/\s+/g, " ").trim();

  // 1. Ambil angka jumlah Robux (angka di awal teks)
  const kecocokanJumlah = teksBersih.match(/^([\d.,]+)/);
  // 2. Ambil harga (misal: "Rp 150.000" atau "Rp 150 rb")
  const kecocokanHarga = teksBersih.match(/(?:Rp\.?|IDR)\s*([\d.,]+)\s*(rb|ribu|jt|juta)?/i);

  if (!kecocokanJumlah || !kecocokanHarga) return null;

  const jumlahRobux = Number(kecocokanJumlah[1].replace(/[.,]/g, ""));
  const angkaHargaTeks = kecocokanHarga[1];
  const akhiran = (kecocokanHarga[2] || "").toLowerCase();

  // Bersihkan format titik ribuan dan ubah koma desimal ke titik
  const angkaDesimal = Number(angkaHargaTeks.replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", "."));

  // Tentukan pengali jika harga ditulis dalam singkatan (rb / jt)
  let pengali = 1;
  if (akhiran === "rb" || akhiran === "ribu") {
    pengali = 1000;
  } else if (akhiran === "jt" || akhiran === "juta") {
    pengali = 1000000;
  }

  const hargaFinal = Math.round(angkaDesimal * pengali);

  if (!jumlahRobux || jumlahRobux <= 0 || !hargaFinal || hargaFinal <= 0) {
    return null;
  }

  return {
    Produk: `${jumlahRobux} Robux`,
    Harga: `Rp ${hargaFinal.toLocaleString("id-ID")}`,
  };
}

// Mem-parsing daftar produk Ditusi dari teks halaman
function parseDitusiProductRows(bodyText) {
  if (!bodyText) return [];

  // 1. Cari penanda awal daftar produk di Ditusi
  const penanda = Array.from(
    bodyText.matchAll(/Pilih Item Top Up (?:Free Fire|Voucher\s*Roblox\s*\/\s*Robux|Roblox\s*-\s*Login)/gi)
  );
  const penandaTerakhir = penanda.length > 0 ? penanda[penanda.length - 1] : null;
  if (!penandaTerakhir) return [];

  // 2. Ambil teks setelah penanda
  const teksBagian = bodyText.slice(penandaTerakhir.index + penandaTerakhir[0].length);
  const barisMentah = teksBagian.split(/\r?\n/);
  const daftarBaris = [];
  for (const b of barisMentah) {
    const t = b.trim();
    if (t) daftarBaris.push(t);
  }

  const polaProduk = /^(?:Roblox\s+Gift\s+card\s+IDR\s+\d+K|ROBLOX\d+K\d?|\d[\d.]*\s+(?:Diamonds?|Robux)(?:\s+USN)?(?:\s*\+\s*\(Bonus\s+\d[\d.]*\))?)$/i;
  const hasilProduk = [];

  // 3. Cari pasangan nama produk dan harga
  for (let i = 0; i < daftarBaris.length; i += 1) {
    const barisSaatIni = daftarBaris[i];
    if (!polaProduk.test(barisSaatIni)) continue;

    const daftarHarga = [];
    for (let j = i + 1; j < daftarBaris.length; j += 1) {
      const barisBerikutnya = daftarBaris[j];
      if (polaProduk.test(barisBerikutnya)) break;
      if (/^RM\b/i.test(barisBerikutnya)) break;
      if (/^Rp\.?\s*[\d.]+$/i.test(barisBerikutnya)) {
        daftarHarga.push(barisBerikutnya);
      }
    }

    if (daftarHarga.length > 0) {
      const hargaTerpilih = daftarHarga[daftarHarga.length - 1];
      hasilProduk.push({
        Produk: barisSaatIni,
        Harga: hargaTerpilih,
      });
    }
  }

  return hasilProduk;
}

module.exports = {
  normalizeFunnerlifeUrl,
  normalizeMobapayProductName,
  normalizeTokopediaUrl,
  parseBlibliOptionText,
  parseDitusiProductRows,
  parseDuniaGamesCardText,
  parseRobloxProductCard,
  parseUniPinCardText,
  parseUPointCardText,
  validateUrl,
};
