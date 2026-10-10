import { defineConfig, devices } from "@playwright/test";

const PORT = process.env.E2E_PORT ?? "8123";
const BASE_URL = `http://127.0.0.1:${PORT}`;

/**
 * E2E runs the real browser against the real FastAPI server with MOCK_LLM=1,
 * serving the static export from frontend/out — same origin, no stubbed
 * network, no provider credentials and no Ollama.
 *
 * REPORTS_DIR is redirected so a test run never touches the developer's runs.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
      testIgnore: /responsive\.spec\.js/,
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 5"] },
      testMatch: /responsive\.spec\.js/,
    },
  ],
  webServer: {
    command: `py -m uvicorn backend.main:app --host 127.0.0.1 --port ${PORT}`,
    cwd: "..",
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      MOCK_LLM: "1",
      // Without a little latency the fixture pipeline finishes before the
      // browser can paint, making every mid-run assertion unreachable.
      MOCK_LLM_DELAY_MS: "600",
      LITELLM_LOCAL_MODEL_COST_MAP: "True",
      REPORTS_DIR: "./.e2e-reports",
    },
  },
});
