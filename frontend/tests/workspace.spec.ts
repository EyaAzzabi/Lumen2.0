import { readFile } from "node:fs/promises";
import { test, expect, type Page, type BrowserContext } from "@playwright/test";
async function fallback(context: BrowserContext) {
  await context.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      type: string,
      ...args: unknown[]
    ) {
      if (type === "webgl" || type === "webgl2") return null;
      return original.call(this, type, ...(args as []));
    } as typeof original;
  });
}
async function login(page: Page, operator = "kestrel") {
  const r = await page.request.post("/api/auth/login", {
    data: { email: `${operator}@plume.demo`, password: "plume-demo-2040" },
  });
  expect(r.ok()).toBeTruthy();
}

test("server draft resumes and a stale tab cannot overwrite it", async ({
  browser,
}) => {
  const context = await browser.newContext();
  await fallback(context);
  const page = await context.newPage();
  await login(page);
  await page.goto("/#setup");
  await expect(page.locator(".draft-fields")).toBeEnabled();
  await page.getByRole("button", { name: "New mission", exact: true }).click();
  await page.getByLabel("MISSION IDENTIFIER").fill("Persistent operator draft");
  await page.getByLabel("East coordinate in metres").fill("2450");
  await page.getByLabel("East coordinate in metres").press("Tab");
  await expect(page.locator(".draft-status")).toContainText("Draft saved");
  await page.reload();
  await expect(page.getByLabel("MISSION IDENTIFIER")).toHaveValue(
    "Persistent operator draft",
  );
  await expect(page.getByLabel("East coordinate in metres")).toHaveValue(
    "2450",
  );
  const tab = await context.newPage();
  await tab.goto("/#setup");
  await expect(tab.getByLabel("MISSION IDENTIFIER")).toHaveValue(
    "Persistent operator draft",
  );
  await page
    .getByLabel("MISSION IDENTIFIER")
    .fill("Newer draft from first tab");
  await expect(page.locator(".draft-status")).toContainText("Draft saved");
  await tab.getByLabel("MISSION IDENTIFIER").fill("Stale tab edit");
  await expect(tab.locator(".draft-status")).toContainText("409");
  expect(
    (await (await page.request.get("/api/workspace/draft")).json()).draft.name,
  ).toBe("Newer draft from first tab");
  await tab.getByRole("button", { name: "Reload saved workspace" }).click();
  await expect(tab.getByLabel("MISSION IDENTIFIER")).toHaveValue(
    "Newer draft from first tab",
  );
  await page.getByLabel("MISSION IDENTIFIER").fill("Draft flushed on sign out");
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
  await expect(page.getByLabel("MISSION IDENTIFIER")).toHaveValue(
    "Draft flushed on sign out",
  );
  await context.close();
});

test("two operators resolve an objection with checked limits, revision and explicit agreement", async ({
  browser,
}) => {
  const owner = await browser.newContext(),
    neighbor = await browser.newContext();
  await fallback(owner);
  await fallback(neighbor);
  const p = await owner.newPage(),
    n = await neighbor.newPage();
  const errors: string[] = [];
  p.on("pageerror", (e) => errors.push(e.message));
  n.on("pageerror", (e) => errors.push(e.message));
  await login(p);
  await p.goto("/#setup");
  await expect(p.locator(".draft-fields")).toBeEnabled();
  await p.getByRole("button", { name: "New mission", exact: true }).click();
  const name = `Coordination ${Date.now()}`;
  await p.getByLabel("MISSION IDENTIFIER").fill(name);
  await p.getByLabel("LANDER CLASS").selectOption("superheavy");
  await p.getByLabel("East coordinate in metres").fill("1500");
  await p.getByLabel("East coordinate in metres").press("Tab");
  await p.getByLabel("North coordinate in metres").fill("-1500");
  await p.getByLabel("North coordinate in metres").press("Tab");
  await p.getByRole("button", { name: "Analyze this mission" }).click();
  await expect(p.locator(".journey-verdict strong")).toContainText("€");
  await p.getByRole("button", { name: "Coordinate", exact: true }).click();
  if (
    !(await p
      .getByRole("button", { name: "Submit proposal", exact: true })
      .isVisible())
  )
    await p.getByText("File your current draft", { exact: true }).click();
  const filedResponse = p.waitForResponse(
    (r) => r.url().endsWith("/api/plans") && r.request().method() === "POST",
  );
  await p.getByRole("button", { name: "Submit proposal", exact: true }).click();
  const filed = await (await filedResponse).json();
  expect(filed.plan.id).toBeTruthy();
  const id = filed.plan.id;
  const notices = (await (await p.request.get("/api/notices")).json()).filter(
    (v: { plan_id: string }) => v.plan_id === id,
  );
  expect(notices.length).toBeGreaterThan(0);
  const recipient = notices[0].to_operator_id;
  await login(n, recipient);
  await n.goto("/#notices");
  await n.getByLabel("Proposal to review").selectOption(id);
  await n
    .getByLabel("Consultation response")
    .fill(
      "Please reduce modeled damage to our equipment to at most 3 percent.",
    );
  await n.getByRole("button", { name: "Raise a concern", exact: true }).click();
  await expect(n.locator("h3.coordination-status")).toHaveText(
    "objection received",
  );
  await p.reload();
  await p.getByLabel("Proposal to review").selectOption(id);
  const resolver = p.getByRole("region", { name: "Resolve an objection" });
  await expect(resolver).toBeVisible();
  await resolver
    .getByLabel("Requested maximum modeled damage percent")
    .fill("3");
  await resolver
    .getByRole("button", { name: "Apply constraints and compare" })
    .click();
  await expect(
    p.getByRole("region", { name: "Active protection constraints" }),
  ).toBeVisible();
  await p.getByRole("button", { name: "Find alternative sites" }).click();
  await expect(p.getByLabel("Alternative site", { exact: true })).toBeVisible();
  await expect(
    p.getByRole("region", { name: "Active protection constraints" }),
  ).toContainText("meets these limits");
  await p.getByRole("button", { name: "Use this landing site" }).click();
  await expect(p.locator(".journey-verdict strong")).toBeVisible();
  await p.getByRole("button", { name: "Coordinate", exact: true }).click();
  await p.getByLabel("Proposal to review").selectOption(id);
  const revisedResponse = p.waitForResponse(
    (r) =>
      r.url().endsWith(`/api/plans/${id}/revisions`) &&
      r.request().method() === "POST",
  );
  await p.getByRole("button", { name: "Submit revision", exact: true }).click();
  const revised = await (await revisedResponse).json();
  expect(revised.plan.revision).toBe(2);
  expect(revised.plan.protection.passes).toBeTruthy();
  expect(revised.plan.status).toBe("awaiting_responses");
  await n.reload();
  await n.getByLabel("Proposal to review").selectOption(id);
  await n.getByRole("button", { name: "Acknowledge", exact: true }).click();
  await expect(n.locator("h3.coordination-status")).toHaveText("coordinated");
  const detail = await (await n.request.get(`/api/plans/${id}`)).json();
  expect(detail.revisions).toHaveLength(2);
  expect(
    detail.notices.some((v: { response_history?: { status: string }[] }) =>
      v.response_history?.some((r) => r.status === "objection"),
    ),
  ).toBeTruthy();
  await n.getByText("Revision history & evidence", { exact: true }).click();
  const download = n.waitForEvent("download");
  await n
    .getByRole("button", {
      name: "Download coordination evidence",
      exact: true,
    })
    .click();
  const evidence = JSON.parse(
    await readFile((await (await download).path())!, "utf-8"),
  );
  expect(evidence.plan.id).toBe(id);
  expect(evidence.revisions).toHaveLength(2);
  expect(errors).toEqual([]);
  await owner.close();
  await neighbor.close();
});
