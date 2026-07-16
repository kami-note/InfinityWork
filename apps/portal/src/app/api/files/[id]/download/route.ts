import { NextResponse } from "next/server";
import { requireAccessToken } from "@/lib/session";
import { FILE_MANAGER_SERVICE_URL } from "@/lib/config";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = await requireAccessToken();
  const disposition = new URL(request.url).searchParams.get("disposition");
  const qs = disposition === "inline" ? "?disposition=inline" : "";

  const res = await fetch(`${FILE_MANAGER_SERVICE_URL}/files/${id}/download${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok || !res.body) {
    return NextResponse.json({ error: "download_failed" }, { status: res.status || 500 });
  }

  return new NextResponse(res.body, {
    headers: {
      "Content-Type": res.headers.get("content-type") ?? "application/octet-stream",
      "Content-Disposition": res.headers.get("content-disposition") ?? "attachment",
    },
  });
}
