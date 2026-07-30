import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { PERMISSIONS, createAuthPlugin } from "@infinitywork/shared";
import { LocalStorageProvider, UploadTooLargeError } from "../infrastructure/local-storage-provider.js";
import * as folderService from "../application/folder-service.js";
import * as fileService from "../application/file-service.js";
import { copyFolder } from "../application/copy-service.js";
import { requireFileRole, ForbiddenResourceError } from "../application/access-control.js";
import { ChunkedUploadError, ChunkedUploadService } from "../application/chunked-upload-service.js";

const STORAGE_ROOT = process.env.STORAGE_ROOT ?? "/data/storage";
const MAX_UPLOAD_BYTES = Number(process.env.STORAGE_MAX_UPLOAD_BYTES ?? 500 * 1024 * 1024);
const storage = new LocalStorageProvider(STORAGE_ROOT, MAX_UPLOAD_BYTES);
const chunkedUploads = new ChunkedUploadService(STORAGE_ROOT, storage, { maxUploadBytes: MAX_UPLOAD_BYTES });

// Prisma maps the `size BigInt` column to a JS bigint, which JSON.stringify
// can't serialize natively. Every response that includes a File would
// otherwise 500 — this is the single place that needs to know about it.
(BigInt.prototype as unknown as { toJSON(): string }).toJSON = function () {
  return this.toString();
};

// Fastify's own default bodyLimit is 1MB and applies to the raw request
// regardless of @fastify/multipart's `limits.fileSize` — without this,
// every upload above ~1MB was rejected before multipart even saw it,
// no matter what STORAGE_MAX_UPLOAD_BYTES said.
const app = Fastify({ logger: true, bodyLimit: MAX_UPLOAD_BYTES });

await app.register(cors, { origin: process.env.PORTAL_ORIGIN ?? "http://portal:3000" });
await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES } });
await app.register(createAuthPlugin(process.env.JWT_SECRET!));

// Chunk PUTs send raw bytes — pass the stream through instead of buffering.
app.addContentTypeParser("application/octet-stream", (_request, payload, done) => {
  done(null, payload);
});

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
  "/folders/:id/copy",
  { preHandler: app.requirePermission(PERMISSIONS.files.folder.create) },
  async (request) => {
    const { id } = request.params as { id: string };
    const { targetParentId } = request.body as { targetParentId: string | null };
    return copyFolder(storage, { id, ownerId: request.user!.sub, targetParentId, rename: true });
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
      if (err instanceof UploadTooLargeError) return reply.code(413).send({ error: "upload_too_large" });
      // Surface the real cause instead of masking every failure as "too
      // large" — that swallowed genuine bugs (disk errors, stream issues)
      // behind a misleading error the first time this code shipped.
      request.log.error(err);
      return reply.code(500).send({ error: "upload_failed" });
    } finally {
      if (global.gc) {
        setTimeout(() => {
          global.gc?.();
        }, 0);
      }
    }
  },
);

function sendChunkedError(reply: import("fastify").FastifyReply, err: unknown) {
  if (err instanceof ChunkedUploadError) {
    return reply.code(err.httpStatus).send({ error: err.code, message: err.message });
  }
  throw err;
}

app.post(
  "/uploads",
  { preHandler: app.requirePermission(PERMISSIONS.files.file.upload) },
  async (request, reply) => {
    const body = request.body as {
      name?: string;
      mimeType?: string;
      folderId?: string | null;
      size?: number;
    };
    try {
      return await chunkedUploads.createSession({
        ownerId: request.user!.sub,
        name: body.name ?? "",
        mimeType: body.mimeType ?? "application/octet-stream",
        folderId: body.folderId ?? null,
        size: Number(body.size),
      });
    } catch (err) {
      return sendChunkedError(reply, err);
    }
  },
);

app.get(
  "/uploads/:id",
  { preHandler: app.requirePermission(PERMISSIONS.files.file.upload) },
  async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const { meta, receivedIndexes } = await chunkedUploads.listReceivedParts(id, request.user!.sub);
      return {
        uploadId: id,
        status: meta.status,
        name: meta.name,
        size: meta.size,
        totalChunks: meta.totalChunks,
        chunkSize: meta.chunkSize,
        folderId: meta.folderId,
        receivedIndexes,
      };
    } catch (err) {
      return sendChunkedError(reply, err);
    }
  },
);

app.put(
  "/uploads/:id/chunks/:index",
  { preHandler: app.requirePermission(PERMISSIONS.files.file.upload) },
  async (request, reply) => {
    const { id, index: indexRaw } = request.params as { id: string; index: string };
    const index = Number(indexRaw);
    const contentLengthHeader = request.headers["content-length"];
    const contentLength = contentLengthHeader != null ? Number(contentLengthHeader) : null;
    try {
      await chunkedUploads.putChunk(
        id,
        request.user!.sub,
        index,
        contentLength,
        request.body as import("node:stream").Readable,
      );
      return reply.code(204).send();
    } catch (err) {
      return sendChunkedError(reply, err);
    } finally {
      if (global.gc) {
        setTimeout(() => {
          global.gc?.();
        }, 0);
      }
    }
  },
);

app.post(
  "/uploads/:id/complete",
  { preHandler: app.requirePermission(PERMISSIONS.files.file.upload) },
  async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const result = await chunkedUploads.requestComplete(id, request.user!.sub);
      return reply.code(202).send(result);
    } catch (err) {
      return sendChunkedError(reply, err);
    }
  },
);

app.get(
  "/uploads/:id/status",
  { preHandler: app.requirePermission(PERMISSIONS.files.file.upload) },
  async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return await chunkedUploads.getStatus(id, request.user!.sub);
    } catch (err) {
      return sendChunkedError(reply, err);
    }
  },
);

app.delete(
  "/uploads/:id",
  { preHandler: app.requirePermission(PERMISSIONS.files.file.upload) },
  async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await chunkedUploads.deleteSession(id, request.user!.sub);
      return reply.code(204).send();
    } catch (err) {
      return sendChunkedError(reply, err);
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
      if (err instanceof UploadTooLargeError) return reply.code(413).send({ error: "upload_too_large" });
      request.log.error(err);
      return reply.code(500).send({ error: "upload_failed" });
    }
  },
);

app.get(
  "/files/:id",
  { preHandler: app.requirePermission(PERMISSIONS.files.file.download) },
  async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await requireFileRole(id, request.user!.sub, "viewer");
    } catch (err) {
      if (err instanceof ForbiddenResourceError) return reply.code(403).send({ error: "forbidden" });
      throw err;
    }
    return fileService.getFile(id);
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
    // "inline" lets the browser render the bytes in place (used by the
    // in-app viewer for PDFs/images/video/audio) — plain navigation or an
    // <iframe> honors Content-Disposition, so "attachment" would force a
    // download dialog instead of showing the PDF. The explicit "Baixar"
    // links still get the default (attachment) behavior.
    const { disposition } = request.query as { disposition?: string };
    const dispositionType = disposition === "inline" ? "inline" : "attachment";
    reply.header("Content-Type", file.mimeType);
    reply.header("Content-Disposition", `${dispositionType}; filename="${encodeURIComponent(file.name)}"`);
    reply.header("Accept-Ranges", "bytes");

    // Content at a given file id only changes via docs' content-update
    // endpoint (which bumps updatedAt), so it's a valid cache/ETag key.
    // Without this, every video/image preview (thumbnail generation
    // included — see VideoThumbnail.tsx) re-fetches the same bytes on
    // every render instead of hitting the browser's HTTP cache.
    const etag = `"${file.id}-${new Date(file.updatedAt).getTime()}"`;
    reply.header("ETag", etag);
    reply.header("Cache-Control", "private, max-age=3600, must-revalidate");
    if (request.headers["if-none-match"] === etag) {
      reply.code(304);
      return reply.send();
    }

    const totalSize = Number(file.size);
    const rangeHeader = request.headers.range;
    // Range requests are what let <video>/<audio> seek and progressively
    // buffer instead of pulling the whole file up front — this is the
    // entire "streaming" mechanism, no transcoding involved, so it costs
    // nothing extra at rest and only reads the bytes actually requested.
    const match = rangeHeader ? /^bytes=(\d*)-(\d*)$/.exec(rangeHeader) : null;

    if (match) {
      const [, startStr, endStr] = match;
      let start = startStr ? parseInt(startStr, 10) : undefined;
      let end = endStr ? parseInt(endStr, 10) : undefined;

      if (start === undefined && end !== undefined) {
        // Suffix range ("bytes=-500" = last 500 bytes).
        start = Math.max(totalSize - end, 0);
        end = totalSize - 1;
      } else if (end === undefined) {
        end = totalSize - 1;
      }

      if (start === undefined || start > end! || start >= totalSize) {
        reply.code(416);
        reply.header("Content-Range", `bytes */${totalSize}`);
        return reply.send();
      }

      end = Math.min(end!, totalSize - 1);
      reply.code(206);
      reply.header("Content-Range", `bytes ${start}-${end}/${totalSize}`);
      reply.header("Content-Length", end - start + 1);
      return reply.send(storage.read(file.storageKey, { start, end }));
    }

    reply.header("Content-Length", totalSize);
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

app.post(
  "/files/:id/copy",
  { preHandler: app.requirePermission(PERMISSIONS.files.file.upload) },
  async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await requireFileRole(id, request.user!.sub, "viewer");
    } catch (err) {
      if (err instanceof ForbiddenResourceError) return reply.code(403).send({ error: "forbidden" });
      throw err;
    }
    const { targetFolderId } = request.body as { targetFolderId: string | null };
    return fileService.copyFile(storage, { id, ownerId: request.user!.sub, targetFolderId, rename: true });
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

app.get("/storage/usage", { preHandler: app.requireAuth }, async (request) => {
  return fileService.getStorageUsage(request.user!.sub);
});

const port = Number(process.env.PORT ?? 4002);
chunkedUploads.startCleanupScheduler(app.log);
app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
