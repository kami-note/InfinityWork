import { NextResponse } from "next/server";
import { AUTH_SERVICE_URL, ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "@/lib/config";

/**
 * The only endpoint where the browser's credentials ever leave the portal.
 * auth service response never reaches client JS — tokens are written
 * straight into httpOnly cookies here, which is why XSS in the portal UI
 * still can't exfiltrate them.
 */
export async function POST(request: Request) {
  const { email, password } = await request.json();

  const res = await fetch(`${AUTH_SERVICE_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const { accessToken, refreshToken } = await res.json();
  const response = NextResponse.json({ status: "ok" });

  response.cookies.set(ACCESS_TOKEN_COOKIE, accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 15,
  });
  response.cookies.set(REFRESH_TOKEN_COOKIE, refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  return response;
}
