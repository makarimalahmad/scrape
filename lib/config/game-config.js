const GAME_CONFIGS = [
  {
    id: "mobile-legends",
    name: "Mobile Legends",
    query: "top up mobile legends",
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
    query: "top up ff",
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

/**
 * Kamus Aturan Kanonikal URL Toko (Declarative Canonical Rules).
 * Menstandarkan URL dari ranking organik Google yang merujuk ke sub-varian/halaman artikel
 * agar diarahkan ke katalog produk resmi masing-masing toko secara dinamis.
 */
const STORE_CANONICAL_RULES = [
  {
    hosts: ["golrox.com"],
    gameId: "roblox",
    match: (url) =>
      (url.pathname.startsWith("/beli-robux") || url.pathname === "/" || url.pathname.includes("roblox")) &&
      !url.pathname.includes("/username"),
    apply: (url) => {
      url.pathname = "/beli-robux/username";
      return url;
    },
  },
  {
    hosts: ["casatopup.com"],
    gameId: "mobile-legends",
    match: (url) => url.pathname.includes("mobile-legends") || url.pathname.includes("mlbb"),
    apply: (url) => {
      url.pathname = "/id/beli/mobile-legends";
      return url;
    },
  },
  {
    hosts: ["hiddengame.id"],
    gameId: "roblox",
    match: (url) =>
      (url.pathname.startsWith("/games/roblox") || url.pathname.includes("roblox")) &&
      !url.pathname.includes("giftcard"),
    apply: (url) => {
      url.pathname = "/games/roblox-giftcard";
      return url;
    },
  },
  {
    hosts: ["ditusi.co.id"],
    gameId: "roblox",
    match: (url) =>
      (url.pathname.includes("roblox") || url.pathname.includes("robux")) &&
      !url.pathname.includes("voucher-roblox"),
    apply: (url) => {
      url.pathname = "/voucher-roblox-robux";
      return url;
    },
  },
  {
    hosts: ["lootbar.com"],
    gameId: "free-fire",
    match: (url) => url.pathname.includes("free-fire") && !url.searchParams.has("region"),
    apply: (url) => {
      url.searchParams.set("region", "ff_id");
      return url;
    },
  },
  {
    hosts: ["bangjeff.com"],
    gameId: null,
    match: (url) => /^\/(?:en-[a-z]{2}|[a-z]{2}-[a-z]{2}|en|th|my)(?=\/|$)/i.test(url.pathname),
    apply: (url) => {
      const cleaned = url.pathname.replace(/^\/(?:en-[a-z]{2}|[a-z]{2}-[a-z]{2}|en|th|my)(?=\/|$)/i, "");
      url.pathname = cleaned || "/";
      return url;
    },
  },
  {
    hosts: ["lapakgaming.com"],
    gameId: "roblox",
    match: (url) => url.pathname.includes("roblox"),
    apply: (url) => {
      url.pathname = "/id-id/roblox";
      return url;
    },
  },
  {
    hosts: ["funnerlife.id"],
    gameId: "mobile-legends",
    match: (url) => url.pathname.includes("/beli/mlbb"),
    apply: (url) => {
      url.pathname = "/id/beli/mobile-legend";
      return url;
    },
  },
  {
    hosts: ["gogogo.com", "gogogo.id"],
    gameId: "free-fire",
    match: (url) => url.pathname.includes("free-fire"),
    apply: (url) => {
      if (url.pathname.includes("free-fire-max")) {
        url.pathname = url.pathname.replace("free-fire-max", "free-fire");
      }
      if (!url.pathname.includes("free-fire-games")) {
        url.pathname = url.pathname.replace("free-fire", "free-fire-games");
      }
      return url;
    },
  },
  {
    hosts: ["tokopedia.com"],
    gameId: null,
    match: () => true,
    apply: (url, gameConfig) => {
      const gameSlugs = {
        "mobile-legends": "mobile-legends-bang-bang",
        "free-fire": "free-fire",
        roblox: "roblox",
      };
      let slug = gameSlugs[gameConfig?.id];
      if (!slug) {
        const pathText = decodeURIComponent(url.pathname).toLowerCase();
        if (/mobile[-_ ]?legends|\bmlbb\b/.test(pathText)) {
          slug = gameSlugs["mobile-legends"];
        } else if (/free[-_ ]?fire/.test(pathText)) {
          slug = gameSlugs["free-fire"];
        } else if (/roblox|robux/.test(pathText)) {
          slug = gameSlugs.roblox;
        }
      }
      if (!slug) return url;
      return new URL(`https://www.tokopedia.com/digital/voucher-game/${slug}`);
    },
  },
];

function normalizeHostname(url) {
  return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
}

function normalizeStoreUrl(value, gameConfig = null) {
  const url = value instanceof URL ? new URL(value.href) : new URL(value);
  const hostname = normalizeHostname(url);

  for (const rule of STORE_CANONICAL_RULES) {
    if (!rule.hosts.includes(hostname)) continue;
    if (rule.gameId && gameConfig?.id && rule.gameId !== gameConfig.id) continue;

    if (rule.match(url)) {
      return rule.apply(url, gameConfig);
    }
  }

  return url;
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
  STORE_CANONICAL_RULES,
  isMainStoreUrl,
  normalizeHostname,
  normalizeStoreUrl,
};
