import { proxyFileManagerJson } from "@/lib/proxy-file-manager";

type Ctx = { params: Promise<{ id: string }> };

/** Resume info: meta + received chunk indexes. */
export async function GET(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return proxyFileManagerJson(`/uploads/${id}`);
}

/** Cancel an incomplete chunked upload session. */
export async function DELETE(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return proxyFileManagerJson(`/uploads/${id}`, { method: "DELETE" });
}
