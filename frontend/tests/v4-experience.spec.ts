import { test, expect } from "@playwright/test";

test("public arrival, authenticated continuation and optional director preserve one mission", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#gateway");
  await expect(
    page.getByRole("heading", { name: "One Moon. Many Missions." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Experience a Landing", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Welcome to the Moon. You’re not alone.",
    }),
  ).toBeVisible();
  await expect(page.locator(".persistent-scene canvas")).toBeVisible();
  await expect(page.locator(".scene-loading")).toHaveCount(0);
  await page.screenshot({ path: "artifacts/arrival-desktop.png" });
  await page
    .getByRole("button", { name: "Start your landing", exact: true })
    .click();
  await expect(page.locator(".auth-card")).toBeVisible();
  await page.getByLabel("WORK EMAIL").fill("kestrel@plume.demo");
  await page.getByLabel("PASSWORD", { exact: true }).fill("plume-demo-2040");
  await page.getByRole("button", { name: "SIGN IN", exact: true }).click();
  await page
    .getByLabel("MISSION IDENTIFIER")
    .fill("Lunar experience continuity");
  await page.getByRole("button", { name: "Next chapter", exact: true }).click();
  await expect(page.getByLabel("MISSION IDENTIFIER")).toHaveValue(
    "Lunar experience continuity",
  );
  await page.route("**/api/assess", (route) => route.abort(), { times: 1 });
  await page
    .getByRole("button", { name: "Analyze this mission", exact: true })
    .click();
  await expect(
    page.getByText("Analysis could not finish", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Retry analysis", exact: true })
    .click();
  await expect(page.locator(".journey-verdict strong")).toBeVisible();
  await page.getByRole("button", { name: "Next chapter", exact: true }).click();
  await page.getByRole("button", { name: "Next chapter", exact: true }).click();
  await page.getByRole("button", { name: "Next chapter", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Open your mission in Mission Control",
      exact: true,
    })
    .click();
  await expect(page.getByLabel("MISSION IDENTIFIER")).toHaveValue(
    "Lunar experience continuity",
  );
  await page
    .getByRole("button", { name: "Five-minute demo guide", exact: true })
    .click();
  await expect(
    page.getByRole("complementary", { name: "Optional mission guide" }),
  ).toContainText("Open a mission");
  await page.getByRole("button", { name: "Skip / next", exact: true }).click();
  await page.getByRole("button", { name: "Minimize guide" }).click();
  await expect(page.getByLabel("MISSION IDENTIFIER")).toHaveValue(
    "Lunar experience continuity",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "artifacts/mission-mobile.png" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});
