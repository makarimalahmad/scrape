const GAME_CONFIGS = [
  {
    id: "mobile-legends",
    name: "Mobile Legends",
    query: "top up mlbb",
    mainStores: [
      {
        name: "UPoint",
        url: "https://upoint.id/top-up/mobile_legends",
      },
      {
        name: "DuniaGames",
        url: "https://duniagames.co.id/top-up/item/mobile-legends",
      },
    ],
    priorityStores: [
      {
        name: "itemku.com",
        url: "https://itemku.com/id/g/mobile-legends/top-up",
      },
    ],
  },
  {
    id: "free-fire",
    name: "Free Fire",
    query: "top up free fire",
    mainStores: [
      {
        name: "UPoint",
        url: "https://upoint.id/top-up/free_fire",
      },
      {
        name: "DuniaGames",
        url: "https://duniagames.co.id/top-up/item/freefire",
      },
    ],
    priorityStores: [
      {
        name: "itemku.com",
        url: "https://itemku.com/id/g/garena-free-fire/top-up",
      },
    ],
  },
  {
    id: "roblox",
    name: "Roblox",
    query: "top up roblox",
    mainStores: [
      {
        name: "UPoint",
        url: "https://upoint.id/top-up/roblox",
      },
      {
        name: "DuniaGames",
        url: "https://duniagames.co.id/top-up/item/roblox-voucher",
      },
    ],
    priorityStores: [
      {
        name: "itemku.com",
        urls: [
          "https://www.itemku.com/id/g/roblox/robux-game-card",
          "https://www.itemku.com/id/g/roblox/rbl-credits-gift-card",
        ],
      },
    ],
  },
];

const MAIN_STORE_DOMAINS = ["upoint.id", "duniagames.co.id"];

function normalizeHostname(url) {
  return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
}

function isMainStoreUrl(url) {
  const hostname = normalizeHostname(url);
  return MAIN_STORE_DOMAINS.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
  );
}

/**
 * Tabel aturan pajak PPN dan biaya bawaan untuk toko top-up di Indonesia.
 * Sangat mudah dibaca, ditambah, atau disesuaikan.
 */
const DEFAULT_TAX_RULES = [
  {
    stores: ["codashop.com"],             // Daftar toko yang menampilkan harga sebelum PPN
    taxRate: 0.11,                        // Tarif PPN 11%
    exclude: /gift[_-]?card|roblox/i,     // Pengecualian (Roblox Gift Card sudah harga nett)
  },
];

/**
 * Fungsi panah bawaan SDK untuk menghitung pajak berdasarkan DEFAULT_TAX_RULES.
 * @param {Object} context
 * @param {string} [context.hostname]
 * @param {string} [context.productName]
 * @param {number} context.rawPrice
 * @returns {number}
 */
const defaultTaxCalculator = ({ hostname = "", productName = "", rawPrice = 0 }) => {
  for (const rule of DEFAULT_TAX_RULES) {
    const isStoreMatch = rule.stores.some((store) => hostname.includes(store));
    const isExcluded = rule.exclude && rule.exclude.test(productName);

    if (isStoreMatch && !isExcluded) {
      return Math.round(rawPrice * (1 + rule.taxRate));
    }
  }

  return rawPrice;
};

module.exports = {
  GAME_CONFIGS,
  MAIN_STORE_DOMAINS,
  DEFAULT_TAX_RULES,
  defaultTaxCalculator,
  isMainStoreUrl,
  normalizeHostname,
};
