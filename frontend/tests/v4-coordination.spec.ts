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

test("two operators file, object, optimize, revise and explicitly coordinate", async ({
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
    (r) =>
      /\/api\/drafts\/[^/]+\/file$/.test(r.url()) &&
      r.request().method() === "POST",
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
  await expect(p.locator("h3.coordination-status")).toHaveText(
    "objection received",
  );
  await p
    .getByRole("button", { name: "Compare a revision", exact: true })
    .click();
  await p.getByRole("button", { name: "Find alternative sites" }).click();
  await expect(p.getByLabel("Alternative site", { exact: true })).toBeVisible();
  await p.getByRole("button", { name: "Use this landing site" }).click();
  await expect(p.locator(".journey-verdict strong")).toBeVisible();
  await p.getByRole("button", { name: "Coordinate", exact: true }).click();
  await p.getByLabel("Proposal to review").selectOption(id);
  const revisedResponse = p.waitForResponse(
    (r) =>
      /\/api\/drafts\/[^/]+\/file$/.test(r.url()) &&
      r.request().method() === "POST",
  );
  await p.getByRole("button", { name: "Submit revision", exact: true }).click();
  const revised = await (await revisedResponse).json();
  expect(revised.plan.revision).toBe(2);
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
  expect(errors).toEqual([]);
  await owner.close();
  await neighbor.close();
});
