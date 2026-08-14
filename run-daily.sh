#!/usr/bin/env bash

set -u
umask 077

export PATH="/usr/local/bin:/usr/bin:/bin"

APP_DIR="/home/ubuntu/price-scraper"
ENV_FILE="/home/ubuntu/.config/price-scraper/env"
ATTEMPTS="${SCRAPE_ATTEMPTS:-5}"

cd "$APP_DIR" || exit 1

set -a
source "$ENV_FILE"
set +a

mkdir -p "$APP_DIR/output" "$APP_DIR/logs"

echo "===== Mulai $(date --iso-8601=seconds) ====="

EXIT_CODE=0
for game in mobile-legends free-fire roblox; do
  echo "===== Game $game ====="
  /usr/bin/xvfb-run \
    -a \
    -s "-screen 0 1920x1080x24" \
    /usr/bin/node \
    compare-google.js \
    --game "$game" \
    --attempts "$ATTEMPTS" \
    --headed || EXIT_CODE=1
done

echo "===== Selesai $(date --iso-8601=seconds), exit $EXIT_CODE ====="

exit "$EXIT_CODE"
