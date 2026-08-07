import { FILE_MANAGER_SERVICE_URL } from "@/lib/config";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string; fileId: string }> },
) {
  const { token, fileId } = await params;
  const res = await fetch(
    `${FILE_MANAGER_SERVICE_URL}/public/links/${encodeURIComponent(token)}/files/${encodeURIComponent(fileId)}/thumbnail`,
  );

  if (!res.ok) {
    return new NextResponse(null, { status: res.status });
  }

  return new NextResponse(res.body, {
    status: res.status,
    headers: {
      "Content-Type": res.headers.get("content-type") ?? "image/jpeg",
      "Cache-Control": res.headers.get("cache-control") ?? "public, max-age=31536000, immutable",
    },
  });
}
