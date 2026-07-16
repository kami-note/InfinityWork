import Fastify from "fastify";
import cors from "@fastify/cors";
import { PERMISSIONS, createAuthPlugin } from "@infinitywork/shared";
import { createDocumentSchema, saveContentSchema } from "./schemas.js";
import * as documentService from "../application/document-service.js";

const JWT_SECRET = process.env.JWT_SECRET!;
if (!JWT_SECRET) throw new Error("JWT_SECRET is required");

const app = Fastify({ logger: true });

await app.register(cors, { origin: process.env.PORTAL_ORIGIN ?? "http://portal:3000" });
await app.register(createAuthPlugin(JWT_SECRET));

// The docs service re-verifies the JWT locally (via requirePermission) but
// still forwards the raw bearer token to file-manager on every call, so
// file-manager's own RBAC + per-file ACL checks run against the real caller
// identity instead of the docs service impersonating them.
function bearerToken(request: { headers: { authorization?: string } }): string {
  return request.headers.authorization!.slice("Bearer ".length);
}

app.get("/health", async () => ({ status: "ok" }));

app.post(
  "/documents",
  { preHandler: app.requirePermission(PERMISSIONS.docs.document.create) },
  async (request, reply) => {
    const body = createDocumentSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_request", details: body.error.flatten() });

    const file = await documentService.createDocument(
      bearerToken(request),
      body.data.name,
      body.data.folderId ?? null,
    );
    return file;
  },
);

app.get("/documents/:fileId", { preHandler: app.requireAuth }, async (request) => {
  const { fileId } = request.params as { fileId: string };
  const content = await documentService.getDocumentContent(bearerToken(request), fileId);
  return { content };
});

app.put(
  "/documents/:fileId",
  { preHandler: app.requirePermission(PERMISSIONS.docs.document.edit) },
  async (request, reply) => {
    const { fileId } = request.params as { fileId: string };
    const body = saveContentSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_request", details: body.error.flatten() });

    const file = await documentService.saveDocumentContent(bearerToken(request), fileId, body.data.content);
    return file;
  },
);

app.get(
  "/documents/:fileId/export/docx",
  { preHandler: app.requirePermission(PERMISSIONS.docs.document.export) },
  async (request, reply) => {
    const { fileId } = request.params as { fileId: string };
    const docx = await documentService.exportDocumentAsDocx(bearerToken(request), fileId);
    reply.header("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    reply.header("Content-Disposition", `attachment; filename="document-${fileId}.docx"`);
    return reply.send(docx);
  },
);

const port = Number(process.env.PORT ?? 4003);
app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
