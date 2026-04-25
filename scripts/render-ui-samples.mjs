import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const outDir = path.join(process.cwd(), "docs-md-staging", "ui-samples");
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1100 },
  deviceScaleFactor: 1
});

await page.goto("http://localhost:3000/design-samples", { waitUntil: "networkidle" });

const sections = await page.locator("section").all();
const files = [];

for (let index = 0; index < sections.length; index += 1) {
  const file = path.join(outDir, `sample-${String.fromCharCode(97 + index)}.png`);
  await sections[index].screenshot({ path: file });
  files.push(file);
}

const full = path.join(outDir, "all-samples.png");
await page.screenshot({ path: full, fullPage: true });
await browser.close();

console.log(JSON.stringify({ outDir, files, full }, null, 2));
