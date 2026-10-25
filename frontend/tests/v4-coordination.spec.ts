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
  await n.getByText("Structured objection", { exact: true }).click();
  const equipment = n.getByLabel("Objection equipment");
  const assetId = await equipment
    .locator("option")
    .nth(1)
    .getAttribute("value");
  await equipment.selectOption(assetId!);
  await n.getByLabel("Objection reason").fill("Protect our equipment");
  await n.getByLabel("Maximum modeled damage percent").fill("3");
  await n.getByLabel("Minimum landing distance metres").fill("1000");
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
  await expect(
    p.getByRole("region", { name: "Candidate constraints" }),
  ).toContainText("Satisfied");
  const draftsBefore = await (await p.request.get("/api/drafts")).json();
  await p.getByRole("button", { name: "Before", exact: true }).click();
  await expect(
    p.getByText("Original site is on the map.", { exact: false }),
  ).toBeVisible();
  await p.getByRole("button", { name: "After", exact: true }).click();
  await expect(
    p.getByText("Alternative site is on the map.", { exact: false }),
  ).toBeVisible();
  expect(await (await p.request.get("/api/drafts")).json()).toEqual(
    draftsBefore,
  );
  await p
    .getByRole("button", { name: "Frame both sites", exact: true })
    .click();
  await p.screenshot({ path: "artifacts/constrained-comparison.png" });
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
  await p.reload();
  await p.getByLabel("Proposal to review").selectOption(id);
  await p
    .getByRole("region", { name: "Plan revision history" })
    .getByText(/Revision 2 ·/)
    .click();
  const download = p.waitForEvent("download");
  await p
    .getByRole("link", { name: "Download PDF dossier", exact: true })
    .last()
    .click();
  expect((await download).suggestedFilename()).toContain("r2.pdf");
  const dossier = await (
    await n.request.get(`/api/plans/${id}/revisions/2/dossier?format=json`)
  ).json();
  expect(dossier.frozen_revision.snapshot.constraint_evaluation.satisfied).toBe(
    true,
  );
  expect(dossier.current_coordination.status).toBe("coordinated");
  expect(errors).toEqual([]);
  await owner.close();
  await neighbor.close();
});

test("an exhausted evaluated search never offers an invalid adoption", async ({
  browser,
}) => {
  const owner = await browser.newContext(),
    neighbor = await browser.newContext();
  await fallback(owner);
  await fallback(neighbor);
  const p = await owner.newPage(),
    n = await neighbor.newPage();
  await login(p);
  const session = await (await p.request.get("/api/session")).json();
  const filed = await p.request.post("/api/plans", {
    headers: {
      "X-Plume-CSRF": session.csrf_token,
      "Idempotency-Key": `no-feasible-${Date.now()}`,
    },
    data: {
      operator_id: "kestrel",
      name: `No feasible ${Date.now()}`,
      window_start: "2040-03-14T06:00:00Z",
      window_end: "2040-03-14T08:00:00Z",
      lander: {
        label: "Super-heavy lander",
        thrust_kn: 1800,
        hover_s: 30,
        dispersion_m: 50,
      },
      site: { x: 1500, y: -1500 },
    },
  });
  expect(filed.ok()).toBeTruthy();
  const id = (await filed.json()).plan.id;
  const notice = (await (await p.request.get("/api/notices")).json()).find(
    (v: { plan_id: string }) => v.plan_id === id,
  );
  await login(n, notice.to_operator_id);
  const recipient = await (await n.request.get("/api/session")).json();
  const response = await n.request.patch(`/api/notices/${notice.id}`, {
    headers: {
      "X-Plume-CSRF": recipient.csrf_token,
      "Idempotency-Key": `limit-${Date.now()}`,
    },
    data: {
      status: "objection",
      reply: "Request a wider separation",
      constraints: [
        {
          asset_id: notice.asset_ids[0],
          reason: "Separation limit",
          min_separation_m: 30000,
        },
      ],
    },
  });
  expect(response.ok()).toBeTruthy();
  await p.goto("/#notices");
  await p.getByLabel("Proposal to review").selectOption(id);
  await p
    .getByRole("button", { name: "Compare a revision", exact: true })
    .click();
  await p
    .getByRole("button", { name: "Find alternative sites", exact: true })
    .click();
  await expect(
    p.getByText("No feasible site found in the evaluated search.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    p.getByRole("button", { name: "Use this landing site", exact: false }),
  ).toHaveCount(0);
  await owner.close();
  await neighbor.close();
});
