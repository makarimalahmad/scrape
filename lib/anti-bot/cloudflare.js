/**
 * Cloudflare Turnstile & Challenge Solver Module
 */

const CLOUDFLARE_CHALLENGE_PATTERN =
  /sorry, you have been blocked|attention required|access denied|captcha|cloudflare ray id|melakukan verifikasi keamanan|verifikasi bahwa anda|just a moment/i;

async function findTurnstileFrame(page, timeout = 1_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const frame = page
      .frames()
      .find((candidate) =>
        candidate.url().includes("challenges.cloudflare.com"),
      );
    if (frame) return frame;
    await page.waitForTimeout(100);
  }
  return null;
}

async function pageShowsCloudflareChallenge(page) {
  const title = await page.title().catch(() => "");
  const bodyText = await page.locator("body").innerText().catch(() => "");
  const hasTurnstileFrame = page
    .frames()
    .some((candidate) => candidate.url().includes("challenges.cloudflare.com"));
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
  { timeout = 120_000, maxClicks = Number.POSITIVE_INFINITY } = {},
) {
  const deadline = Date.now() + timeout;
  let clearSince = null;
  let clickCount = 0;
  let lastClickAt = 0;

  while (Date.now() < deadline) {
    if (!(await pageShowsCloudflareChallenge(page))) {
      clearSince ??= Date.now();
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
      console.log(`Klik checkbox Cloudflare (${clickCount})...`);
    } else {
      await page.waitForTimeout(100);
    }
  }

  return { passed: false, clickCount };
}

module.exports = {
  CLOUDFLARE_CHALLENGE_PATTERN,
  clickTurnstileFrame,
  findTurnstileFrame,
  pageShowsCloudflareChallenge,
  solveCloudflareChallenge,
};
