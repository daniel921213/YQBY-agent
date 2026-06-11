// Dev-only helper: screenshot the OI quadrant map on the 數據榜單 tab.
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
  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /數據榜單/ }).click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "scripts/quadrant-tab.png", fullPage: true });

  // Hover a bubble to capture the tooltip state too.
  const dot = page.locator("svg[aria-label='OI 四象限異動圖'] g.cursor-pointer").first();
  await dot.hover();
  await page.waitForTimeout(400);
  await page.screenshot({ path: "scripts/quadrant-hover.png", fullPage: false });

  await browser.close();
  console.log("done");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
