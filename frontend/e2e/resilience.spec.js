import { expect, test } from "@playwright/test";

import { gotoApp, resetRuns, seedRun } from "./helpers";

test.describe("resilience", () => {
  test.beforeEach(async ({ request }) => {
    await resetRuns(request);
  });

  test("a dead backend shows the persistent banner with a retry", async ({ page }) => {
    await gotoApp(page);
    await expect(page.getByText("Backend connected")).toBeVisible();

    await page.route("**/api/**", (route) => route.abort("failed"));
    await page.getByRole("button", { name: "Refresh" }).click();

    await expect(page.getByRole("alert").filter({ hasText: "History unavailable" })).toBeVisible();

    await page.unroute("**/api/**");
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "History unavailable" })).toBeHidden();
  });

  test("a 500 on the report surfaces an inline error with recovery", async ({ page, request }) => {
    const taskId = await seedRun(request, "Ice Cream", "Naples");
    await page.route(`**/api/runs/${taskId}/report`, (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: '{"detail":"boom"}' }),
    );

    await gotoApp(page);
    await page.goto(`/#run=${taskId}&tab=summary`);
    await page.getByRole("button", { name: "Compare" }).first().click();
    await page.getByRole("button", { name: "Dashboard" }).first().click();
    await page.getByRole("button", { name: "Report" }).first().click();

    await expect(page.getByText("Report unavailable.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  test("malformed JSON from the API is reported, not swallowed", async ({ page }) => {
    await page.route("**/api/runs", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "{not json" }),
    );
    await gotoApp(page);
    await expect(page.getByRole("alert").filter({ hasText: "malformed" })).toBeVisible();
  });

  test("an empty report body does not crash the report view", async ({ page, request }) => {
    const taskId = await seedRun(request, "Bakery", "Vienna");
    await page.route(`**/api/runs/${taskId}/report`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          topic: "Bakery",
          title: "Empty Report",
          executive_summary: "",
          market_overview: "",
          competitor_analysis: "",
          swot_analysis: "",
          strategic_recommendations: "",
          critique_notes: "",
        }),
      }),
    );

    await gotoApp(page);
    await page.goto(`/#run=${taskId}&tab=summary`);
    await expect(page.getByRole("heading", { name: "Empty Report" })).toBeVisible();
    await expect(page.getByText("Nothing was written for this section.").first()).toBeVisible();
  });

  test("rapid double submit creates exactly one run", async ({ page, request }) => {
    await gotoApp(page);
    await page.getByRole("button", { name: "New research" }).first().click();
    await page.getByLabel("Business idea").fill("Double Submit Probe");
    await page.getByRole("checkbox", { name: /web search/i }).uncheck();

    const button = page.getByRole("button", { name: /launch agent pipeline/i });
    await button.click();
    // The form is swapped for the tracker the instant the task is queued, so a
    // second click has nothing to hit — that is the guarantee under test.
    await expect(page.getByRole("heading", { name: "Pipeline telemetry" })).toBeVisible();

    await expect
      .poll(async () => {
        const runs = await (await request.get("/api/runs")).json();
        return runs.filter((r) => r.topic.includes("Double Submit Probe")).length;
      })
      .toBe(1);
  });

  test("cancelling mid-run is reflected in the UI and the API", async ({ page, request }) => {
    await gotoApp(page);
    await page.getByRole("button", { name: "New research" }).first().click();
    await page.getByLabel("Business idea").fill("Cancel Probe");
    await page.getByRole("button", { name: /launch agent pipeline/i }).click();
    await expect(page.getByRole("heading", { name: "Pipeline telemetry" })).toBeVisible();

    // The control only exists while the run is in flight, which is exactly the
    // state under test.
    await page.getByRole("button", { name: "Cancel run" }).click();
    await expect(page.getByText("Cancellation signal sent", { exact: true })).toBeVisible();
    await expect(page.getByText("Cancellation signal sent. Aborting...")).toBeVisible();

    await expect
      .poll(async () => {
        const runs = await (await request.get("/api/runs")).json();
        return runs.find((r) => r.topic.includes("Cancel Probe"))?.status;
      }, { timeout: 45_000 })
      .toBe("cancelled");

    await expect(page.getByRole("button", { name: "Cancel run" })).toBeHidden();
  });

  test("browser back and forward preserve the deep-linked tab", async ({ page, request }) => {
    const taskId = await seedRun(request, "Juice Bar", "Valencia");
    await gotoApp(page);

    await page.goto(`/#run=${taskId}&tab=summary`);
    await expect(page.getByRole("tab", { name: "Executive Summary" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await page.goto(`/#run=${taskId}&tab=swot`);
    await expect(page.getByRole("tab", { name: "SWOT Analysis" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await page.goBack();
    await expect(page.getByRole("heading", { name: /C-Suite Strategic Outlook/ })).toBeVisible();
    await page.goForward();
    await expect(page.getByRole("heading", { name: /C-Suite Strategic Outlook/ })).toBeVisible();
  });

  test("deleting a run is optimistic and rolls back on failure", async ({ page, request }) => {
    await seedRun(request, "Rollback Probe", "Oslo");
    await gotoApp(page);
    await expect(page.getByText("Rollback Probe in Oslo")).toBeVisible();

    await page.route("**/api/runs/*", (route) =>
      route.request().method() === "DELETE"
        ? route.fulfill({ status: 500, contentType: "application/json", body: '{"detail":"nope"}' })
        : route.fallback(),
    );

    await page.getByRole("button", { name: /Delete run/ }).first().click();
    await expect(page.getByText("Delete failed")).toBeVisible();
    await expect(page.getByText("Rollback Probe in Oslo")).toBeVisible();
  });
});
