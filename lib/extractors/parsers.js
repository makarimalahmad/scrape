// Helper pembersih teks, parsing nominal harga (Rupiah), dan utilitas URL toko
function validateUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("URL harus memakai HTTP atau HTTPS.");
  }
  return url;
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

  // Bersihkan format angka harga:
  // Jika ada singkatan seperti "rb" atau "jt" (misal: "150,5 rb"), ubah koma desimal jadi titik
  let angkaFormat = angkaHargaTeks;
  if (akhiran) {
    angkaFormat = angkaFormat.replace(",", ".");
  } else {
    // Pada nominal rupiah penuh (misal: "150.000"), buang titik ribuan dan ubah koma desimal ke titik
    angkaFormat = angkaFormat.replace(/\./g, "").replace(",", ".");
  }
  const angkaDesimal = Number(angkaFormat);

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

module.exports = {
  parseBlibliOptionText,
  parseRobloxProductCard,
  validateUrl,
};
