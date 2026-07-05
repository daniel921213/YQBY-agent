// Dev-only helper: screenshot the 指標專區 + CT_NOVA detail pages (desktop + mobile).
// Prereqs: dev server on :3000, plus
//   npm i --no-save playwright && npx playwright install chromium
// Usage: node scripts/shot-indicators.js
// Output: D:\Crypto_killer\screenshots\indicators\
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const OUT = path.resolve(__dirname, "..", "..", "screenshots", "indicators");
fs.mkdirSync(OUT, { recursive: true });

const AUTH_STATE = {
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
};

// 逐屏往下捲，讓 IntersectionObserver 的 reveal 全部播完，再回到頂端。
async function playReveals(page) {
  await page.evaluate(async () => {
    const step = Math.floor(window.innerHeight * 0.65);
    const max = document.documentElement.scrollHeight;
    for (let y = 0; y <= max; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 240));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(800);
}

async function shootPage(ctx, url, prefix) {
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(OUT, `${prefix}-hero.png`) });
  await playReveals(page);
  await page.screenshot({ path: path.join(OUT, `${prefix}-full.png`), fullPage: true });
  await page.close();
}

(async () => {
  const browser = await chromium.launch();

  // 桌機 1600px
  const desktop = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 1.5,
    storageState: AUTH_STATE
  });
  await shootPage(desktop, "http://localhost:3000/indicators", "01-indicators-desktop");
  await shootPage(desktop, "http://localhost:3000/indicators/ct-nova", "02-ctnova-desktop");
  await desktop.close();

  // 手機 390px
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    storageState: AUTH_STATE
  });
  await shootPage(mobile, "http://localhost:3000/indicators", "03-indicators-mobile");
  await shootPage(mobile, "http://localhost:3000/indicators/ct-nova", "04-ctnova-mobile");
  await mobile.close();

  await browser.close();
  console.log("done ->", OUT);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
