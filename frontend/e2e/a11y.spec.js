import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { gotoApp, primeBrowser, resetRuns, seedRun } from "./helpers";

const THEMES = ["dark", "light", "solarized"];

test.describe("accessibility", () => {
  test.beforeEach(async ({ request }) => {
    await resetRuns(request);
  });

  for (const theme of THEMES) {
    test(`axe reports no critical or serious issues (${theme})`, async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem("mr_theme", JSON.stringify(t)), theme);
      await gotoApp(page);

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();

      const blocking = results.violations.filter((v) =>
        ["critical", "serious"].includes(v.impact),
      );
      expect(
        blocking,
        blocking.map((v) => `${v.id}: ${v.help}`).join("\n"),
      ).toEqual([]);
    });
  }

  test("report view passes axe in every theme", async ({ page, request }) => {
    const taskId = await seedRun(request, "Accessibility Probe", "Dublin");

    for (const theme of THEMES) {
      await page.addInitScript((t) => localStorage.setItem("mr_theme", JSON.stringify(t)), theme);
      await primeBrowser(page);
      await page.goto(`/#run=${taskId}&tab=summary`);
      await expect(page.getByRole("heading", { name: /C-Suite Strategic Outlook/ })).toBeVisible();

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      const blocking = results.violations.filter((v) =>
        ["critical", "serious"].includes(v.impact),
      );
      expect(blocking, `${theme}: ${blocking.map((v) => v.id).join(", ")}`).toEqual([]);
    }
  });

  test("skip link is the first tab stop and moves focus to main", async ({ page }) => {
    await gotoApp(page);
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main")).toBeVisible();
  });

  test("the whole journey is reachable by keyboard", async ({ page }) => {
    await gotoApp(page);

    await page.keyboard.press("Control+k");
    await page.keyboard.type("new research");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Configure market research" })).toBeVisible();

    await page.getByLabel("Business idea").focus();
    await page.keyboard.type("Keyboard Probe");
    await page.keyboard.press("Enter");

    await expect(page.getByRole("heading", { name: "Pipeline telemetry" })).toBeVisible();
  });

  test("pipeline status is announced through aria-live", async ({ page }) => {
    await gotoApp(page);
    const live = page.locator('[role="status"][aria-live="polite"]').first();
    await expect(live).toBeAttached();

    await page.getByRole("button", { name: "New research" }).first().click();
    await page.getByLabel("Business idea").fill("Announcement Probe");
    await page.getByRole("button", { name: /launch agent pipeline/i }).click();

    await expect(live).toContainText("Run queued for Announcement Probe");
  });

  test("focus is trapped in the settings drawer and returned on close", async ({ page }) => {
    await gotoApp(page);
    const opener = page.getByRole("button", { name: "Settings" }).first();
    await opener.click();

    const drawer = page.getByRole("dialog", { name: "Model and provider settings" });
    await expect(drawer).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test("reduced motion turns the animation loop off, not just down", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    await gotoApp(page);

    const canvas = page.locator('[data-scene="webgl"] canvas');
    await expect(canvas).toBeVisible();

    // The scene chunk is lazy-loaded, so let it land and settle before the
    // first sample — otherwise this compares an empty canvas to a drawn one.
    await page.waitForTimeout(2500);

    // frameloop="demand" means nothing repaints between events, so two samples
    // a second apart must be pixel-identical.
    const first = await canvas.screenshot();
    await page.waitForTimeout(1500);
    const second = await canvas.screenshot();
    expect(Buffer.compare(first, second)).toBe(0);

    await context.close();
  });

  test("canvas-off preference is honoured across sessions", async ({ page }) => {
    await gotoApp(page);
    await expect(page.locator('[data-scene="webgl"]')).toBeVisible();

    await page.getByRole("checkbox", { name: "3D canvas" }).uncheck();
    await expect(page.locator('[data-scene="static"]')).toBeVisible();

    await page.reload();
    await expect(page.locator('[data-scene="static"]')).toBeVisible();
    await expect(page.locator('[data-scene="webgl"]')).toHaveCount(0);
  });
});
