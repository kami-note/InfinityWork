import { test as base, expect, type APIRequestContext, type Page } from "@playwright/test";

const PORTAL_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const FILE_MANAGER_URL = process.env.E2E_FILE_MANAGER_URL ?? "http://localhost:4002";
const AUTH_URL = process.env.E2E_AUTH_URL ?? "http://localhost:4001";
const EMAIL = process.env.E2E_EMAIL ?? "admin@infinitywork.local";
const PASSWORD = process.env.E2E_PASSWORD ?? "changeme123";

interface Fixtures {
  /** A browser page with a valid session cookie, already past /login. */
  authedPage: Page;
  /** A raw access token — for API setup/teardown that doesn't need a browser. */
  apiToken: string;
  /** An isolated root folder, created before the test and deleted after it —
   * every test that touches files should use this instead of the real
   * "Meus arquivos" root, so runs never risk real user data. */
  testFolder: { id: string; request: APIRequestContext };
}

export const test = base.extend<Fixtures>({
  authedPage: async ({ page }, use) => {
    await page.goto(`${PORTAL_URL}/login`);
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(`${PORTAL_URL}/drive`);
    await use(page);
  },

  apiToken: async ({ playwright }, use) => {
    const request = await playwright.request.newContext();
    const res = await request.post(`${AUTH_URL}/login`, {
      data: { email: EMAIL, password: PASSWORD },
    });
    expect(res.ok(), `auth login failed: ${res.status()} ${await res.text()}`).toBeTruthy();
    const { accessToken } = await res.json();
    await use(accessToken);
    await request.dispose();
  },

  testFolder: async ({ apiToken, playwright }, use, testInfo) => {
    const request = await playwright.request.newContext({
      extraHTTPHeaders: { Authorization: `Bearer ${apiToken}` },
    });
    const name = `__e2e_${testInfo.testId}__`;
    const created = await request.post(`${FILE_MANAGER_URL}/folders`, {
      data: { name, parentId: null },
    });
    expect(created.ok(), `test folder creation failed: ${created.status()}`).toBeTruthy();
    const { id } = await created.json();

    await use({ id, request });

    // Soft-delete + empty trash so the folder and everything inside it
    // (including any subfolders/files the test created) is fully gone —
    // not just hidden — leaving nothing behind for the next run.
    await request.delete(`${FILE_MANAGER_URL}/folders/${id}`);
    await request.post(`${FILE_MANAGER_URL}/trash/empty`);
    await request.dispose();
  },
});

export { expect };
export { PORTAL_URL, FILE_MANAGER_URL, AUTH_URL };
