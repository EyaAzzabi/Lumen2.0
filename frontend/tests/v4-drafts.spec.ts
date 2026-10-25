import { test, expect } from "@playwright/test";
test("organization draft resumes after sign-in, detects conflicts, archives and restores", async ({
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
  const name = `Saved draft ${Date.now()}`;
  await page.getByLabel("MISSION IDENTIFIER").fill(name);
  await page
    .getByRole("button", { name: "Save new draft", exact: true })
    .click();
  await expect(page.locator(".draft-save-control")).toContainText(
    "Draft saved",
  );
  await page.getByLabel("East coordinate in metres").fill("2600");
  await page.getByLabel("East coordinate in metres").press("Tab");
  await expect
    .poll(async () => {
      const rows = await (await page.request.get("/api/drafts")).json();
      return rows.find((d: any) => d.data.name === name)?.data.site.x;
    })
    .toBe(2600);
  await page.getByRole("button", { name: "Account menu", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.locator(".cinematic-gateway")).toBeVisible();
  await page.goto("/#login");
  await page
    .locator(".auth-form")
    .getByLabel("WORK EMAIL", { exact: true })
    .fill("kestrel@plume.demo");
  await page
    .locator(".auth-form")
    .getByLabel("PASSWORD", { exact: true })
    .fill("plume-demo-2040");
  await page.getByRole("button", { name: "SIGN IN", exact: true }).click();
  await page
    .getByRole("button", { name: "Saved missions", exact: true })
    .click();
  const item = page.locator(".library-item").filter({ hasText: name });
  await item.getByRole("button", { name: "Resume draft", exact: true }).click();
  await expect(page.getByLabel("MISSION IDENTIFIER")).toHaveValue(name);
  await expect(page.getByLabel("East coordinate in metres")).toHaveValue(
    "2600",
  );
  const session = await (await page.request.get("/api/session")).json(),
    rows = await (await page.request.get("/api/drafts")).json(),
    draft = rows.find((d: any) => d.data.name === name);
  const other = await page.request.patch(`/api/drafts/${draft.id}`, {
    headers: { "X-Plume-CSRF": session.csrf_token },
    data: {
      expected_version: draft.version,
      data: { ...draft.data, name: "Changed by a teammate" },
    },
  });
  expect(other.ok()).toBeTruthy();
  await page.getByLabel("MISSION IDENTIFIER").fill("Stale local edit");
  await expect(page.locator(".draft-save-control")).toContainText("409");
  await page
    .getByRole("button", { name: "Reload saved version", exact: true })
    .click();
  await expect(page.getByLabel("MISSION IDENTIFIER")).toHaveValue(
    "Changed by a teammate",
  );
  await page
    .getByRole("button", { name: "Saved missions", exact: true })
    .click();
  const updated = page
    .locator(".library-item")
    .filter({ hasText: "Changed by a teammate" });
  await updated
    .getByRole("button", { name: "Archive draft", exact: true })
    .click();
  await expect(updated).toContainText("archived");
  await updated
    .getByRole("button", { name: "Restore draft", exact: true })
    .click();
  await expect(
    updated.getByRole("button", { name: "Resume draft", exact: true }),
  ).toBeVisible();
});
