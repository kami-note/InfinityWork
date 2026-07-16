import { defineConfig, devices } from "@playwright/test";

/**
 * Assumes the stack is already running (`make dev`). We don't manage the
 * Docker services or the portal's dev server here — a webServer block would
 * mean Playwright owns a process that also depends on Postgres/auth/
 * file-manager being up, which is more coupling than it's worth for a
 * single-developer self-hosted project.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false, // tests share one real Postgres-backed account; parallel runs would race on shared state
  workers: 1, // `next dev` compiles routes on demand — concurrent workers hitting cold routes at once caused login timeouts
  retries: 0,
  timeout: 45000, // `next dev` compiling a route on its first hit in a run can eat a big chunk of the default 30s on its own

  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
