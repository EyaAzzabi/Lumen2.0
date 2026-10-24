import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const output = "artifacts";
test.beforeAll(async () => {
  await mkdir(output, { recursive: true });
});

test("real mission workflow: configure, simulate, optimize, adopt, replay and report", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: /ENTER MISSION CONTROL/ }),
  ).toBeEnabled();
  await page.getByRole("button", { name: /ENTER MISSION CONTROL/ }).click();
  await expect(page.locator(".hero-metric")).toContainText("€");
  await expect(page.locator(".graphics-warning")).toHaveCount(0);
  expect(
    await page
      .locator(".persistent-scene canvas")
      .evaluateAll((nodes) =>
        nodes.some((c) => (c as HTMLCanvasElement).width > 100),
      ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Mission setup", exact: true })
    .click();
  await expect(page.locator(".configuration")).toBeVisible();
  await page.waitForTimeout(1600); // Let the inspection camera settle before visual review.
  await page.screenshot({ path: `${output}/setup.png` });
  await page
    .getByRole("spinbutton", { name: "East coordinate in metres" })
    .fill("1750");
  await page
    .getByRole("spinbutton", { name: "East coordinate in metres" })
    .press("Tab");
  await page.getByRole("button", { name: /CONTINUE TO OPERATIONS/ }).click();
  await expect(page.locator(".coordinate-readout")).toContainText("1.75");
  await expect(page.locator(".hero-metric")).toContainText("€");
  await page
    .getByRole("button", { name: "SIMULATE LANDING", exact: true })
    .click();
  await expect(page.getByRole("slider", { name: "Replay time" })).toBeEnabled();
  await page.getByRole("button", { name: "Skip to assessment" }).click();
  await expect(page.locator(".timeline-time")).toContainText("24.0");
  await page.screenshot({ path: `${output}/simulation.png` });
  await page.getByRole("slider", { name: "Replay time" }).fill("10");
  await page.getByRole("button", { name: "Play replay" }).click();
  await expect(
    page.getByRole("button", { name: "Pause replay" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Pause replay" }).click();
  await page.getByRole("button", { name: "Restart replay" }).click();
  await expect(page.locator(".timeline-time")).toContainText("00.0");
  await page.getByRole("button", { name: "Optimizer", exact: true }).click();
  const radius = page.getByRole("spinbutton", {
    name: "Search radius",
    exact: true,
  });
  await radius.fill("3500");
  await radius.press("Tab");
  await expect(radius).toHaveValue("3500");
  await radius.fill("99999");
  await radius.press("Tab");
  await expect(radius).toHaveValue("3500");
  await expect(page.locator(".mission-toast")).toContainText(
    "previous valid value was restored",
  );
  const responsePromise = page.waitForResponse(
    (r) => r.url().endsWith("/api/optimize") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "RUN OPTIMIZER", exact: true })
    .click();
  const result = await (await responsePromise).json();
  expect(result.search.radius_m).toBe(3500);
  expect(result.best).not.toBeNull();
  await expect(page.locator(".candidate-card")).toHaveCount(
    1 + result.alternatives.length,
  );
  await expect(page.locator(".candidate-label")).toHaveCount(
    1 + result.alternatives.length,
  );
  await page.screenshot({ path: `${output}/optimizer.png` });
  await page
    .getByRole("button", { name: "ADOPT THIS SITE", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "CURRENT LANDING SITE", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".coordinate-readout")).toContainText(
    (result.best.site.x / 1000).toFixed(2),
  );
  await page.getByRole("button", { name: "Report", exact: true }).click();
  await expect(page.locator(".report-kpis")).toBeVisible();
  await expect(page.locator(".report-comparison")).toContainText(
    "SELECTED ALTERNATIVE",
  );
  const current = await request.post("/api/assess", {
    data: {
      lander: {
        label: "Super-heavy lander",
        thrust_kn: 1800,
        hover_s: 30,
        dispersion_m: 50,
      },
      site: { x: result.best.site.x, y: result.best.site.y },
    },
  });
  const assessed = await current.json();
  expect(assessed.summary.expected_loss_meur).toBeCloseTo(
    result.best.summary.expected_loss_meur,
    8,
  );
  await page
    .getByRole("button", { name: "GENERATE BRIEFING", exact: true })
    .click();
  await expect(
    page
      .locator(".report-section")
      .filter({ hasText: "Coordination briefing" }),
  ).toContainText("Source:");
  await page.screenshot({ path: `${output}/report.png`, fullPage: true });
  await page.emulateMedia({ media: "print" });
  await page.pdf({
    path: `${output}/coordination-report.pdf`,
    format: "A4",
    printBackground: true,
  });
  await page.emulateMedia({ media: "screen" });
  expect(errors).toEqual([]);
});

test("two operators file, object, acknowledge and retain the actual backend status", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/#report");
  await expect(
    page.getByRole("button", { name: "FILE COORDINATION PLAN", exact: true }),
  ).toBeEnabled();
  const responsePromise = page.waitForResponse(
    (r) => r.url().endsWith("/api/plans") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "FILE COORDINATION PLAN", exact: true })
    .click();
  const filed = await (await responsePromise).json();
  expect(filed.notices_sent).toBeGreaterThan(0);
  const notices = await (
    await request.get("/api/notices?operator_id=kestrel")
  ).json();
  const notice = notices.find(
    (n: { plan_id: string }) => n.plan_id === filed.plan.id,
  );
  await page.getByRole("button", { name: "Coordinate", exact: true }).click();
  await expect(page.locator(".coordination-notices")).toContainText(
    notice.subject,
  );
  await page
    .getByRole("combobox", { name: "Acting as operator" })
    .selectOption(notice.to_operator_id);
  await expect(page.locator(".coordination-notices")).toContainText(
    notice.subject,
  );
  await page
    .locator(".coordination-notices>button")
    .filter({ hasText: notice.id })
    .click();
  await page
    .getByRole("textbox", { name: "RESPONSE / OPTIONAL" })
    .fill("Please move the landing site to reduce exposure.");
  await page.getByRole("button", { name: "OBJECT", exact: true }).click();
  await expect(page.locator(".coordination-detail")).toContainText(
    "Objection recorded",
  );
  await page.screenshot({ path: `${output}/coordination-objection.png` });
  await page.reload();
  await page
    .getByRole("combobox", { name: "Acting as operator" })
    .selectOption(notice.to_operator_id);
  await expect(page.locator(".coordination-detail")).toContainText(
    "Please move the landing site",
  );
  await page.getByRole("button", { name: "ACKNOWLEDGE", exact: true }).click();
  await expect(page.locator(".coordination-detail")).toContainText(
    "Acknowledgement recorded",
  );
  await expect(page.locator(".coordination-detail")).toContainText(
    "No plan-update or resolution endpoint",
  );
  const saved = await (
    await request.get(`/api/notices?operator_id=${notice.to_operator_id}`)
  ).json();
  expect(saved.find((n: { id: string }) => n.id === notice.id).status).toBe(
    "acknowledged",
  );
  await page
    .getByRole("combobox", { name: "Acting as operator" })
    .selectOption("kestrel");
  await expect(page.locator(".coordination-notices")).toContainText(
    "acknowledged",
  );
  const plans = await (await request.get("/api/plans")).json();
  expect(plans.find((p: { id: string }) => p.id === filed.plan.id).status).toBe(
    "consultation",
  );
  expect(errors).toEqual([]);
});

test("registry filters, ownership and registration use real persisted assets", async ({
  page,
  request,
}) => {
  await page.goto("/#registry");
  await expect(page.locator(".registry-assets>button")).toHaveCount(7);
  await page
    .getByRole("combobox", { name: "OWNING ORGANIZATION" })
    .selectOption("aurora");
  await expect(page.locator(".registry-assets>button")).toHaveCount(2);
  await expect(page.locator(".spatial-label")).toHaveCount(2);
  await page
    .getByRole("combobox", { name: "ASSET TYPE" })
    .selectOption("habitat");
  await expect(page.locator(".registry-assets>button")).toHaveCount(1);
  await page.locator(".registry-assets>button").first().click();
  await expect(page.locator(".registry-detail")).toContainText(
    "Aurora Base Alpha",
  );
  await expect(page.locator(".registry-detail")).toContainText(
    "Not assigned by registry",
  );
  await page.screenshot({ path: `${output}/registry.png` });
  await page
    .getByRole("combobox", { name: "OWNING ORGANIZATION" })
    .selectOption("all");
  await page
    .getByRole("combobox", { name: "ASSET TYPE", exact: true })
    .selectOption("all");
  await page.getByRole("button", { name: "REGISTER", exact: true }).click();
  await page
    .getByRole("textbox", { name: "ASSET NAME", exact: true })
    .fill("E2E logistics array");
  await page
    .getByRole("button", { name: "ADD TO SHARED REGISTRY", exact: true })
    .click();
  await expect(page.locator(".registry-detail")).toContainText(
    "E2E logistics array",
  );
  const assets = await (await request.get("/api/assets")).json();
  const asset = assets.find(
    (a: { name: string }) => a.name === "E2E logistics array",
  );
  expect(asset.operator_id).toBe("kestrel");
  await page
    .getByRole("button", { name: "REMOVE OWNED DEMO ASSET", exact: true })
    .click();
  await page
    .getByRole("button", { name: "REMOVE THIS ASSET", exact: true })
    .click();
  await expect(page.locator(".registry-assets>button")).toHaveCount(7);
});

test("pricing, subscription and login explicitly separate demo from commercial capabilities", async ({
  page,
}) => {
  await page.goto("/#pricing");
  await expect(page.locator(".pricing-card")).toHaveCount(4);
  await expect(page.locator(".pricing-workspace")).toContainText("€50,000");
  await expect(page.locator(".pricing-workspace")).toContainText("€500,000");
  await page.screenshot({ path: `${output}/pricing.png` });
  await page
    .getByRole("button", { name: "CONTACT SALES", exact: true })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toContainText("NO REQUEST SENT");
  await page
    .getByRole("button", { name: "EXPLORE DEMO ACCESS", exact: true })
    .click();
  await expect(page.locator(".login-card")).toBeVisible();
  await page.screenshot({ path: `${output}/login.png` });
  await page
    .getByRole("button", { name: "ABOUT ENTERPRISE SSO", exact: true })
    .click();
  await expect(page.locator(".sso-info")).toContainText(
    "does not authenticate",
  );
  await page
    .getByRole("combobox", { name: "DEMO ORGANIZATION", exact: true })
    .selectOption("aurora");
  await page
    .getByRole("button", { name: "ENTER DEMO WORKSPACE", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Acting as operator" }),
  ).toHaveValue("aurora");
  await page.getByRole("button", { name: "REGISTRY DEMO PLAN" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "not a purchased subscription",
  );
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
});

test("WebGL failure, reduced motion, mobile layout and network failure are explicit", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      type: string,
      ...args: unknown[]
    ) {
      if (type === "webgl2" || type === "webgl") return null;
      return original.call(this, type, ...(args as []));
    } as typeof original;
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: /ENTER MISSION CONTROL/ }),
  ).toBeEnabled();
  await page.getByRole("button", { name: /ENTER MISSION CONTROL/ }).click();
  await expect(page.locator(".graphics-warning")).toContainText(
    "2D graphics mode",
  );
  await expect(page.locator(".hero-metric")).toContainText("€");
  await page
    .getByRole("button", { name: "SIMULATE LANDING", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Play replay", exact: true }),
  ).toBeDisabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: `${output}/mobile-fallback.png` });
  await context.close();
  const failed = await browser.newPage();
  await failed.route("**/api/meta", (route) => route.abort());
  await failed.goto("/");
  await expect(failed.locator(".inline-error")).toContainText(
    "Mission data unavailable",
  );
  await expect(
    failed.getByRole("button", { name: /ENTER MISSION CONTROL/ }),
  ).toBeDisabled();
  await failed.close();
});

test("guided demonstration completes both operator perspectives without inventing resolution", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "DEMO MODE", exact: true }).click();
  const guide = page.locator(".guided-demo");
  await guide.getByRole("button", { name: "SIMULATE", exact: true }).click();
  await guide
    .getByRole("button", { name: "PREPARE REPORT", exact: true })
    .click();
  await guide
    .getByRole("button", { name: "FILE ORIGINAL", exact: true })
    .click();
  await guide
    .getByRole("button", { name: "SWITCH OPERATOR", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Acting as operator" }),
  ).not.toHaveValue("kestrel");
  await guide
    .getByRole("button", { name: "RECORD OBJECTION", exact: true })
    .click();
  await expect(page.locator(".coordination-detail")).toContainText(
    "Objection recorded",
  );
  await guide
    .getByRole("button", { name: "RETURN TO KESTREL", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Acting as operator" }),
  ).toHaveValue("kestrel");
  await guide
    .getByRole("button", { name: "RUN OPTIMIZER", exact: true })
    .click();
  await guide.getByRole("button", { name: "ADOPT BEST", exact: true }).click();
  await guide
    .getByRole("button", { name: "FILE REVISED", exact: true })
    .click();
  await expect(guide).toContainText("Original objections remain open");
  await page.screenshot({ path: `${output}/guided-coordination.png` });
  await guide.getByRole("button", { name: "FINISH", exact: true }).click();
  await expect(guide).toHaveCount(0);
  const plans = await (await request.get("/api/plans")).json();
  expect(
    plans.some((p: { name: string }) => p.name === "KLL Cargo-7 · revised"),
  ).toBe(true);
  const notices = await (
    await request.get("/api/notices?operator_id=kestrel")
  ).json();
  expect(
    notices.some(
      (n: { status: string; reply?: string }) =>
        n.status === "objection" && n.reply?.includes("lower-exposure"),
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("an older response cannot overwrite a newly selected landing site", async ({
  page,
  request,
}) => {
  let first = true;
  let started!: () => void;
  const originalStarted = new Promise<void>((r) => {
    started = r;
  });
  await page.route("**/api/assess", async (route) => {
    const response = await route.fetch();
    if (first) {
      first = false;
      started();
      await new Promise((r) => setTimeout(r, 3500));
    }
    await route.fulfill({ response });
  });
  await page.goto("/#setup");
  await originalStarted;
  await page
    .getByRole("spinbutton", { name: "East coordinate in metres" })
    .fill("3250");
  await page.getByRole("button", { name: /CONTINUE TO OPERATIONS/ }).click();
  await expect(page.locator(".coordinate-readout")).toContainText("3.25");
  await expect(page.locator(".hero-metric")).toContainText("€");
  await page.waitForTimeout(3800);
  const response = await request.post("/api/assess", {
    data: {
      lander: {
        label: "Super-heavy lander",
        thrust_kn: 1800,
        hover_s: 30,
        dispersion_m: 50,
      },
      site: { x: 3250, y: -1500 },
    },
  });
  const result = await response.json();
  await expect(page.locator(".mini-metrics")).toContainText(
    result.site.slope_deg.toFixed(1),
  );
  await expect(page.locator(".coordinate-readout")).toContainText("3.25");
});
