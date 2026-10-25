import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

test.beforeEach(async ({ page }) => {
  const r = await page.request.post("/api/auth/login", {
    data: { email: "kestrel@plume.demo", password: "plume-demo-2040" },
  });
  expect(r.ok()).toBeTruthy();
});
test("cinematic scenes respond to camera, search, layers, visual modes and direct login navigation", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await mkdir("artifacts", { recursive: true });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Log in", exact: false }),
  ).toBeVisible();
  await expect(page.locator(".hero-environment")).toBeVisible();
  await page
    .getByRole("button", { name: "ENTER MISSION CONTROL", exact: false })
    .click();
  await expect(page.locator(".hero-metric").first()).toContainText("€");
  await expect(page.locator(".tour-control")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const imageA = await page.locator(".persistent-scene canvas").screenshot();
  await page.waitForTimeout(1200);
  const imageB = await page.locator(".persistent-scene canvas").screenshot();
  expect(imageA.equals(imageB)).toBe(false);
  await page.locator(".tour-control").press("Enter");
  await expect(page.locator(".tour-control")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await page.getByRole("button", { name: /Polar crater SYNTHETIC/ }).click();
  await expect(page.locator(".view-crater")).toHaveClass(/active/);
  await page
    .getByRole("button", { name: /South pole overview SHARED/ })
    .click();
  await page
    .getByRole("textbox", { name: "Search infrastructure" })
    .fill("telescope");
  await page.locator(".search-results").getByRole("button").first().click();
  await expect(page.locator(".selected-context")).toContainText(
    "FLO Optical Telescope",
  );
  await page
    .getByRole("button", { name: "RETURN TO OVERVIEW", exact: false })
    .click();
  await page
    .locator(".scene-style-switch")
    .getByRole("button", { name: "Mesh", exact: true })
    .click();
  await expect(
    page
      .locator(".scene-style-switch")
      .getByRole("button", { name: "Mesh", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .locator(".scene-style-switch")
    .getByRole("button", { name: "Assets", exact: true })
    .click();
  await page.locator(".layer-popover>summary").click();
  await page
    .locator(".layer-popover")
    .getByRole("checkbox", { name: "Infrastructure", exact: false })
    .count();
  await page
    .locator(".layer-popover")
    .getByRole("checkbox", { name: "Bases & infrastructure", exact: true })
    .uncheck();
  await expect(page.locator(".spatial-label")).toHaveCount(0);
  await page
    .locator(".layer-popover")
    .getByRole("checkbox", { name: "Bases & infrastructure", exact: true })
    .check();
  await page.locator(".layer-popover>summary").click();
  await page
    .locator(".scene-style-switch")
    .getByRole("button", { name: "3D", exact: true })
    .click();
  await page.waitForTimeout(1700);
  await page.screenshot({ path: "artifacts/cinematic-map.png" });
  await page
    .getByRole("button", { name: "Mission setup", exact: true })
    .click();
  await page.waitForTimeout(1800);
  await expect(page.locator(".preset-dock")).toBeVisible();
  await page.screenshot({ path: "artifacts/cinematic-hangar.png" });
  await page.evaluate(() => {
    location.hash = "login";
  });
  await expect(page.locator(".login-card")).toBeVisible();
  expect(errors).toEqual([]);
});
