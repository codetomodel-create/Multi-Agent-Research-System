import { expect, test } from "@playwright/test";

import { primeBrowser, resetRuns } from "./helpers";

/**
 * Budgets are deliberately generous: this runs on developer laptops and CI
 * containers with software rasterisation, so the assertions target what is
 * machine-independent — draw-call count and the absence of unbounded growth.
 *
 * `?perf=1` opts the production build into the otherwise dev-only HUD.
 */
async function gotoWithHud(page, query = "") {
  await primeBrowser(page);
  await page.goto(`/?perf=1${query}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

test.describe("performance", () => {
  test.beforeEach(async ({ request }) => {
    await resetRuns(request);
  });

  test("the scene stays within its draw-call and geometry budget", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("mr_quality", '"high"'));
    await gotoWithHud(page);
    await expect(page.locator('[data-scene="webgl"] canvas')).toBeVisible();

    const hud = page.getByRole("status", { name: "Renderer statistics" });
    await expect(hud).toBeVisible();

    // Instancing is the point: orbs and links are one draw call each, plus the
    // starfield and the post pass.
    await expect
      .poll(async () => {
        const text = (await hud.textContent()) ?? "";
        const match = text.match(/draw calls(\d+)/);
        return match ? Number(match[1]) : null;
      }, { timeout: 25_000 })
      .toBeLessThanOrEqual(30);
  });

  test("quality can be degraded manually and the scene keeps rendering", async ({ page }) => {
    await gotoWithHud(page);
    const hud = page.getByRole("status", { name: "Renderer statistics" });
    await expect(hud).toBeVisible();

    await hud.getByRole("button", { name: "L" }).click();
    await expect(hud.getByRole("button", { name: "L" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('[data-scene="webgl"] canvas')).toBeVisible();

    await page.reload();
    await expect(hud.getByRole("button", { name: "L" })).toHaveAttribute("aria-pressed", "true");
  });

  test("navigating between views does not grow the JS heap without bound", async ({ page }) => {
    await gotoWithHud(page);

    const sample = () =>
      page.evaluate(() => (performance.memory ? performance.memory.usedJSHeapSize : 0));

    // Warm up, then churn the views that mount and unmount the heaviest trees.
    for (let i = 0; i < 3; i += 1) {
      await page.getByRole("button", { name: "Compare" }).first().click();
      await page.getByRole("button", { name: "Dashboard" }).first().click();
    }
    const before = await sample();
    test.skip(before === 0, "performance.memory is unavailable in this browser");

    for (let i = 0; i < 12; i += 1) {
      await page.getByRole("button", { name: "Compare" }).first().click();
      await page.getByRole("button", { name: "Telemetry" }).first().click();
      await page.getByRole("button", { name: "Dashboard" }).first().click();
    }

    const after = await sample();
    // A leak shows up as multiples, not percentages; 2x headroom catches the
    // real failure mode (undisposed geometries or listeners per mount).
    expect(after).toBeLessThan(before * 2 + 8_000_000);
  });

  test("the canvas releases its WebGL context when switched off", async ({ page }) => {
    await gotoWithHud(page);
    await expect(page.locator('[data-scene="webgl"] canvas')).toBeVisible();

    await page.getByRole("checkbox", { name: "3D canvas" }).uncheck();
    await expect(page.locator('[data-scene="webgl"]')).toHaveCount(0);
    await expect(page.locator("canvas")).toHaveCount(0);
  });
});
