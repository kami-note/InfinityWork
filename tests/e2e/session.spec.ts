import { test, expect, PORTAL_URL } from "./fixtures";

function fakeJwtWithExpiry(expiresInSeconds: number): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ sub: "test", exp: Math.floor(Date.now() / 1000) + expiresInSeconds }),
  ).toString("base64url");
  // Signature doesn't need to be valid — middleware only decodes the
  // payload to decide whether a refresh is due, it never verifies this
  // token itself. The refresh call it makes uses the real refresh token.
  return `${header}.${payload}.fake-signature`;
}

test.describe("Sessão persistente", () => {
  test("middleware renova o access token silenciosamente quando perto de expirar", async ({
    authedPage: page,
  }) => {
    const cookies = await page.context().cookies();
    const refreshCookie = cookies.find((c) => c.name === "iw_refresh_token");
    expect(refreshCookie, "login deveria ter setado iw_refresh_token").toBeTruthy();

    // Swap in an access token that looks like it's about to expire, but
    // keep the real refresh token — this is exactly the state a real
    // session is in ~13 minutes after login.
    await page.context().addCookies([
      {
        name: "iw_access_token",
        value: fakeJwtWithExpiry(30), // well inside the 120s refresh margin
        domain: "localhost",
        path: "/",
        httpOnly: true,
      },
    ]);

    await page.goto(`${PORTAL_URL}/drive`);
    // If the refresh hadn't happened, the app would still work (the fake
    // token isn't actually expired yet) — the real assertion is that
    // middleware replaced it with a freshly-issued one.
    await expect(page).toHaveURL(/\/drive/);

    const cookiesAfter = await page.context().cookies();
    const accessAfter = cookiesAfter.find((c) => c.name === "iw_access_token");
    expect(accessAfter?.value).not.toContain("fake-signature");
  });

  test("access token realmente expirado + refresh token ausente redireciona pro login", async ({ page }) => {
    await page.context().addCookies([
      {
        name: "iw_access_token",
        value: fakeJwtWithExpiry(-60), // already expired
        domain: "localhost",
        path: "/",
        httpOnly: true,
      },
    ]);
    await page.goto(`${PORTAL_URL}/drive`);
    await expect(page).toHaveURL(/\/login/);
  });

  test("POST /api/auth/refresh emite um novo access token válido", async ({ authedPage: page }) => {
    const before = (await page.context().cookies()).find((c) => c.name === "iw_access_token")?.value;

    const res = await page.request.post("/api/auth/refresh");
    expect(res.ok()).toBeTruthy();

    const after = (await page.context().cookies()).find((c) => c.name === "iw_access_token")?.value;
    expect(after).toBeTruthy();
    expect(after).not.toBe(before);
  });
});
