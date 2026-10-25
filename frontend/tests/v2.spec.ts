import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  const r = await page.request.post("/api/auth/login", {
    data: { email: "kestrel@plume.demo", password: "plume-demo-2040" },
  });
  expect(r.ok()).toBeTruthy();
});
test("V2 browser: objection, optimizer, same-plan revision, acknowledgement and historical evidence", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/#report");
  const file = page.getByRole("button", {
    name: "FILE COORDINATION PLAN",
    exact: true,
  });
  await expect(file).toBeEnabled();
  const first = page.waitForResponse(
    (r) => r.url().endsWith("/api/plans") && r.request().method() === "POST",
  );
  await file.click();
  const original = (await (await first).json()).plan;
  let notices = await (await page.request.get("/api/notices")).json();
  const notice = notices.find(
    (n: { plan_id: string }) => n.plan_id === original.id,
  );
  await page.getByRole("button", { name: "Coordinate", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Acting as operator" })
    .selectOption(notice.to_operator_id);
  await page
    .locator(".coordination-notices>button")
    .filter({ hasText: notice.id })
    .click();
  await page
    .getByRole("textbox", { name: "RESPONSE / REASON REQUIRED FOR OBJECTION" })
    .fill("V2 preserve our optical surfaces");
  await page.getByRole("button", { name: "OBJECT", exact: true }).click();
  await expect(page.locator(".coordination-status")).toContainText(
    "objection_received",
  );
  await page
    .getByRole("combobox", { name: "Acting as operator" })
    .selectOption("kestrel");
  await page
    .locator(".coordination-notices>button")
    .filter({ hasText: notice.id })
    .click();
  await page
    .getByRole("button", { name: "PREPARE REVISION 2", exact: true })
    .click();
  await page
    .locator(".optimizer-panel")
    .getByRole("button", { name: "RUN OPTIMIZER", exact: true })
    .click();
  await expect(page.locator(".candidate-card")).not.toHaveCount(0);
  await page
    .locator(".candidate-card")
    .first()
    .getByRole("button", { name: "ADOPT THIS SITE", exact: true })
    .click();
  await page.getByRole("button", { name: "Report", exact: true }).click();
  const revise = page.getByRole("button", {
    name: "FILE REVISION 2",
    exact: true,
  });
  await expect(revise).toBeEnabled();
  const second = page.waitForResponse(
    (r) =>
      r.url().includes(`/api/plans/${original.id}/revisions`) &&
      r.request().method() === "POST",
  );
  await revise.click();
  const revised = (await (await second).json()).plan;
  expect(revised.id).toBe(original.id);
  expect(revised.revision).toBe(2);
  notices = await (await page.request.get("/api/notices")).json();
  const updated = notices.filter(
    (n: { revision_id: string }) => n.revision_id === revised.revision_id,
  );
  await page.getByRole("button", { name: "Coordinate", exact: true }).click();
  for (const n of updated) {
    await page
      .getByRole("combobox", { name: "Acting as operator" })
      .selectOption(n.to_operator_id);
    await page
      .locator(".coordination-notices>button")
      .filter({ hasText: n.id })
      .click();
    await page
      .getByRole("button", { name: "ACKNOWLEDGE", exact: true })
      .click();
    await expect(page.locator(".coordination-detail")).toContainText(
      "Acknowledgement recorded",
    );
  }
  await expect(page.locator(".coordination-status")).toContainText(
    "coordinated",
  );
  await page.reload();
  await expect(page.locator(".coordination-status")).toContainText(
    "coordinated",
  );
  const history = page.locator(".plan-history");
  await history
    .locator("summary")
    .filter({ hasText: "Objections and response history" })
    .click();
  await expect(history).toContainText("V2 preserve our optical surfaces");
  await page.screenshot({ path: "artifacts/v2-coordinated.png" });
  expect(errors).toEqual([]);
});
