import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
test("guided workspace calculates, compares and files a real proposal", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  expect(
    (
      await page.request.post("/api/auth/login", {
        data: { email: "kestrel@plume.demo", password: "plume-demo-2040" },
      })
    ).ok(),
  ).toBeTruthy();
  await page.goto("/#setup");
  await expect(page.locator(".draft-fields")).toBeEnabled();
  await page.getByRole("button", { name: "New mission", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Analyze this mission" }),
  ).toBeDisabled();
  await expect(page.locator(".journey-panel")).toHaveCount(1);
  await page.getByLabel("MISSION IDENTIFIER").fill("UX validation mission");
  await page.getByLabel("LANDER CLASS").selectOption("superheavy");
  await page.getByLabel("East coordinate in metres").fill("1500");
  await page.getByLabel("East coordinate in metres").press("Tab");
  await page.getByLabel("North coordinate in metres").fill("-1500");
  await page.getByLabel("North coordinate in metres").press("Tab");
  await page.getByRole("button", { name: "Analyze this mission" }).click();
  await expect(page.locator(".journey-verdict strong")).toContainText("€");
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({ path: "artifacts/journey-desktop.png" });
  await page.getByRole("tab", { name: "Compare", exact: true }).click();
  await page.getByRole("button", { name: "Find alternative sites" }).click();
  await expect(
    page.getByLabel("Alternative site", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "After", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "After", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".journey-heading")).toContainText("preview only");
  await page.getByRole("button", { name: "Use this landing site" }).click();
  await expect(page.locator(".journey-verdict strong")).toBeVisible();
  await page.getByRole("button", { name: "Coordinate", exact: true }).click();
  if (
    !(await page
      .getByRole("button", { name: "Submit proposal", exact: true })
      .isVisible())
  )
    await page.getByText("File your current draft", { exact: true }).click();
  await page
    .getByRole("button", { name: "Submit proposal", exact: true })
    .click();
  await expect(page.getByLabel("Proposal to review")).toContainText(
    "UX validation mission",
  );
  await expect(page.locator("h3.coordination-status")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Analyze", exact: true }).click();
  await page.screenshot({
    path: "artifacts/journey-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  expect(errors).toEqual([]);
});

test("failed analysis offers a working retry instead of an endless loading state", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      type: string,
      ...args: unknown[]
    ) {
      if (type === "webgl" || type === "webgl2") return null;
      return original.call(this, type, ...(args as []));
    } as typeof original;
  });
  await page.request.post("/api/auth/login", {
    data: { email: "kestrel@plume.demo", password: "plume-demo-2040" },
  });
  await page.goto("/#setup");
  await expect(page.locator(".draft-fields")).toBeEnabled();
  await page.getByRole("button", { name: "New mission", exact: true }).click();
  await page.getByLabel("MISSION IDENTIFIER").fill("Retry validation");
  await page.route("**/api/assess", (r) =>
    r.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Temporary assessment outage" }),
    }),
  );
  await page.getByRole("button", { name: "Analyze this mission" }).click();
  await expect(
    page.getByRole("heading", { name: "Analysis could not finish" }),
  ).toBeVisible();
  await page.unroute("**/api/assess");
  await page.getByRole("button", { name: "Retry analysis" }).click();
  await expect(page.locator(".journey-verdict strong")).toContainText("€");
});
