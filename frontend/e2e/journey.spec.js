import { expect, test } from "@playwright/test";

import { gotoApp, resetRuns, seedRun } from "./helpers";

test.describe("core user journey", () => {
  test.beforeEach(async ({ request }) => {
    await resetRuns(request);
  });

  test("submit research, watch progress, then read the report", async ({ page }) => {
    await gotoApp(page);

    await page.getByRole("button", { name: "New research" }).first().click();
    await page.getByLabel("Business idea").fill("Electric scooters");
    await page.getByLabel("Target location").fill("Lisbon");
    await page.getByRole("checkbox", { name: /web search/i }).uncheck();
    await page.getByRole("button", { name: /launch agent pipeline/i }).click();

    // Optimistic submit: the tracker replaces the form immediately, with no
    // blocking spinner in between.
    await expect(page.getByRole("heading", { name: "Pipeline telemetry" })).toBeVisible();

    // The run then resolves to the report on its own.
    await expect(page.getByRole("heading", { name: /C-Suite Strategic Outlook/ })).toBeVisible({
      timeout: 45_000,
    });
    await expect(page.getByText("Electric scooters in Lisbon").first()).toBeVisible();
  });

  test("the stage table reports per-stage duration, tokens and cost", async ({ page, request }) => {
    const taskId = await seedRun(request, "Stage Table Probe", "Oslo");
    await gotoApp(page);
    await page.goto(`/#run=${taskId}&tab=summary`);
    await page.getByRole("button", { name: "Telemetry" }).first().click();

    for (const stage of ["Coordinate", "Research", "Synthesise", "Audit"]) {
      await expect(page.getByText(stage, { exact: true })).toBeVisible();
    }
    await expect(page.getByTitle("Tokens used").first()).toBeVisible();
    await expect(page.getByTitle("Estimated cost").first()).toBeVisible();

    // Scrubbing back must clip the log to that point in the run.
    const logLines = page.locator(".log-line");
    const total = await logLines.count();
    expect(total).toBeGreaterThan(2);
    await page.getByLabel("Replay position").fill("2");
    await expect(logLines).toHaveCount(2);
    await page.getByRole("button", { name: "Resume live" }).click();
    await expect(logLines).toHaveCount(total);
  });

  test("every report tab renders its content", async ({ page, request }) => {
    const taskId = await seedRun(request, "Solar Panels", "Austin");
    await gotoApp(page);
    await page.goto(`/#run=${taskId}&tab=summary`);

    await expect(page.getByRole("heading", { name: /C-Suite Strategic Outlook/ })).toBeVisible();

    const expectations = [
      ["Executive Summary", "Strategic Recommendations"],
      ["Market & Competitors", "Competitive Landscape"],
      ["SWOT Analysis", "SWOT Analysis"],
      ["Critique & Refinements", "Critique & Refinement Notes"],
      ["Raw JSON", "Raw JSON"],
    ];

    for (const [tabName, heading] of expectations) {
      await page.getByRole("tab", { name: tabName }).click();
      await expect(page.getByRole("tabpanel").getByRole("heading", { name: heading })).toBeVisible();
    }
  });

  test("theme switching re-themes every surface", async ({ page }) => {
    await gotoApp(page);
    const root = page.locator("html");

    for (const theme of ["light", "solarized", "dark"]) {
      await page.getByRole("button", { name: `${theme} theme` }).click();
      await expect(root).toHaveAttribute("data-theme", theme);
    }

    // The choice survives a reload.
    await page.getByRole("button", { name: "light theme" }).click();
    await page.reload();
    await expect(root).toHaveAttribute("data-theme", "light");
  });

  test("command palette drives navigation from the keyboard alone", async ({ page }) => {
    await gotoApp(page);

    await page.keyboard.press("Control+k");
    const palette = page.getByRole("dialog", { name: "Command palette" });
    await expect(palette).toBeVisible();

    await page.keyboard.type("compare");
    await page.keyboard.press("Enter");
    await expect(palette).toBeHidden();
    await expect(page.getByRole("heading", { name: "Run comparison" })).toBeVisible();

    await page.keyboard.press("Control+k");
    await page.keyboard.type("solarized");
    await page.keyboard.press("Enter");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "solarized");

    await page.keyboard.press("Control+k");
    await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Command palette" })).toBeHidden();
  });

  test("report exports as markdown and json", async ({ page, request }) => {
    const taskId = await seedRun(request, "Urban Farming", "Detroit");
    await gotoApp(page);
    await page.goto(`/#run=${taskId}&tab=summary`);
    await expect(page.getByRole("heading", { name: /C-Suite Strategic Outlook/ })).toBeVisible();

    for (const [label, extension] of [["Markdown", "md"], ["JSON", "json"]]) {
      const downloadPromise = page.waitForEvent("download");
      await page.getByRole("button", { name: label, exact: false }).first().click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toMatch(new RegExp(`\\.${extension}$`));
    }
  });

  test("two runs can be compared side by side", async ({ page, request }) => {
    const first = await seedRun(request, "Bike Rental", "Amsterdam");
    const second = await seedRun(request, "Bookstore", "Porto");

    await gotoApp(page);
    await page.getByRole("button", { name: "Compare" }).first().click();

    await page.getByLabel("Run A").selectOption(first);
    await page.getByLabel("Run B").selectOption(second);

    await expect(page.getByRole("heading", { name: "SWOT Analysis" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Competitor Landscape" })).toBeVisible();
    await expect(page.getByText("differs").first()).toBeVisible();
  });

  test("reading mode dims the canvas and stays keyboard-dismissible", async ({ page, request }) => {
    const taskId = await seedRun(request, "Coworking Space", "Berlin");
    await gotoApp(page);
    await page.goto(`/#run=${taskId}&tab=summary`);

    await page.getByRole("button", { name: "Read", exact: true }).click();
    const reader = page.getByRole("dialog", { name: "Reading mode" });
    await expect(reader).toBeVisible();
    await expect(reader.getByRole("heading", { name: "Strategic Recommendations" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(reader).toBeHidden();
  });

  test("reload mid-session restores the deep-linked run", async ({ page, request }) => {
    const taskId = await seedRun(request, "Pet Grooming", "Seattle");
    await gotoApp(page);
    await page.goto(`/#run=${taskId}&tab=swot`);
    await expect(page.getByRole("tab", { name: "SWOT Analysis" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await page.reload();
    await expect(page.getByRole("tab", { name: "SWOT Analysis" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByRole("heading", { name: /C-Suite Strategic Outlook/ })).toBeVisible();
  });
});
