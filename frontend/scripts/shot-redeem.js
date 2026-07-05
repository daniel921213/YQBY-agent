// Dev-only: walk the full redeem flow on the expired wall and screenshot it.
// Prereqs: backend on :8000 with ADMIN_SECRET=local-demo-admin + demo_wall.db
// seeded (seed_demo_wall.py), frontend dev on :3000, playwright installed.
// Usage: node scripts/shot-redeem.js
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

async function mintCode(tier) {
  const res = await fetch("http://localhost:8000/api/v1/admin/codes", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Admin-Key": "local-demo-admin" },
    body: JSON.stringify({ tier, count: 1 })
  });
  if (!res.ok) throw new Error(`mint failed: ${res.status}`);
  return (await res.json()).codes[0];
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 1.5,
    storageState: await loginState("demo_expired")
  });
  const page = await ctx.newPage();

  // 1) 到期打馬頁（新文案 + 輸碼框）
  await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, "04-wall-with-redeem.png") });

  // 2) 輸錯碼 → 錯誤訊息
  await page.getByLabel("啟用碼").fill("NOVA-XXXX-XXXX");
  await page.getByRole("button", { name: "啟用" }).click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(OUT, "05-redeem-invalid.png") });

  // 3) 輸入真碼 → 成功 → 自動重載 → 主控台解鎖（會員剩 30 天）
  const code = await mintCode("30d");
  console.log("minted:", code);
  await page.getByLabel("啟用碼").fill(code);
  await page.getByRole("button", { name: "啟用" }).click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(OUT, "06-redeem-success.png") });
  await page.waitForTimeout(2200); // 等 reload 完成
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, "07-unlocked-member-chip.png") });

  await browser.close();
  console.log("done ->", OUT);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
