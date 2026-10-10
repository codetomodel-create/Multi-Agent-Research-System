import { expect } from "@playwright/test";

/** Removes every run so each spec starts from a known-empty dashboard. */
export async function resetRuns(request) {
  const res = await request.get("/api/runs");
  const runs = await res.json();
  await Promise.all(runs.map((r) => request.delete(`/api/runs/${r.task_id}`)));
}

/** Launches a run through the API and waits for the pipeline to finish. */
export async function seedRun(request, topic = "Coffee Shop", location = "Brooklyn") {
  const res = await request.post("/api/research", {
    data: { idea: topic, location, enable_web_search: false },
  });
  expect(res.ok()).toBeTruthy();
  const { task_id: taskId } = await res.json();

  await expect
    .poll(
      async () => (await (await request.get(`/api/runs/${taskId}/progress`)).json()).status,
      { timeout: 45_000, message: `run ${taskId} never reached a terminal state` },
    )
    .toBe("success");

  return taskId;
}

/**
 * Skips the first-visit tour and pins a low render quality.
 *
 * Values are only seeded when absent: this script re-runs on every navigation,
 * so overwriting would defeat any test that asserts a preference survives a
 * reload.
 */
export async function primeBrowser(page) {
  await page.addInitScript(() => {
    const seed = (key, value) => {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
    };
    seed("mr_tour_done", "true");
    seed("mr_theme", '"dark"');
    seed("mr_quality", '"low"');
  });
}

export async function gotoApp(page) {
  await primeBrowser(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}
