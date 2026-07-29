import { proxyFileManagerJson } from "@/lib/proxy-file-manager";

type Ctx = { params: Promise<{ id: string }> };

/** Kick off async assemble; returns 202. Poll /status afterward. */
export async function POST(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return proxyFileManagerJson(`/uploads/${id}/complete`, { method: "POST" });
}
