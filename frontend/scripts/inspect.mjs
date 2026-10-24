import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const output = new URL("../artifacts/", import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ["--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
});
const errors = [],
  warnings = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
  if (m.type() === "warning") warnings.push(m.text());
});
await page.goto(process.env.PLUME_INSPECT_URL || "http://127.0.0.1:5174/", {
  waitUntil: "networkidle",
  timeout: 120000,
});
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(2500);
await page.screenshot({ path: fileURLToPath(new URL("gateway.png", output)) });
await page
  .getByRole("button", { name: "ENTER MISSION CONTROL", exact: false })
  .click();
await page.waitForFunction(
  () => document.querySelector(".hero-metric")?.textContent?.includes("€"),
  undefined,
  { timeout: 120000 },
);
await page.waitForTimeout(2000);
await page.screenshot({
  path: fileURLToPath(new URL("operations.png", output)),
});
console.log(
  JSON.stringify(
    {
      errors,
      warnings,
      title: await page.title(),
      canvas: await page.locator("canvas").count(),
      bodyOverflow: await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    },
    null,
    2,
  ),
);
await writeFile(
  new URL("inspection.json", output),
  JSON.stringify({ errors, warnings }, null, 2),
);
await browser.close();
