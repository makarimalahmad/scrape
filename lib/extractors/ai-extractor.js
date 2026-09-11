require("dotenv").config({ quiet: true });

/**
 * Membersihkan dan memadatkan teks halaman web sebelum dikirim ke AI.
 * Membuang baris kosong, script/CSS, dan teks sampah non-produk untuk menghemat token (mencegah rate limit 429).
 */
function sanitizePageText(text) {
  if (!text) return "";
  const lines = String(text)
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0);

  // Saring baris yang mengandung angka atau istilah voucher/game/harga
  const relevantLines = lines.filter((line) =>
    /\d|diamond|dm|robux|pass|starlight|membership|member|voucher|gift\s*card|rp|idr|\$|beli|top\s*up/i.test(
      line,
    ),
  );

  // Jika hasil filter cukup representatif (>= 5 baris), pakai hasil filter. Jika tidak, pakai teks asli terpadat.
  const chosen = relevantLines.length >= 5 ? relevantLines : lines;
  return chosen.join("\n").slice(0, 8000);
}

/**
 * Ekstraktor Fallback Berbasis AI
 * Aktif jika ekstraksi DOM biasa gagal dan AI_API_KEY, AI_BASE_URL, AI_MODEL tersedia.
 */
async function extractWithAi(pageText, gameName = "") {
  const apiKey = process.env.AI_API_KEY;
  const rawUrl = process.env.AI_BASE_URL;
  const model = process.env.AI_MODEL;

  if (!apiKey || !rawUrl || !model) return null;

  // Normalisasi URL: jika user hanya menulis sampai '/v1' atau tanpa path, otomatis tambahkan '/chat/completions'
  const endpoint = rawUrl.endsWith("/chat/completions")
    ? rawUrl
    : `${rawUrl.replace(/\/+$/, "")}/chat/completions`;

  const cleanedText = sanitizePageText(pageText);
  if (!cleanedText) return null;

  const prompt = `Anda adalah asisten AI ekstraktor data harga game yang sangat presisi.
Tugas: Ekstrak HANYA daftar produk dan harga yang benar-benar tertulis di teks website berikut untuk game "${gameName || "Game"}".

Instruksi Wajib:
1. Ambil nama paket nominal asli persis seperti di teks (contoh: "50 Diamonds", "Weekly Diamond Pass", "800 Robux", "Roblox IDR 50.000").
2. Ambil harga jual sebenarnya persis seperti di teks (contoh: "Rp 10.000", "IDR 48.440", "Rp 142.500").
3. DILARANG KERAS MENGARANG, MEMBULATKAN, ATAU MENEBAK ANGKA YANG TIDAK ADA DI TEKS.
4. HANYA kembalikan JSON valid dengan struktur:
{
  "products": [
    { "Produk": "Nama Produk", "Harga": "Rp 00.000" }
  ]
}
5. Jangan tambahkan teks atau penjelasan apa pun selain format JSON di atas.

Teks Halaman Website:
${cleanedText}`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "Kembalikan hanya JSON object valid berisi key 'products'.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.log(`[AI Fallback] Gagal (${response.status}):`, errText);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content);
    const products = Array.isArray(parsed.products)
      ? parsed.products
      : Array.isArray(parsed)
        ? parsed
        : [];

    return products
      .filter((p) => p.Produk && p.Harga)
      .map((p) => {
        let name = String(p.Produk).trim();
        if (/roblox/i.test(gameName) && /^(?:IDR|USD|\$)\s*[\d.]+/i.test(name)) {
          name = `Roblox ${name}`;
        }
        return { Produk: name, Harga: String(p.Harga).trim() };
      });
  } catch (err) {
    console.log("[AI Fallback] Error koneksi:", err.message);
    return null;
  }
}

module.exports = {
  extractWithAi,
  sanitizePageText,
};
