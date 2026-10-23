// Deteksi dan penyelesai (solver) otomatis tantangan Cloudflare Turnstile
const CLOUDFLARE_CHALLENGE_PATTERN =
  /sorry, you have been blocked|attention required|access denied|captcha|cloudflare|performing security verification|verifies you are not a bot|malicious bots|verifikasi keamanan|verifikasi bahwa anda|just a moment|\bray id:/i;

async function findTurnstileFrame(page, timeout = 1_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const iframe of page.frames()) {
      if (iframe.url().includes("challenges.cloudflare.com")) {
        return iframe;
      }
    }
    await page.waitForTimeout(100);
  }
  return null;
}

async function pageShowsCloudflareChallenge(page) {
  const title = await page.title().catch(() => "");
  const bodyText = await page.locator("body").innerText().catch(() => "");
  let hasTurnstileFrame = false;
  for (const iframe of page.frames()) {
    if (iframe.url().includes("challenges.cloudflare.com")) {
      hasTurnstileFrame = true;
      break;
    }
  }
  return (
    CLOUDFLARE_CHALLENGE_PATTERN.test(`${title}\n${bodyText}`) ||
    hasTurnstileFrame
  );
}

async function clickTurnstileFrame(page, frame) {
  const frameElement = await frame.frameElement().catch(() => null);
  const box = await frameElement?.boundingBox().catch(() => null);

  // 1. Simulasikan pergerakan kursor mouse alami ke kotak centang di koordinat fisik
  if (box && box.width > 0 && box.height > 0) {
    const targetX = box.x + Math.min(28, box.width / 2);
    const targetY = box.y + box.height / 2;

    await page.mouse.move(targetX, targetY, { steps: 12 }).catch(() => {});
    await page.waitForTimeout(150 + Math.random() * 150);
    await page.mouse.down().catch(() => {});
    await page.waitForTimeout(75 + Math.random() * 75);
    await page.mouse.up().catch(() => {});
    return true;
  }

  // 2. Fallback: klik target elemen di dalam iframe jika bounding box tidak tersedia
  const targets = [
    frame.locator('input[type="checkbox"]'),
    frame.locator('[role="checkbox"]'),
    frame.locator(".ctp-checkbox-label"),
    frame.locator("label").filter({ hasText: /verifikasi|verify|human/i }),
  ];

  for (const target of targets) {
    const visible = await target.first().isVisible().catch(() => false);
    if (!visible) continue;
    const clicked = await target
      .first()
      .click({ delay: 90 + Math.random() * 80, timeout: 1_500 })
      .then(() => true)
      .catch(() => false);
    if (clicked) return true;
  }

  return false;
}

async function solveCloudflareChallenge(
  page,
  { timeout = 60_000, maxClicks = 4, domain = "" } = {},
) {
  const deadline = Date.now() + timeout;
  let clearSince = null;
  let clickCount = 0;
  let lastClickAt = 0;

  let targetDomain = domain;
  if (!targetDomain) {
    try {
      targetDomain = new URL(page.url()).hostname.replace(/^www\./, "");
    } catch {
      targetDomain = "";
    }
  }
  const tag = targetDomain ? `[${targetDomain}] ` : "";

  while (Date.now() < deadline) {
    if (!(await pageShowsCloudflareChallenge(page))) {
      if (clearSince === null) {
        clearSince = Date.now();
      }
      if (Date.now() - clearSince >= 1_500) {
        return { passed: true, clickCount };
      }
      await page.waitForTimeout(100);
      continue;
    }

    clearSince = null;
    if (clickCount >= maxClicks) {
      return { passed: false, clickCount, clickLimitReached: true };
    }

    // Beri jeda minimal 4.5 detik agar animasi verifikasi Cloudflare selesai memvalidasi
    const waitBeforeNextClick = 4_500 - (Date.now() - lastClickAt);
    if (waitBeforeNextClick > 0) {
      await page.waitForTimeout(Math.min(waitBeforeNextClick, 500));
      continue;
    }

    const frame = await findTurnstileFrame(
      page,
      Math.min(1_000, Math.max(100, deadline - Date.now())),
    );
    if (!frame) continue;

    if (await clickTurnstileFrame(page, frame)) {
      clickCount += 1;
      lastClickAt = Date.now();
      console.log(`${tag}Klik checkbox Cloudflare (${clickCount}/${maxClicks})...`);
    } else {
      await page.waitForTimeout(100);
    }
  }

  return { passed: false, clickCount };
}

module.exports = {
  findTurnstileFrame,
  pageShowsCloudflareChallenge,
  solveCloudflareChallenge,
};
