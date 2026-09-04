require("dotenv").config({ quiet: true });

/**
 * Ekstraktor Fallback Berbasis AI (Groq LLM)
 * Hanya aktif jika ekstraksi DOM biasa gagal dan GROQ_API_KEY tersedia.
 */
async function extractWithGroq(pageText, gameName = "") {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

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
${pageText.slice(0, 15000)}`;

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        messages: [
          { role: "system", content: "Kembalikan hanya JSON object valid berisi key 'products'." },
          { role: "user", content: prompt },
        ],
        temperature: 0,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.log(`[Groq AI] Gagal (${response.status}):`, errText);
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
    console.log("[Groq AI] Error koneksi:", err.message);
    return null;
  }
}

module.exports = { extractWithGroq };
