# Project Instructions

## Purpose

Node.js price scraper for Mobile Legends, Free Fire, and Roblox. It finds top organic Google competitors through SerpAPI, scrapes product prices, validates results, and exports raw scrape and comparison CSV files.

## Main Files

- `scrape.js`: browser lifecycle, site extractors, Cloudflare handling, validation entrypoint, and CSV export.
- `compare-google.js`: SerpAPI ranking, competitor filtering, retries, concurrency, raw scrape export, comparisons, and summaries.
- `compare-google-config.js`: supported games and main-store URLs.
- `product-matcher.js`: product normalization and price matching.
- `validate-results.js`: scrape quality checks and confidence scoring.
- `playwright.js`: shared Playwright Extra Chromium instance with stealth plugin.
- `run-daily.sh`: VPS daily runner.

## Required Checks

After implementation changes, always run:

```bash
npm test
```

For browser-related changes, also run a Chromium smoke test. For site-specific extractors, verify the affected live URL when practical without wasting SerpAPI quota.

Keep regression tests. Do not delete `compare-google.test.js` or `validate-results.test.js` merely to simplify the repository.

## Output Rules

Each `compare-google.js` run must use a new directory:

```text
output/YYYY-MM-DD/
output/YYYY-MM-DD(2)/
output/YYYY-MM-DD(3)/
```

Each run directory contains:

```text
comparison/<game>/
scrapes/<game>/
```

Never overwrite a previous run directory. Do not commit generated output, CSV files, logs, invalid reports, browser profiles, or dependencies.

## Scraping Rules

- Preserve true organic Google positions from SerpAPI.
- Exclude social, video, editorial, news, forum, and unrelated pages before scraping.
- Main stores are UPoint and DuniaGames.
- Reuse each successful scrape for raw output and comparisons; never request the same page twice only for export.
- Validate extracted rows for the selected game.
- Retry transient network, empty-data, and retryable validation failures according to configured attempts.
- Keep generic extraction fallback for unknown stores, but add focused extractors when a site uses dropdowns, tabs, APIs, or unusual DOM.
- Tokopedia legacy URLs must map to canonical game pages and all product tabs must be collected.
- Blibli product options must be collected from its hydrated product dropdown.
- Mobapay numeric MLBB packages must be normalized as Diamonds.
- Cloudflare handling may click Turnstile frames for up to two minutes. If challenge persists, record failure and continue other stores.
- Never claim support for every website; DOM and anti-bot systems can change.

## Production And VPS

- Cron target: daily at 08:00 Asia/Jakarta.
- VPS repository: `/home/ubuntu/price-scraper`.
- VPS secrets: `/home/ubuntu/.config/price-scraper/env`.
- Never place `SERPAPI_KEY` or other secrets in source, Git, output, or logs.
- Do not update, restart, or modify VPS automatically. Push GitHub only when explicitly requested. Provide VPS pull commands for the user to run manually.
- Do not modify the VPS-specific `run-daily.sh`, cron configuration, `.cron.lock`, or `cron.log` unless explicitly requested.

## Git Rules

- Never commit or push unless explicitly requested.
- Before commit, inspect status, diff, recent log, and secrets; stage only intended source and tests.
- Keep unrelated local or VPS changes intact.
