// Dev-only: screenshot the trial-expired wall + trial countdown chip.
// Prereqs: backend on :8000 (with demo_wall.db seeded via seed_demo_wall.py),
// frontend dev on :3000, playwright installed.
// Usage: node scripts/shot-wall.js
// Output: D:\Crypto_killer\screenshots\entitlement\
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const OUT = path.resolve(__dirname, "..", "..", "screenshots", "entitlement");
fs.mkdirSync(OUT, { recursive: true });

async function loginState(uid) {
  const res = await fetch("http://localhost:8000/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uid, password: "secret123" })
  });
  if (!res.ok) throw new Error(`login ${uid} failed: ${res.status}`);
  const { token } = await res.json();
  return {
    cookies: [],
    origins: [
      {
        origin: "http://localhost:3000",
        localStorage: [
          { name: "yqby.token", value: token },
          { name: "yqby.session", value: uid }
        ]
      }
    ]
  };
}

async function shoot(browser, storageState, viewport, url, file, scale) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: scale, storageState });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, file) });
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  const expiredState = await loginState("demo_expired");
  const trialState = await loginState("demo_trial");

  // 過期帳號：打馬擋板（桌機 + 手機）
  await shoot(browser, expiredState, { width: 1600, height: 1000 }, "http://localhost:3000/", "01-wall-desktop.png", 1.5);
  await shoot(browser, expiredState, { width: 390, height: 844 }, "http://localhost:3000/", "02-wall-mobile.png", 2);

  // 試用中帳號：主控台 header 的倒數 chip
  await shoot(browser, trialState, { width: 1600, height: 1000 }, "http://localhost:3000/", "03-trial-chip-desktop.png", 1.5);

  await browser.close();
  console.log("done ->", OUT);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
