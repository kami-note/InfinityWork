import { NextRequest, NextResponse } from "next/server";
import { ACCESS_TOKEN_COOKIE } from "@/lib/config";

const PUBLIC_PATHS = ["/login"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const hasToken = request.cookies.has(ACCESS_TOKEN_COOKIE);
  if (!hasToken) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  // Excludes /api/* too: every API route already enforces auth itself via
  // requireAccessToken(), and Next.js's middleware runs in the Edge runtime,
  // which silently truncates large request bodies — routing big uploads
  // through it broke file uploads above ~10MB with no useful error.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/).*)"],
};
