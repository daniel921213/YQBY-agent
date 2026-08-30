// Dev-only helper: screenshot the auth page + dashboard tabs for visual review.
// Prereqs: backend on :8000 + `npm run start` on :3000, plus
//   npm i --no-save playwright && npx playwright install chromium
// Usage: node scripts/shot-quadrant.js
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1680, height: 1100 },
    deviceScaleFactor: 1.5,
    storageState: {
      cookies: [],
      origins: [
        {
          origin: "http://localhost:3000",
          localStorage: [
            { name: "yqby.session", value: "designcheck" },
            { name: "yqby.token", value: "designcheck" }
          ]
        }
      ]
    }
  });
  const page = await ctx.newPage();

  // Auth page (the guard only checks localStorage, /login still renders).
  await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await page.screenshot({ path: "scripts/login.png", fullPage: false });

  // Dashboard: default 異常警報 tab.
  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.screenshot({ path: "scripts/dash-anomaly.png", fullPage: false });

  // 資金異動雷達 tab with the OI quadrant map.
  await page.getByRole("button", { name: /資金異動雷達/ }).click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "scripts/quadrant-tab.png", fullPage: true });

  await browser.close();
  console.log("done");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
