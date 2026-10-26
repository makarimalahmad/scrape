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

// Aturan normalisasi URL katalog toko (canonical URL)
const GAME_SLUGS = {
  "mobile-legends": "mobile-legends-bang-bang",
  "free-fire": "free-fire",
  roblox: "roblox",
};

function getGameSlug(url, gameConfig) {
  if (gameConfig?.id && GAME_SLUGS[gameConfig.id]) {
    return GAME_SLUGS[gameConfig.id];
  }
  const text = decodeURIComponent(url.pathname + url.search).toLowerCase();
  if (/mobile[-_ ]?legends|\bmlbb\b/.test(text)) return GAME_SLUGS["mobile-legends"];
  if (/free[-_ ]?fire/.test(text)) return GAME_SLUGS["free-fire"];
  if (/roblox|robux/.test(text)) return GAME_SLUGS.roblox;
  return null;
}

const STORE_CANONICAL_RULES = [
  {
    domain: "seagm.com",
    game: "mobile-legends",
    match: "mobile-legends-diamonds-top-up",
    target: "/id-id/mlbb-diamonds-top-up-id",
  },
  {
    domain: "casatopup.com",
    game: "mobile-legends",
    match: (pathname) => pathname.includes("mobile-legends") || pathname.includes("mlbb"),
    target: "/id/beli/mobile-legends",
  },
  {
    domain: "funnerlife.id",
    game: "mobile-legends",
    match: "/beli/mlbb",
    target: "/id/beli/mobile-legend",
  },
  {
    domain: "lapakgaming.com",
    game: "roblox",
    match: "roblox",
    target: "/id-id/roblox",
  },
  {
    domain: "golrox.com",
    game: "roblox",
    match: (pathname) =>
      (pathname.startsWith("/beli-robux") || pathname === "/" || pathname.includes("roblox")) &&
      !pathname.includes("/username"),
    target: "/beli-robux/username",
  },
  {
    domain: "hiddengame.id",
    game: "roblox",
    match: (pathname) => pathname.includes("roblox") && !pathname.includes("giftcard"),
    target: "/games/roblox-giftcard",
  },
  {
    domain: "ditusi.co.id",
    game: "roblox",
    match: (pathname) => (pathname.includes("roblox") || pathname.includes("robux")) && !pathname.includes("voucher-roblox"),
    target: "/voucher-roblox-robux",
  },
  {
    domain: "tokopedia.com",
    apply: (url, gameConfig) => {
      const slug = getGameSlug(url, gameConfig);
      return slug ? new URL(`https://www.tokopedia.com/digital/voucher-game/${slug}`) : url;
    },
  },
  {
    domain: "gopay.co.id",
    apply: (url, gameConfig) => {
      const path = url.pathname.replace(/\/+$/, "").toLowerCase();
      if (path === "/games" || path === "" || path.includes("free-fire-max")) {
        const slug = getGameSlug(url, gameConfig);
        if (slug) url.pathname = `/games/${slug}`;
      }
      return url;
    },
  },
  {
    domain: "bangjeff.com",
    apply: (url) => {
      const parts = url.pathname.split("/").filter(Boolean);
      const first = parts[0]?.toLowerCase();
      const isLocale = ["en", "th", "my"].includes(first) || /^[a-z]{2}(?:-[a-z]{2})?$/i.test(first);
      if (first && isLocale) {
        parts.shift();
        url.pathname = "/" + parts.join("/");
      }
      return url;
    },
  },
  {
    domain: "lootbar.com",
    game: "free-fire",
    apply: (url) => {
      if (url.pathname.includes("free-fire") && !url.searchParams.has("region")) {
        url.searchParams.set("region", "ff_id");
      }
      return url;
    },
  },
  {
    domain: ["gogogo.com", "gogogo.id"],
    game: "free-fire",
    apply: (url) => {
      if (url.pathname.includes("free-fire")) {
        if (url.pathname.includes("free-fire-max")) {
          url.pathname = url.pathname.replace("free-fire-max", "free-fire");
        }
        if (!url.pathname.includes("free-fire-games")) {
          url.pathname = url.pathname.replace("free-fire", "free-fire-games");
        }
      }
      return url;
    },
  },
];

function normalizeHostname(url) {
  return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
}

// Normalisasi URL toko: Mengarahkan varian URL Google ke katalog resmi utama
function normalizeStoreUrl(value, gameConfig = null) {
  const url = value instanceof URL ? new URL(value.href) : new URL(value);
  const hostname = normalizeHostname(url);
  const gameId = gameConfig?.id;

  for (const rule of STORE_CANONICAL_RULES) {
    const isDomainMatch = Array.isArray(rule.domain)
      ? rule.domain.includes(hostname)
      : rule.domain === hostname;

    if (!isDomainMatch) continue;
    if (rule.game && gameId && rule.game !== gameId) continue;

    if (rule.target) {
      const isMatch = typeof rule.match === "function"
        ? rule.match(url.pathname)
        : url.pathname.includes(rule.match);

      if (isMatch) {
        url.pathname = rule.target;
        return url;
      }
    }

    if (rule.apply) {
      return rule.apply(url, gameConfig);
    }
  }

  return url;
}

// Periksa apakah URL berasal dari toko utama (UPoint atau DuniaGames)
function isMainStoreUrl(url) {
  const hostname = normalizeHostname(url);
  for (const domain of MAIN_STORE_DOMAINS) {
    if (hostname === domain || hostname.endsWith(`.${domain}`)) {
      return true;
    }
  }
  return false;
}

module.exports = {
  GAME_CONFIGS,
  MAIN_STORE_DOMAINS,
  isMainStoreUrl,
  normalizeHostname,
  normalizeStoreUrl,
};
