import { NextRequest, NextResponse } from "next/server";
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE, AUTH_SERVICE_URL } from "@/lib/config";
import { setAuthCookies, clearAuthCookies } from "@/lib/auth-cookies";
import { decodeJwtExpiry } from "@/lib/jwt-decode";

const PUBLIC_PATHS = ["/login", "/s"];
const REFRESH_MARGIN_SECONDS = 120; // refresh a bit before expiry, not exactly at it

async function refreshSession(refreshToken: string): Promise<{ accessToken: string; refreshToken: string } | null> {
  try {
    const res = await fetch(`${AUTH_SERVICE_URL}/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Silently renews the access token on page navigation when it's close to
 * expiring, so a 15-minute access-token TTL doesn't mean the user gets
 * bounced to /login every 15 minutes. This only covers page navigations —
 * long-lived pages that just poll an API (the docs editor autosaving, for
 * instance) never hit middleware again, so SessionKeepAlive.tsx covers that
 * case with its own periodic refresh call.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value;

  if (!accessToken && !refreshToken) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const exp = accessToken ? decodeJwtExpiry(accessToken) : null;
  const nowSeconds = Date.now() / 1000;
  const isExpired = exp === null || exp <= nowSeconds;
  const needsRefresh = isExpired || exp - nowSeconds < REFRESH_MARGIN_SECONDS;

  if (!needsRefresh) {
    return NextResponse.next();
  }

  if (!refreshToken) {
    // No refresh token to fall back on: an already-expired access token
    // means the backend would reject every request anyway, so send the
    // user to /login now instead of letting a broken session limp along.
    // A token that's merely *close* to expiring still works for this
    // request — let it through.
    if (isExpired) {
      const response = NextResponse.redirect(new URL("/login", request.url));
      clearAuthCookies(response);
      return response;
    }
    return NextResponse.next();
  }

  const refreshed = await refreshSession(refreshToken);
  if (!refreshed) {
    if (!accessToken) {
      const response = NextResponse.redirect(new URL("/login", request.url));
      clearAuthCookies(response);
      return response;
    }
    // Refresh failed but the current access token hasn't expired yet —
    // let this request through and try again on the next navigation.
    return NextResponse.next();
  }

  const response = NextResponse.next();
  setAuthCookies(response, refreshed);
  return response;
}

export const config = {
  // Excludes /api/* too: every API route already enforces auth itself via
  // requireAccessToken(), and Next.js's middleware runs in the Edge runtime,
  // which silently truncates large request bodies — routing big uploads
  // through it broke file uploads above ~10MB with no useful error.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/).*)"],
};
