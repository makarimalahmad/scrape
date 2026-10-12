/**
 * CSV Exporter & Validation Reporting Utility
 * Fungsi pembantu untuk menyimpan hasil scraping ke format file CSV dan JSON.
 */

const fs = require("fs");
const path = require("path");

// Membuat nama file default berdasarkan domain toko dan waktu sekarang
function createOutputName(url) {
  const domain = url.hostname
    .replace(/^www\./, "")
    .replace(/[^a-z0-9]+/gi, "-");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${domain}-${timestamp}`;
}

// Mengamankan teks sel CSV agar karakter titik koma atau petik dua tidak merusak tabel
function escapeCsv(field) {
  const teks = String(field !== undefined && field !== null ? field : "");
  // Jika teks memuat karakter khusus CSV, bungkus dengan tanda petik ganda
  if (teks.includes('"') || teks.includes(";") || teks.includes("\n") || teks.includes("\r")) {
    return `"${teks.replace(/"/g, '""')}"`;
  }
  return teks;
}

// Menyimpan array data produk ke dalam file CSV (format rapi untuk Microsoft Excel)
function exportCsv(rows, output) {
  if (!rows || rows.length === 0) return null;

  // 1. Ambil nama-nama kolom dari data baris pertama
  const semuaKunci = Object.keys(rows[0]);
  const kolomTerpilih = [];
  for (const kunci of semuaKunci) {
    // Lewati kolom internal yang diawali tanda garis bawah (_) atau kolom Values
    if (!kunci.startsWith("_") && kunci !== "Values") {
      kolomTerpilih.push(kunci);
    }
  }

  // 2. Buat baris judul kolom (header)
  const barisJudul = kolomTerpilih.map(escapeCsv).join(";");

  // 3. Susun data produk baris demi baris menggunakan perulangan biasa
  const daftarBarisData = [];
  for (const baris of rows) {
    const nilaiKolom = [];
    for (const kolom of kolomTerpilih) {
      const nilai = baris[kolom] !== undefined && baris[kolom] !== null ? baris[kolom] : "";
      nilaiKolom.push(escapeCsv(nilai));
    }
    daftarBarisData.push(nilaiKolom.join(";"));
  }

  // 4. Gabungkan baris header dan data dengan pemisah baris baru Windows (\r\n)
  // Petunjuk \uFEFF dan sep=; digunakan agar Microsoft Excel otomatis memisahkan kolom dengan benar
  const isiCsv = `\uFEFFsep=;\r\n${barisJudul}\r\n${daftarBarisData.join("\r\n")}`;

  // 5. Tulis isi teks ke dalam file fisik di folder tujuan
  const pathCsv = path.resolve(`${output}.csv`);
  fs.mkdirSync(path.dirname(pathCsv), { recursive: true });
  fs.writeFileSync(pathCsv, isiCsv, "utf8");
  return pathCsv;
}

// Menyimpan laporan JSON jika data scrape tidak memenuhi standar kualitas
function saveInvalidReport(output, url, validation, rows) {
  const pathLaporan = path.resolve(`${output}.invalid.json`);
  const dataLaporan = {
    url: url.href,
    checkedAt: new Date().toISOString(),
    validation: validation,
    sample: rows.slice(0, 10),
  };

  fs.mkdirSync(path.dirname(pathLaporan), { recursive: true });
  fs.writeFileSync(pathLaporan, JSON.stringify(dataLaporan, null, 2), "utf8");
  return pathLaporan;
}

module.exports = {
  createOutputName,
  escapeCsv,
  exportCsv,
  saveInvalidReport,
};
