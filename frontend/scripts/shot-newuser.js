// Dev-only: new-user activation flow — register (no free days) -> "new" wall
// -> redeem a 7d code -> unlocked trial. Plus the updated expired-wall copy.
// Prereqs: backend on :8000 (ADMIN_SECRET=local-demo-admin), frontend dev on :3000.
// Usage: node scripts/shot-newuser.js
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const OUT = path.resolve(__dirname, "..", "..", "screenshots", "entitlement");
fs.mkdirSync(OUT, { recursive: true });
const API = "http://localhost:8000";

async function api(pathname, body, headers = {}) {
  const res = await fetch(API + pathname, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`${pathname} -> ${res.status}`);
  return res.json();
}

function state(uid, token) {
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

(async () => {
  const browser = await chromium.launch();

  // 全新註冊帳號（沒有任何天數）
  const uid = "demo_new_" + Date.now().toString(36);
  const { token } = await api("/api/v1/auth/register", { uid, password: "secret123" });

  const ctx = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 1.5,
    storageState: state(uid, token)
  });
  const page = await ctx.newPage();

  // 1) 新用戶牆：開始 7 天免費試用
  await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, "08-newuser-wall.png") });

  // 2) 輸入 7 天試用碼 → 解鎖
  const { codes } = await api(
    "/api/v1/admin/codes",
    { tier: "7d", count: 1 },
    { "X-Admin-Key": "local-demo-admin" }
  );
  console.log("minted 7d:", codes[0]);
  await page.getByLabel("啟用碼").fill(codes[0]);
  await page.getByRole("button", { name: "啟用" }).click();
  await page.waitForTimeout(2600);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, "09-newuser-activated.png") });
  await ctx.close();

  // 3) 到期牆的新文案（demo_expired 是過期的試用帳號）
  const login = await api("/api/v1/auth/login", { uid: "demo_expired", password: "secret123" });
  const ctx2 = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 1.5,
    storageState: state("demo_expired", login.token)
  });
  const page2 = await ctx2.newPage();
  await page2.goto("http://localhost:3000/", { waitUntil: "networkidle" });
  await page2.waitForTimeout(1200);
  await page2.screenshot({ path: path.join(OUT, "10-expired-new-copy.png") });
  await ctx2.close();

  await browser.close();
  console.log("done ->", OUT);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
