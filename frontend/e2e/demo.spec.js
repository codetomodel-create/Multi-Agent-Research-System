import { expect, test } from "@playwright/test";

import { resetRuns } from "./helpers";

test.describe("LinkedIn demo mode", () => {
  test.beforeEach(async ({ request }) => {
    await resetRuns(request);
  });

  test("?demo=1 skips the tour, prefills launch, and seeds Compare", async ({ page }) => {
    await page.goto("/?demo=1");

    await expect(page.getByRole("heading", { name: "Research command center" })).toBeVisible();
    await expect(page.getByText("LinkedIn demo", { exact: true })).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Guided tour" })).toHaveCount(0);
    await expect(page.getByLabel("LinkedIn demo speaking cue")).toBeVisible();
    await expect(page.getByText("One idea in. A full market report out.")).toBeVisible();

    await expect(page.getByRole("button", { name: "Dashboard" })).toContainText("2");

    await page.getByRole("button", { name: "New research" }).first().click();
    await expect(page.getByLabel("Business idea")).toHaveValue(
      "AI-powered specialty coffee subscription for remote workers",
    );
    await expect(page.getByLabel("Target location")).toHaveValue("Bengaluru");
    await expect(page.getByText("Business idea and optional city.")).toBeVisible();

    await page.getByRole("button", { name: "Compare" }).first().click();
    await expect(page.getByRole("heading", { name: "Run comparison" })).toBeVisible();
    await expect(page.getByLabel("Run A")).toHaveValue("linkedin-demo-remote");
    await expect(page.getByLabel("Run B")).toHaveValue("linkedin-demo-office");
    await expect(page.getByRole("heading", { name: "SWOT Analysis" })).toBeVisible();
  });
});
