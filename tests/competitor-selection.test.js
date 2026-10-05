const assert = require("assert");
const { selectGoogleCompetitors, searchGoogle } = require("../lib/google/google-search");

console.log("--------------------------------------------------");
console.log("TEST SUITE: SELEKSI KOMPETITOR MURNI ORGANIK GOOGLE");
console.log("--------------------------------------------------");

let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === "function") {
      return result
        .then(() => {
          console.log(`  ✅ PASS: ${name}`);
          testsPassed++;
        })
        .catch((err) => {
          console.error(`  ❌ FAIL: ${name}`);
          console.error(`     Error: ${err.message}`);
          testsFailed++;
        });
    }
    console.log(`  ✅ PASS: ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
    testsFailed++;
  }
}

const mockGameConfig = {
  id: "mobile-legends",
  name: "Mobile Legends",
  query: "top up mobile legends",
  mainStores: [
    { name: "UPoint", url: "https://upoint.id/top-up/mobile_legends" },
    { name: "DuniaGames", url: "https://duniagames.co.id/top-up/item/mobile-legends" },
  ],
  priorityStores: [
    { name: "itemku.com", url: "https://itemku.com/id/g/mobile-legends/top-up" },
  ],
};

async function runAllTests() {
  // 1. Priority store selalu masuk urutan pertama
  test("Priority Store: itemku.com otomatis diposisikan pertama", () => {
    const mockOrganic = [
      {
        position: 1,
        title: "Beli Diamond ML Murah - wishgm.com",
        link: "https://www.wishgm.com/id-ID/top-up/mobile-legends-bang-bang",
        snippet: "Top up diamond mobile legends termurah",
      },
    ];

    const { ranking } = selectGoogleCompetitors(mockOrganic, mockGameConfig, 5);
    assert.strictEqual(ranking.length, 2);
    assert.strictEqual(ranking[0].store, "itemku.com");
    assert.strictEqual(ranking[0].isPriority, true);
    assert.strictEqual(ranking[1].store, "wishgm.com");
    assert.strictEqual(ranking[1].position, 2);
  });

  // 2. Main Store dan non-store domain otomatis ditolak
  test("Filter Toko: main store (upoint.id) dan non-store (youtube.com) tidak masuk ranking", () => {
    const mockOrganic = [
      {
        position: 1,
        title: "UPoint Top Up ML",
        link: "https://upoint.id/top-up/mobile_legends",
        snippet: "Top up diamond mlbb resmi",
      },
      {
        position: 2,
        title: "Video Tutorial Top Up",
        link: "https://www.youtube.com/watch?v=123",
        snippet: "Tutorial top up",
      },
      {
        position: 3,
        title: "Top Up MLBB - Lapakgaming",
        link: "https://www.lapakgaming.com/id-id/mobile-legends",
        snippet: "Beli diamond mobile legends termurah",
      },
    ];

    const { ranking } = selectGoogleCompetitors(mockOrganic, mockGameConfig, 5);
    assert.strictEqual(ranking.length, 2);
    assert.strictEqual(ranking[0].store, "itemku.com");
    assert.strictEqual(ranking[1].store, "lapakgaming.com");
  });

  // 2b. Platform donasi / tipping (saweria.co, trakteer.id) otomatis ditolak
  test("Filter Toko: platform donasi (saweria.co, trakteer.id) tidak masuk ranking", () => {
    const mockOrganic = [
      {
        position: 1,
        title: "Naellyn - Toko Top Up Mobile Legends Bang Bang",
        link: "https://saweria.co/Naellyn/toko-top-up/mobile-legends-bang-bang",
        snippet: "Dukung streamer dan top up diamond",
      },
      {
        position: 2,
        title: "Trakteer Top Up Diamond MLBB",
        link: "https://trakteer.id/gamer/tip",
        snippet: "Beli diamond mobile legends",
      },
      {
        position: 3,
        title: "Top Up MLBB - Lapakgaming",
        link: "https://www.lapakgaming.com/id-id/mobile-legends",
        snippet: "Beli diamond mobile legends termurah",
      },
    ];

    const { ranking, decisions } = selectGoogleCompetitors(mockOrganic, mockGameConfig, 5);
    assert.strictEqual(ranking.length, 2);
    assert.strictEqual(ranking[0].store, "itemku.com");
    assert.strictEqual(ranking[1].store, "lapakgaming.com");
    const saweriaDecision = decisions.find((d) => d.link && d.link.includes("saweria.co"));
    assert.ok(saweriaDecision);
    assert.strictEqual(saweriaDecision.eligible, false);
    assert.ok(["non_store_domain", "editorial_page"].includes(saweriaDecision.classification));
  });

  // Helper parsing request mockFetch (mendukung format query URL maupun payload POST Serper)
  function extractSearchParams(url, init) {
    if (typeof url === "string" && url.includes("?")) {
      const parsedUrl = new URL(url);
      const start = parsedUrl.searchParams.get("start") || "0";
      return {
        q: parsedUrl.searchParams.get("q") || "",
        start,
        page: parsedUrl.searchParams.get("page") || (start === "0" ? "1" : "2"),
      };
    }
    if (init && init.body) {
      const b = typeof init.body === "string" ? JSON.parse(init.body) : init.body;
      const page = String(b.page || 1);
      const start = String((Number(page) - 1) * 10);
      return { q: b.q || "", start, page };
    }
    return { q: "", start: "0", page: "1" };
  }

  // 3. searchGoogle dengan multi-page deep pagination
  await test("searchGoogle: melakukan deep-pagination saat halaman 1 kurang toko", async () => {
    const pageCalls = [];
    const mockFetch = async (url, init) => {
      const { q, start, page } = extractSearchParams(url, init);
      pageCalls.push({ q, start, page });

      if (start === "0" || page === "1") {
        // Halaman 1 hanya menemukan 1 toko kompetitor
        return {
          ok: true,
          json: async () => ({
            organic: [
              {
                position: 1,
                title: "Wishgm Top Up ML",
                link: "https://www.wishgm.com/id-ID/top-up/mobile-legends-bang-bang",
                snippet: "Beli diamond mlbb termurah",
              },
            ],
          }),
        };
      } else if (start === "10" || page === "2") {
        // Halaman 2 menemukan toko-toko lain di posisi organik 11 dan 12
        return {
          ok: true,
          json: async () => ({
            organic: [
              {
                position: 11,
                title: "Top Up MLBB - Lapakgaming",
                link: "https://www.lapakgaming.com/id-id/mobile-legends",
                snippet: "Top up diamond mobile legends resmi",
              },
              {
                position: 12,
                title: "Codashop Mobile Legends",
                link: "https://www.codashop.com/id-id/mobile-legends",
                snippet: "Beli diamond ml termurah",
              },
            ],
          }),
        };
      }
      return { ok: true, json: async () => ({ organic: [] }) };
    };

    const { ranking } = await searchGoogle("fake-api-key", mockGameConfig, 4, mockFetch);

    // Harus memanggil halaman start=0 dan start=10 secara bertahap
    assert.ok(pageCalls.some((c) => c.start === "0" || c.page === "1"));
    assert.ok(pageCalls.some((c) => c.start === "10" || c.page === "2"));
    // Hasil akumulasi toko harus memuat itemku + wishgm + lapakgaming + codashop
    assert.strictEqual(ranking.length, 4);
    assert.ok(ranking.some((r) => r.store === "itemku.com"));
    assert.ok(ranking.some((r) => r.store === "wishgm.com"));
    assert.ok(ranking.some((r) => r.store === "lapakgaming.com"));
    assert.ok(ranking.some((r) => r.store === "codashop.com"));
    // Setiap toko organik memiliki posisi organik asli dari Google
    const wishgm = ranking.find((r) => r.store === "wishgm.com");
    assert.strictEqual(wishgm.organicPosition, 1);
    const lapak = ranking.find((r) => r.store === "lapakgaming.com");
    assert.strictEqual(lapak.organicPosition, 11);
  });

  // 4. searchGoogle dengan multi-query expansion organik
  await test("searchGoogle: mencoba query komersial alternatif jika query utama habis", async () => {
    const queriesCalled = [];
    const mockFetch = async (url, init) => {
      const { q, start, page } = extractSearchParams(url, init);
      queriesCalled.push({ q, start, page });

      if (q === "top up diamond mlbb resmi") {
        // Query pertama hanya menghasilkan 1 toko di halaman 1 dan kosong di halaman 2-4
        if (start === "0" || page === "1") {
          return {
            ok: true,
            json: async () => ({
              organic: [
                {
                  position: 6,
                  title: "Wishgm Top Up ML",
                  link: "https://www.wishgm.com/id-ID/top-up/mobile-legends-bang-bang",
                  snippet: "Top up diamond mlbb termurah",
                },
              ],
            }),
          };
        }
        return { ok: true, json: async () => ({ organic: [] }) };
      } else if (q === "top up mlbb murah" || q === "top up mobile legends") {
        // Query kedua menghasilkan toko-toko organik baru
        if (start === "0" || page === "1") {
          return {
            ok: true,
            json: async () => ({
              organic: [
                {
                  position: 2,
                  title: "Codashop Mobile Legends",
                  link: "https://www.codashop.com/id-id/mobile-legends",
                  snippet: "Top up mlbb murah",
                },
                {
                  position: 3,
                  title: "UniPin Mobile Legends",
                  link: "https://www.unipin.com/id/mobile-legends",
                  snippet: "Top up diamond unipin",
                },
              ],
            }),
          };
        }
        return { ok: true, json: async () => ({ organic: [] }) };
      }
      return { ok: true, json: async () => ({ organic: [] }) };
    };

    const { ranking } = await searchGoogle("fake-api-key", mockGameConfig, 4, mockFetch);

    // Harus mencoba query alternatif saat query pertama kekurangan toko
    assert.ok(queriesCalled.some((c) => c.q === "top up diamond mlbb resmi"));
    assert.ok(queriesCalled.some((c) => c.q === "top up mlbb murah" || c.q === "top up mobile legends"));
    // Hasil gabungan unik mencakup itemku + wishgm + codashop + unipin
    assert.strictEqual(ranking.length, 4);
    assert.ok(ranking.some((r) => r.store === "itemku.com"));
    assert.ok(ranking.some((r) => r.store === "wishgm.com"));
    assert.ok(ranking.some((r) => r.store === "codashop.com"));
    assert.ok(ranking.some((r) => r.store === "unipin.com"));
  });

  // 5. Verifikasi integritas: 100% data murni organik tanpa fallback toko hardcode
  await test("Integritas Organik: tidak ada toko buatan atau fallback hardcode", async () => {
    const mockFetch = async () => ({
      ok: true,
      json: async () => ({
        organic: [
          {
            position: 6,
            title: "Wishgm Top Up ML",
            link: "https://www.wishgm.com/id-ID/top-up/mobile-legends-bang-bang",
            snippet: "Beli diamond mlbb termurah",
          },
        ],
      }),
    });

    const { ranking } = await searchGoogle(
      "fake-api-key",
      mockGameConfig,
      10,
      mockFetch
    );

    // Tanpa hardcode, jika Google hanya menghasilkan wishgm, maka hanya wishgm + priority store yang diambil
    assert.strictEqual(ranking.length, 2);
    assert.strictEqual(ranking[0].store, "itemku.com");
    assert.strictEqual(ranking[1].store, "wishgm.com");
    assert.strictEqual(ranking[1].organicPosition, 6);
    // Tidak ada toko fallback
    assert.strictEqual(ranking.some((r) => r.isFallback), false);
  });

  console.log("--------------------------------------------------");
  console.log(`HASIL: ${testsPassed} Lolos, ${testsFailed} Gagal`);
  console.log("--------------------------------------------------");

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runAllTests();
