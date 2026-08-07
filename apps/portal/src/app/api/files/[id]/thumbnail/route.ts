import { requireAccessToken } from "@/lib/session";
import { FILE_MANAGER_SERVICE_URL } from "@/lib/config";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const token = await requireAccessToken();

  const res = await fetch(`${FILE_MANAGER_SERVICE_URL}/files/${id}/thumbnail`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    // If thumbnail is not ready (404) or any other error, we just return the status.
    // Frontend is responsible for falling back to original image or icon.
    return new NextResponse(null, { status: res.status });
  }

  const responseHeaders: Record<string, string> = {
    "Content-Type": res.headers.get("content-type") ?? "image/jpeg",
    "Cache-Control": res.headers.get("cache-control") ?? "public, max-age=31536000, immutable",
  };

  return new NextResponse(res.body, {
    status: res.status,
    headers: responseHeaders,
  });
}
