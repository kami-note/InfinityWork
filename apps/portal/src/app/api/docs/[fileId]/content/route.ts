import { NextResponse } from "next/server";
import { requireAccessToken } from "@/lib/session";
import { DOCS_SERVICE_URL } from "@/lib/config";

export async function GET(_request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  const token = await requireAccessToken();

  const res = await fetch(`${DOCS_SERVICE_URL}/documents/${fileId}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const body = await res.text();
  return new NextResponse(body, { status: res.status, headers: { "Content-Type": "application/json" } });
}

export async function PUT(request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  const token = await requireAccessToken();
  const payload = await request.text();

  const res = await fetch(`${DOCS_SERVICE_URL}/documents/${fileId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: payload,
  });
  const body = await res.text();
  return new NextResponse(body, { status: res.status, headers: { "Content-Type": "application/json" } });
}
