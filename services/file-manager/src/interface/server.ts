import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { PERMISSIONS, createAuthPlugin } from "@infinitywork/shared";
import { LocalStorageProvider } from "../infrastructure/local-storage-provider.js";
import * as folderService from "../application/folder-service.js";
import * as fileService from "../application/file-service.js";
import { requireFileRole, ForbiddenResourceError } from "../application/access-control.js";

const STORAGE_ROOT = process.env.STORAGE_ROOT ?? "/data/storage";
const MAX_UPLOAD_BYTES = Number(process.env.STORAGE_MAX_UPLOAD_BYTES ?? 500 * 1024 * 1024);
const storage = new LocalStorageProvider(STORAGE_ROOT, MAX_UPLOAD_BYTES);

// Prisma maps the `size BigInt` column to a JS bigint, which JSON.stringify
// can't serialize natively. Every response that includes a File would
// otherwise 500 — this is the single place that needs to know about it.
(BigInt.prototype as unknown as { toJSON(): string }).toJSON = function () {
  return this.toString();
};

const app = Fastify({ logger: true });

await app.register(cors, { origin: process.env.PORTAL_ORIGIN ?? "http://portal:3000" });
await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES } });
await app.register(createAuthPlugin(process.env.JWT_SECRET!));

app.get("/health", async () => ({ status: "ok" }));

app.get("/folders", { preHandler: app.requireAuth }, async (request) => {
  const parentId = (request.query as { parentId?: string }).parentId ?? null;
  const [contents, trail] = await Promise.all([
    folderService.listFolderContents(request.user!.sub, parentId),
    folderService.breadcrumb(parentId),
  ]);
  return { ...contents, breadcrumb: trail };
});

app.post(
  "/folders",
  { preHandler: app.requirePermission(PERMISSIONS.files.folder.create) },
  async (request) => {
    const body = request.body as { name: string; parentId?: string | null };
    return folderService.createFolder(request.user!.sub, body.name, body.parentId ?? null);
  },
);

app.patch(
  "/folders/:id",
  { preHandler: app.requirePermission(PERMISSIONS.files.folder.rename) },
  async (request) => {
    const { id } = request.params as { id: string };
    const { name } = request.body as { name: string };
    return folderService.renameFolder(id, name);
  },
);

app.patch(
  "/folders/:id/move",
  { preHandler: app.requirePermission(PERMISSIONS.files.folder.move) },
  async (request) => {
    const { id } = request.params as { id: string };
    const { parentId } = request.body as { parentId: string | null };
    return folderService.moveFolder(id, parentId);
  },
);

app.delete(
  "/folders/:id",
  { preHandler: app.requirePermission(PERMISSIONS.files.folder.delete) },
  async (request) => {
    const { id } = request.params as { id: string };
    return folderService.softDeleteFolder(id);
  },
);

app.post(
  "/files",
  { preHandler: app.requirePermission(PERMISSIONS.files.file.upload) },
  async (request, reply) => {
    const data = await request.file();
    if (!data) return reply.code(400).send({ error: "no_file" });
    const folderId = (data.fields.folderId as { value?: string } | undefined)?.value ?? null;

    try {
      const file = await fileService.uploadFile(storage, {
        ownerId: request.user!.sub,
        folderId,
        name: data.filename,
        mimeType: data.mimetype,
        stream: data.file,
      });
      return file;
    } catch (err) {
      return reply.code(413).send({ error: "upload_too_large" });
    }
  },
);

app.put(
  "/files/:id/content",
  { preHandler: app.requirePermission(PERMISSIONS.files.file.upload) },
  async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await requireFileRole(id, request.user!.sub, "editor");
    } catch (err) {
      if (err instanceof ForbiddenResourceError) return reply.code(403).send({ error: "forbidden" });
      throw err;
    }
    const data = await request.file();
    if (!data) return reply.code(400).send({ error: "no_file" });

    try {
      const file = await fileService.updateFileContent(storage, {
        id,
        mimeType: data.mimetype,
        stream: data.file,
      });
      return file;
    } catch (err) {
      return reply.code(413).send({ error: "upload_too_large" });
    }
  },
);

app.get(
  "/files/:id/download",
  { preHandler: app.requirePermission(PERMISSIONS.files.file.download) },
  async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await requireFileRole(id, request.user!.sub, "viewer");
    } catch (err) {
      if (err instanceof ForbiddenResourceError) return reply.code(403).send({ error: "forbidden" });
      throw err;
    }
    const file = await fileService.getFile(id);
    reply.header("Content-Type", file.mimeType);
    reply.header("Content-Disposition", `attachment; filename="${encodeURIComponent(file.name)}"`);
    return reply.send(storage.read(file.storageKey));
  },
);

app.patch(
  "/files/:id",
  { preHandler: app.requirePermission(PERMISSIONS.files.file.rename) },
  async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await requireFileRole(id, request.user!.sub, "editor");
    } catch (err) {
      if (err instanceof ForbiddenResourceError) return reply.code(403).send({ error: "forbidden" });
      throw err;
    }
    const { name } = request.body as { name: string };
    return fileService.renameFile(id, name);
  },
);

app.patch(
  "/files/:id/move",
  { preHandler: app.requirePermission(PERMISSIONS.files.file.move) },
  async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await requireFileRole(id, request.user!.sub, "editor");
    } catch (err) {
      if (err instanceof ForbiddenResourceError) return reply.code(403).send({ error: "forbidden" });
      throw err;
    }
    const { folderId } = request.body as { folderId: string | null };
    return fileService.moveFile(id, folderId);
  },
);

app.delete(
  "/files/:id",
  { preHandler: app.requirePermission(PERMISSIONS.files.file.delete) },
  async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await requireFileRole(id, request.user!.sub, "owner");
    } catch (err) {
      if (err instanceof ForbiddenResourceError) return reply.code(403).send({ error: "forbidden" });
      throw err;
    }
    return fileService.softDeleteFile(id);
  },
);

app.post(
  "/files/:id/restore",
  { preHandler: app.requirePermission(PERMISSIONS.files.trash.restore) },
  async (request) => {
    const { id } = request.params as { id: string };
    return fileService.restoreFile(id);
  },
);

app.post(
  "/files/:id/share",
  { preHandler: app.requirePermission(PERMISSIONS.files.file.share) },
  async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await requireFileRole(id, request.user!.sub, "owner");
    } catch (err) {
      if (err instanceof ForbiddenResourceError) return reply.code(403).send({ error: "forbidden" });
      throw err;
    }
    const { userId, role } = request.body as { userId: string; role: "owner" | "editor" | "viewer" };
    return fileService.shareFile(id, userId, role);
  },
);

app.get("/trash", { preHandler: app.requireAuth }, async (request) => {
  return fileService.listTrash(request.user!.sub);
});

app.post(
  "/trash/empty",
  { preHandler: app.requirePermission(PERMISSIONS.files.trash.empty) },
  async (request) => {
    return fileService.emptyTrash(storage, request.user!.sub);
  },
);

app.get("/search", { preHandler: app.requireAuth }, async (request) => {
  const { q } = request.query as { q?: string };
  return fileService.searchFiles(request.user!.sub, q ?? "");
});

const port = Number(process.env.PORT ?? 4002);
app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
