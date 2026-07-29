import { NextResponse } from "next/server";
import { requireAccessToken } from "@/lib/session";
import { FILE_MANAGER_SERVICE_URL } from "@/lib/config";

/** Forward a JSON API call to file-manager with the caller's access token. */
export async function proxyFileManagerJson(
  path: string,
  init?: { method?: string; body?: string },
): Promise<NextResponse> {
  const token = await requireAccessToken();
  const res = await fetch(`${FILE_MANAGER_SERVICE_URL}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init?.body,
  });

  if (res.status === 204) return new NextResponse(null, { status: 204 });
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
