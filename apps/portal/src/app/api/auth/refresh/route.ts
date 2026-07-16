import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { AUTH_SERVICE_URL, REFRESH_TOKEN_COOKIE } from "@/lib/config";
import { setAuthCookies, clearAuthCookies } from "@/lib/auth-cookies";

export async function POST() {
  const store = await cookies();
  const refreshToken = store.get(REFRESH_TOKEN_COOKIE)?.value;
  if (!refreshToken) return NextResponse.json({ error: "no_refresh_token" }, { status: 401 });

  const res = await fetch(`${AUTH_SERVICE_URL}/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });

  if (!res.ok) {
    const response = NextResponse.json({ error: "invalid_refresh_token" }, { status: 401 });
    clearAuthCookies(response);
    return response;
  }

  const { accessToken, refreshToken: newRefreshToken } = await res.json();
  const response = NextResponse.json({ status: "ok" });
  setAuthCookies(response, { accessToken, refreshToken: newRefreshToken });
  return response;
}
