import { NextResponse } from "next/server";
import { requireAccessToken } from "@/lib/session";
import { FILE_MANAGER_SERVICE_URL } from "@/lib/config";

/**
 * Only the portal is reachable from the browser, so binary upload/download
 * traffic has to pass through here even though the heavy lifting (streaming
 * to disk, checksum) happens in the file-manager service. We forward the
 * multipart body as-is instead of buffering it in the route handler.
 */
export async function POST(request: Request) {
  const token = await requireAccessToken();

  const res = await fetch(`${FILE_MANAGER_SERVICE_URL}/files`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": request.headers.get("content-type") ?? "",
    },
    body: request.body,
    duplex: "half",
  } as RequestInit);

  const body = await res.text();
  return new NextResponse(body, { status: res.status, headers: { "Content-Type": "application/json" } });
}
