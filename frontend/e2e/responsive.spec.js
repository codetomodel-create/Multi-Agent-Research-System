import { expect, test } from "@playwright/test";

import { gotoApp } from "./helpers";

/**
 * Runs under the Pixel 5 project. At this size the canvas must degrade to the
 * static gradient so the GPU is never engaged on a low-power device.
 */
test.describe("responsive", () => {
  test("360px viewport stacks the shell and drops WebGL", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await gotoApp(page);

    await expect(page.locator('[data-scene="static"]')).toBeVisible();
    await expect(page.locator('[data-scene="webgl"]')).toHaveCount(0);

    const shell = page.locator(".app-shell");
    await expect(shell).toHaveCSS("grid-template-columns", /^\d+(\.\d+)?px$/);

    // Nothing may overflow horizontally at the narrowest supported width.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("navigation and the launch form remain usable on touch", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await gotoApp(page);

    await page.getByRole("button", { name: "New research" }).first().click();
    await expect(page.getByLabel("Business idea")).toBeVisible();
    await page.getByLabel("Business idea").fill("Mobile Probe");
    await expect(page.getByRole("button", { name: /launch agent pipeline/i })).toBeVisible();
  });

  test("tablet width keeps the rail and content side by side", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    await gotoApp(page);
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
    await expect(page.locator("#main")).toBeVisible();
  });
});
