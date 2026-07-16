import { NextResponse } from "next/server";
import { requireAccessToken } from "@/lib/session";
import { DOCS_SERVICE_URL } from "@/lib/config";

export async function GET(_request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  const token = await requireAccessToken();

  const res = await fetch(`${DOCS_SERVICE_URL}/documents/${fileId}/export/docx`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok || !res.body) {
    return NextResponse.json({ error: "export_failed" }, { status: res.status || 500 });
  }

  return new NextResponse(res.body, {
    headers: {
      "Content-Type": res.headers.get("content-type") ?? "application/octet-stream",
      "Content-Disposition": res.headers.get("content-disposition") ?? "attachment",
    },
  });
}
