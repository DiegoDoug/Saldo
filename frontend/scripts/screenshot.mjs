// One-off: capture README screenshots of the running app. Not part of the
// build/test pipeline — run manually with the dev stack up.
//
// Requires playwright-core (not a project dependency):
//   npm i -D playwright-core
// and a Chromium binary (set EXEC below). Start the backend + `npm run dev`
// (with a seeded demo user), then: node scripts/screenshot.mjs
import { chromium } from "playwright-core";

const EXEC = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const OUT = "/home/user/Saldo/docs/screenshots";
const BASE = "http://localhost:5173";

const browser = await chromium.launch({
  executablePath: EXEC,
  headless: true,
  args: ["--no-sandbox"],
});
const ctx = await browser.newContext({ viewport: { width: 430, height: 920 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

async function shot(name, full = true) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
  console.log("shot", name);
}

// Login screen
await page.goto(`${BASE}/login`);
await page.waitForSelector("input[type=email]");
await shot("login", false);

// Log in and land on the dashboard (sync pulls the seeded year)
await page.fill("input[type=email]", "demo@saldo.app");
await page.fill("input[type=password]", "demo-passphrase-123");
await page.click("button[type=submit]");
await page.waitForURL(`${BASE}/`);
await page.waitForTimeout(3000);
await shot("dashboard");

// Month view
await page.goto(`${BASE}/month/0`);
await page.waitForTimeout(2000);
await shot("month");

// Year view
await page.goto(`${BASE}/year`);
await page.waitForTimeout(2000);
await shot("year");

await browser.close();
console.log("done");
