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

RUN_MARKER="$(mktemp /tmp/price-scraper-run.XXXXXX)"
trap 'rm -f "$RUN_MARKER"' EXIT

echo "===== Mulai $(date --iso-8601=seconds) ====="

/usr/bin/xvfb-run \
  -a \
  -s "-screen 0 1920x1080x24" \
  /usr/bin/node \
  compare-google.js \
  --game all \
  --attempts "$ATTEMPTS" \
  --headed

EXIT_CODE=$?

LATEST_RUN="$(find "$APP_DIR/output" -mindepth 1 -maxdepth 1 -type d -newer "$RUN_MARKER" -printf '%T@ %f\n' | sort -nr | head -n 1 | cut -d' ' -f2-)"

if [[ -n "$LATEST_RUN" ]]; then
  ZIP_PATH="$APP_DIR/output/${LATEST_RUN}.zip"
  TEMP_ZIP="$APP_DIR/output/.${LATEST_RUN}.tmp.zip"
  rm -f "$TEMP_ZIP"

  if (
    cd "$APP_DIR/output" &&
    /usr/bin/zip -qr "$TEMP_ZIP" "$LATEST_RUN"
  ); then
    mv -f "$TEMP_ZIP" "$ZIP_PATH"
    echo "ZIP: $ZIP_PATH"
  else
    rm -f "$TEMP_ZIP"
    echo "Peringatan: gagal membuat ZIP untuk $LATEST_RUN" >&2
  fi
else
  echo "Peringatan: folder output run ini tidak ditemukan; ZIP tidak dibuat." >&2
fi

echo "===== Selesai $(date --iso-8601=seconds), exit $EXIT_CODE ====="

exit "$EXIT_CODE"
