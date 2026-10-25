import { test, expect } from "@playwright/test";
test("merged Eya auth: create organization, persist login, invite member and sign out", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();
  // Account-flow verification uses the supported 2D fallback; cinematic rendering is tested separately.
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
  const email = `owner-${Date.now()}@example.test`,
    password = "merge-ui-test-password";
  await page.goto("/#login");
  await page.getByRole("tab", { name: "Create account", exact: true }).click();
  const form = page.locator(".auth-form");
  await form.getByLabel("FULL NAME", { exact: true }).fill("Merge Test Owner");
  await form.getByLabel("WORK EMAIL", { exact: true }).fill(email);
  await form.getByLabel("PASSWORD", { exact: true }).fill(password);
  await form.getByLabel("CONFIRM", { exact: true }).fill(password);
  await form
    .getByLabel("ORGANIZATION NAME", { exact: true })
    .fill(`Merge Lunar ${Date.now()}`);
  await form
    .getByRole("button", { name: "CREATE ACCOUNT", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Account menu", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Acting as operator" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Account menu", exact: true }).click();
  const code = await page.locator(".account-menu code").innerText();
  expect(code.length).toBeGreaterThan(8);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.locator(".cinematic-gateway")).toBeVisible();
  expect(
    (await (await page.request.get("/api/session")).json()).authenticated,
  ).toBe(false);
  await page.goto("/#operations");
  await expect(page.locator(".auth-card")).toBeVisible();
  await page
    .locator(".auth-form")
    .getByLabel("WORK EMAIL", { exact: true })
    .fill(email);
  await page
    .locator(".auth-form")
    .getByLabel("PASSWORD", { exact: true })
    .fill(password);
  await page
    .locator(".auth-form")
    .getByRole("button", { name: "SIGN IN", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Account menu", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Account menu", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Account menu", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.locator(".cinematic-gateway")).toBeVisible();
  expect(
    (await (await page.request.get("/api/session")).json()).authenticated,
  ).toBe(false);
  await page.goto("/#login");
  await page.getByRole("tab", { name: "Create account", exact: true }).click();
  await page
    .locator(".auth-form")
    .getByLabel("FULL NAME", { exact: true })
    .fill("Merge Test Member");
  await page
    .locator(".auth-form")
    .getByLabel("WORK EMAIL", { exact: true })
    .fill(`member-${Date.now()}@example.test`);
  await page
    .locator(".auth-form")
    .getByLabel("PASSWORD", { exact: true })
    .fill(password);
  await page
    .locator(".auth-form")
    .getByLabel("CONFIRM", { exact: true })
    .fill(password);
  await page
    .getByRole("button", { name: "Join with invite", exact: true })
    .click();
  await page.getByLabel(/^INVITE CODE/).fill(code);
  await page
    .getByRole("button", { name: "CREATE ACCOUNT", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Account menu", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Account menu", exact: true }).click();
  await expect(page.locator(".account-menu")).toContainText("Member");
  await expect(page.locator(".account-menu code")).toHaveCount(0);
  await page.screenshot({ path: "artifacts/merged-auth.png" });
  await context.close();
});
