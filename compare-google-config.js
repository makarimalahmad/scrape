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
 * Default built-in tax calculator arrow function for standard Indonesian top-up stores.
 * Applies 11% PPN to stores displaying pre-tax catalog prices (e.g. Codashop direct game top-up).
 * @param {Object} context
 * @param {string} [context.hostname]
 * @param {string} [context.productName]
 * @param {number} context.rawPrice
 * @returns {number}
 */
const defaultTaxCalculator = ({ hostname = "", productName = "", rawPrice = 0 }) => {
  const isPreTaxStore = hostname.includes("codashop.com");
  const isExcluded = /gift[_-]?card|roblox/i.test(productName || "");
  if (isPreTaxStore && !isExcluded) {
    return Math.round(rawPrice * 1.11);
  }
  return rawPrice;
};

module.exports = {
  GAME_CONFIGS,
  MAIN_STORE_DOMAINS,
  defaultTaxCalculator,
  isMainStoreUrl,
  normalizeHostname,
};
