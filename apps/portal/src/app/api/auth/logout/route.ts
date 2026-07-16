import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { AUTH_SERVICE_URL, ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "@/lib/config";

export async function POST() {
  const store = await cookies();
  const accessToken = store.get(ACCESS_TOKEN_COOKIE)?.value;

  if (accessToken) {
    await fetch(`${AUTH_SERVICE_URL}/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    }).catch(() => {});
  }

  const response = NextResponse.json({ status: "ok" });
  response.cookies.delete(ACCESS_TOKEN_COOKIE);
  response.cookies.delete(REFRESH_TOKEN_COOKIE);
  return response;
}
