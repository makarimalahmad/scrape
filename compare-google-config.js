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

module.exports = {
  GAME_CONFIGS,
  MAIN_STORE_DOMAINS,
  isMainStoreUrl,
  normalizeHostname,
};
