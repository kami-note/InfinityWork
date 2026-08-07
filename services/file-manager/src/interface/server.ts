import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { PERMISSIONS, createAuthPlugin } from "@infinitywork/shared";
import { LocalStorageProvider, UploadTooLargeError } from "../infrastructure/local-storage-provider.js";
import { prisma } from "../infrastructure/prisma.js";
import * as folderService from "../application/folder-service.js";
import * as fileService from "../application/file-service.js";
import * as shareService from "../application/share-service.js";
import { copyFolder } from "../application/copy-service.js";
import {
  requireFileRole,
  requireFolderRole,
  assertResourceOwner,
  getEffectiveFileRole,
  isFileUnderFolder,
  ForbiddenResourceError,
  NotResourceOwnerError,
  type ShareRole,
} from "../application/access-control.js";
import { ChunkedUploadError, ChunkedUploadService } from "../application/chunked-upload-service.js";

const STORAGE_ROOT = process.env.STORAGE_ROOT ?? "/data/storage";
const MAX_UPLOAD_BYTES = Number(process.env.STORAGE_MAX_UPLOAD_BYTES ?? 500 * 1024 * 1024);
const storage = new LocalStorageProvider(STORAGE_ROOT, MAX_UPLOAD_BYTES);
const chunkedUploads = new ChunkedUploadService(STORAGE_ROOT, storage, { maxUploadBytes: MAX_UPLOAD_BYTES });

(BigInt.prototype as unknown as { toJSON(): string }).toJSON = function () {
  return this.toString();
};

const app = Fastify({ logger: true, bodyLimit: MAX_UPLOAD_BYTES });

await app.register(cors, { origin: process.env.PORTAL_ORIGIN ?? "http://portal:3000" });
await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES } });
await app.register(createAuthPlugin(process.env.JWT_SECRET!));

app.addContentTypeParser("application/octet-stream", (_request, payload, done) => {
  done(null, payload);
});

function isShareRole(role: unknown): role is ShareRole {
  return role === "viewer" || role === "editor";
}

async function sendAclError(reply: import("fastify").FastifyReply, err: unknown) {
  if (err instanceof ForbiddenResourceError || err instanceof NotResourceOwnerError) {
    return reply.code(403).send({ error: "forbidden" });
  }
  throw err;
}

async function streamFileDownload(
  request: import("fastify").FastifyRequest,
  reply: import("fastify").FastifyReply,
  file: Awaited<ReturnType<typeof fileService.getFile>>,
) {
  const { disposition } = request.query as { disposition?: string };
  const dispositionType = disposition === "inline" ? "inline" : "attachment";
  reply.header("Content-Type", file.mimeType);
  reply.header("Content-Disposition", `${dispositionType}; filename="${encodeURIComponent(file.name)}"`);
  reply.header("Accept-Ranges", "bytes");

  const etag = `"${file.id}-${new Date(file.updatedAt).getTime()}"`;
  reply.header("ETag", etag);
  reply.header("Cache-Control", "private, max-age=3600, must-revalidate");
  if (request.headers["if-none-match"] === etag) {
    reply.code(304);
    return reply.send();
  }

  const totalSize = Number(file.size);
  const rangeHeader = request.headers.range;
  const match = rangeHeader ? /^bytes=(\d*)-(\d*)$/.exec(rangeHeader) : null;

  if (match) {
    const [, startStr, endStr] = match;
    let start = startStr ? parseInt(startStr, 10) : undefined;
    let end = endStr ? parseInt(endStr, 10) : undefined;

    if (start === undefined && end !== undefined) {
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
}

app.get("/health", async () => ({ status: "ok" }));

app.get("/folders", { preHandler: app.requireAuth }, async (request, reply) => {
  const parentId = (request.query as { parentId?: string }).parentId ?? null;
  try {
    const [contents, trail] = await Promise.all([
      folderService.listFolderContents(request.user!.sub, parentId),
      folderService.breadcrumbForUser(parentId, request.user!.sub),
    ]);
    return { folders: contents.folders, files: contents.files, breadcrumb: trail, mode: contents.mode };
  } catch (err) {
    return sendAclError(reply, err);
  }
});

app.post(
  "/folders",
  { preHandler: app.requirePermission(PERMISSIONS.files.folder.create) },
  async (request, reply) => {
    const body = request.body as { name: string; parentId?: string | null };
    const parentId = body.parentId ?? null;
    try {
      if (parentId) {
        await requireFolderRole(parentId, request.user!.sub, "editor");
      }
      return folderService.createFolder(request.user!.sub, body.name, parentId);
    } catch (err) {
      return sendAclError(reply, err);
    }
  },
);

app.patch(
  "/folders/:id",
  { preHandler: app.requirePermission(PERMISSIONS.files.folder.rename) },
  async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await requireFolderRole(id, request.user!.sub, "editor");
      const { name } = request.body as { name: string };
      return folderService.renameFolder(id, name);
    } catch (err) {
      return sendAclError(reply, err);
    }
  },
);

app.patch(
  "/folders/:id/move",
  { preHandler: app.requirePermission(PERMISSIONS.files.folder.move) },
  async (request, reply) => {
    const { id } = request.params as { id: string };
    const { parentId } = request.body as { parentId: string | null };
    try {
      await requireFolderRole(id, request.user!.sub, "editor");
      if (parentId) {
        await requireFolderRole(parentId, request.user!.sub, "editor");
      } else {
        await assertResourceOwner("folder", id, request.user!.sub);
      }
      return folderService.moveFolder(id, parentId);
    } catch (err) {
      return sendAclError(reply, err);
    }
  },
);

app.delete(
  "/folders/:id",
  { preHandler: app.requirePermission(PERMISSIONS.files.folder.delete) },
  async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await assertResourceOwner("folder", id, request.user!.sub);
      return folderService.softDeleteFolder(id);
    } catch (err) {
      return sendAclError(reply, err);
    }
  },
);

app.post(
  "/folders/:id/copy",
  { preHandler: app.requirePermission(PERMISSIONS.files.folder.create) },
  async (request, reply) => {
    const { id } = request.params as { id: string };
    const { targetParentId } = request.body as { targetParentId: string | null };
    try {
      await requireFolderRole(id, request.user!.sub, "viewer");
      if (targetParentId) {
        await requireFolderRole(targetParentId, request.user!.sub, "editor");
      }
      return copyFolder(storage, { id, ownerId: request.user!.sub, targetParentId, rename: true });
    } catch (err) {
      return sendAclError(reply, err);
    }
  },
);

app.post(
  "/folders/:id/share",
  { preHandler: app.requirePermission(PERMISSIONS.files.file.share) },
  async (request, reply) => {
    const { id } = request.params as { id: string };
    const { userId, role } = request.body as { userId: string; role: string };
    if (!isShareRole(role)) return reply.code(400).send({ error: "invalid_role" });
    try {
      await assertResourceOwner("folder", id, request.user!.sub);
      return shareService.shareFolder(id, userId, role);
    } catch (err) {
      return sendAclError(reply, err);
    }
  },
);

app.delete(
  "/folders/:id/share/:userId",
  { preHandler: app.requirePermission(PERMISSIONS.files.file.share) },
  async (request, reply) => {
    const { id, userId } = request.params as { id: string; userId: string };
    try {
      await assertResourceOwner("folder", id, request.user!.sub);
      await shareService.unshareFolder(id, userId);
      return reply.code(204).send();
    } catch (err) {
      return sendAclError(reply, err);
    }
  },
);

app.get(
  "/folders/:id/permissions",
  { preHandler: app.requirePermission(PERMISSIONS.files.file.share) },
  async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await assertResourceOwner("folder", id, request.user!.sub);
      return shareService.listFolderPermissions(id);
    } catch (err) {
      return sendAclError(reply, err);
    }
  },
);

app.post(
  "/folders/:id/links",
  { preHandler: app.requirePermission(PERMISSIONS.files.file.share) },
  async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body as { expiresAt?: string | null } | undefined) ?? {};
    try {
      await assertResourceOwner("folder", id, request.user!.sub);
      const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
      const { link, token } = await shareService.createShareLink({
        targetType: "folder",
        targetId: id,
        createdBy: request.user!.sub,
        expiresAt,
      });
      return { id: link.id, token, expiresAt: link.expiresAt, createdAt: link.createdAt };
    } catch (err) {
      return sendAclError(reply, err);
    }
  },
);

app.get(
  "/folders/:id/links",
  { preHandler: app.requirePermission(PERMISSIONS.files.file.share) },
  async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await assertResourceOwner("folder", id, request.user!.sub);
      const links = await shareService.listShareLinks("folder", id);
      return links.map((l: any) => ({
        id: l.id,
        expiresAt: l.expiresAt,
        createdAt: l.createdAt,
        revokedAt: l.revokedAt,
      }));
    } catch (err) {
      return sendAclError(reply, err);
    }
  },
);

app.delete(
  "/folders/:id/links/:linkId",
  { preHandler: app.requirePermission(PERMISSIONS.files.file.share) },
  async (request, reply) => {
    const { id, linkId } = request.params as { id: string; linkId: string };
    try {
      await assertResourceOwner("folder", id, request.user!.sub);
      await shareService.revokeShareLink(linkId, request.user!.sub);
      return reply.code(204).send();
    } catch (err) {
      return sendAclError(reply, err);
    }
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
      if (folderId) {
        await requireFolderRole(folderId, request.user!.sub, "editor");
      }
      const file = await fileService.uploadFile(storage, {
        ownerId: request.user!.sub,
        folderId,
        name: data.filename,
        mimeType: data.mimetype,
        stream: data.file,
      });
      return file;
    } catch (err) {
      if (err instanceof ForbiddenResourceError || err instanceof NotResourceOwnerError) {
        return reply.code(403).send({ error: "forbidden" });
      }
      if (err instanceof UploadTooLargeError) return reply.code(413).send({ error: "upload_too_large" });
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
      const folderId = body.folderId ?? null;
      if (folderId) {
        await requireFolderRole(folderId, request.user!.sub, "editor");
      }
      return await chunkedUploads.createSession({
        ownerId: request.user!.sub,
        name: body.name ?? "",
        mimeType: body.mimeType ?? "application/octet-stream",
        folderId,
        size: Number(body.size),
      });
    } catch (err) {
      if (err instanceof ForbiddenResourceError) return reply.code(403).send({ error: "forbidden" });
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
      return sendAclError(reply, err);
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
      const file = await fileService.getFile(id);
      const role = await getEffectiveFileRole(id, request.user!.sub);
      return { ...file, role };
    } catch (err) {
      return sendAclError(reply, err);
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
      return sendAclError(reply, err);
    }
    const file = await fileService.getFile(id);
    return streamFileDownload(request, reply, file);
  },
);

app.patch(
  "/files/:id",
  { preHandler: app.requirePermission(PERMISSIONS.files.file.rename) },
  async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await requireFileRole(id, request.user!.sub, "editor");
      const { name } = request.body as { name: string };
      return fileService.renameFile(id, name);
    } catch (err) {
      return sendAclError(reply, err);
    }
  },
);

app.patch(
  "/files/:id/move",
  { preHandler: app.requirePermission(PERMISSIONS.files.file.move) },
  async (request, reply) => {
    const { id } = request.params as { id: string };
    const { folderId } = request.body as { folderId: string | null };
    try {
      await requireFileRole(id, request.user!.sub, "editor");
      if (folderId) {
        await requireFolderRole(folderId, request.user!.sub, "editor");
      } else {
        await assertResourceOwner("file", id, request.user!.sub);
      }
      return fileService.moveFile(id, folderId);
    } catch (err) {
      return sendAclError(reply, err);
    }
  },
);

app.post(
  "/files/:id/copy",
  { preHandler: app.requirePermission(PERMISSIONS.files.file.upload) },
  async (request, reply) => {
    const { id } = request.params as { id: string };
    const { targetFolderId } = request.body as { targetFolderId: string | null };
    try {
      await requireFileRole(id, request.user!.sub, "viewer");
      if (targetFolderId) {
        await requireFolderRole(targetFolderId, request.user!.sub, "editor");
      }
      return fileService.copyFile(storage, {
        id,
        ownerId: request.user!.sub,
        targetFolderId,
        rename: true,
      });
    } catch (err) {
      return sendAclError(reply, err);
    }
  },
);

app.delete(
  "/files/:id",
  { preHandler: app.requirePermission(PERMISSIONS.files.file.delete) },
  async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await assertResourceOwner("file", id, request.user!.sub);
      return fileService.softDeleteFile(id);
    } catch (err) {
      return sendAclError(reply, err);
    }
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
    const { userId, role } = request.body as { userId: string; role: string };
    if (!isShareRole(role)) return reply.code(400).send({ error: "invalid_role" });
    try {
      await assertResourceOwner("file", id, request.user!.sub);
      return shareService.shareFile(id, userId, role);
    } catch (err) {
      return sendAclError(reply, err);
    }
  },
);

app.delete(
  "/files/:id/share/:userId",
  { preHandler: app.requirePermission(PERMISSIONS.files.file.share) },
  async (request, reply) => {
    const { id, userId } = request.params as { id: string; userId: string };
    try {
      await assertResourceOwner("file", id, request.user!.sub);
      await shareService.unshareFile(id, userId);
      return reply.code(204).send();
    } catch (err) {
      return sendAclError(reply, err);
    }
  },
);

app.get(
  "/files/:id/permissions",
  { preHandler: app.requirePermission(PERMISSIONS.files.file.share) },
  async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await assertResourceOwner("file", id, request.user!.sub);
      return shareService.listFilePermissions(id);
    } catch (err) {
      return sendAclError(reply, err);
    }
  },
);

app.post(
  "/files/:id/links",
  { preHandler: app.requirePermission(PERMISSIONS.files.file.share) },
  async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body as { expiresAt?: string | null } | undefined) ?? {};
    try {
      await assertResourceOwner("file", id, request.user!.sub);
      const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
      const { link, token } = await shareService.createShareLink({
        targetType: "file",
        targetId: id,
        createdBy: request.user!.sub,
        expiresAt,
      });
      return { id: link.id, token, expiresAt: link.expiresAt, createdAt: link.createdAt };
    } catch (err) {
      return sendAclError(reply, err);
    }
  },
);

app.get(
  "/files/:id/links",
  { preHandler: app.requirePermission(PERMISSIONS.files.file.share) },
  async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await assertResourceOwner("file", id, request.user!.sub);
      const links = await shareService.listShareLinks("file", id);
      return links.map((l: any) => ({
        id: l.id,
        expiresAt: l.expiresAt,
        createdAt: l.createdAt,
        revokedAt: l.revokedAt,
      }));
    } catch (err) {
      return sendAclError(reply, err);
    }
  },
);

app.delete(
  "/files/:id/links/:linkId",
  { preHandler: app.requirePermission(PERMISSIONS.files.file.share) },
  async (request, reply) => {
    const { id, linkId } = request.params as { id: string; linkId: string };
    try {
      await assertResourceOwner("file", id, request.user!.sub);
      await shareService.revokeShareLink(linkId, request.user!.sub);
      return reply.code(204).send();
    } catch (err) {
      return sendAclError(reply, err);
    }
  },
);

app.get("/shared", { preHandler: app.requireAuth }, async (request) => {
  return shareService.listSharedWithMe(request.user!.sub);
});

// --- Public share links (no JWT) ---

app.get("/public/links/:token", async (request, reply) => {
  const { token } = request.params as { token: string };
  try {
    const link = await shareService.resolveShareLink(token);
    if (link.targetType === "file") {
      const file = await fileService.getFile(link.targetId);
      if (file.deletedAt) return reply.code(404).send({ error: "not_found" });
      return {
        targetType: "file" as const,
        file: {
          id: file.id,
          name: file.name,
          size: file.size,
          mimeType: file.mimeType,
          updatedAt: file.updatedAt,
        },
      };
    }
    const folder = await folderService.getFolder(link.targetId);
    if (folder.deletedAt) return reply.code(404).send({ error: "not_found" });
    return {
      targetType: "folder" as const,
      folder: { id: folder.id, name: folder.name, updatedAt: folder.updatedAt },
    };
  } catch (err) {
    if (err instanceof shareService.InvalidShareLinkError) {
      return reply.code(404).send({ error: err.message });
    }
    throw err;
  }
});

app.get("/public/links/:token/children", async (request, reply) => {
  const { token } = request.params as { token: string };
  const parentId = (request.query as { parentId?: string }).parentId;
  try {
    const link = await shareService.resolveShareLink(token);
    if (link.targetType !== "folder") {
      return reply.code(400).send({ error: "not_a_folder_link" });
    }

    const folderId = parentId ?? link.targetId;
    if (folderId !== link.targetId) {
      // parentId must be under the shared folder tree
      let current: string | null = folderId;
      let under = false;
      while (current) {
        if (current === link.targetId) {
          under = true;
          break;
        }
        const folder = await folderService.getFolder(current);
        current = folder.parentId;
      }
      if (!under) return reply.code(403).send({ error: "forbidden" });
    }

    const [folders, files] = await Promise.all([
      prisma.folder.findMany({
        where: { parentId: folderId, deletedAt: null },
        orderBy: { name: "asc" },
        select: { id: true, name: true, parentId: true, updatedAt: true },
      }),
      prisma.file.findMany({
        where: { folderId, deletedAt: null },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          folderId: true,
          size: true,
          mimeType: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    const breadcrumb = await folderService.breadcrumbFromRoot(folderId, link.targetId);
    return { folders, files, breadcrumb };
  } catch (err) {
    if (err instanceof shareService.InvalidShareLinkError) {
      return reply.code(404).send({ error: err.message });
    }
    throw err;
  }
});

app.get("/public/links/:token/download", async (request, reply) => {
  const { token } = request.params as { token: string };
  try {
    const link = await shareService.resolveShareLink(token);
    if (link.targetType !== "file") {
      return reply.code(400).send({ error: "not_a_file_link" });
    }
    const file = await fileService.getFile(link.targetId);
    if (file.deletedAt) return reply.code(404).send({ error: "not_found" });
    return streamFileDownload(request, reply, file);
  } catch (err) {
    if (err instanceof shareService.InvalidShareLinkError) {
      return reply.code(404).send({ error: err.message });
    }
    throw err;
  }
});

app.get("/public/links/:token/files/:fileId", async (request, reply) => {
  const { token, fileId } = request.params as { token: string; fileId: string };
  try {
    const link = await shareService.resolveShareLink(token);
    if (link.targetType !== "folder") {
      return reply.code(400).send({ error: "not_a_folder_link" });
    }
    const under = await isFileUnderFolder(fileId, link.targetId);
    if (!under) return reply.code(403).send({ error: "forbidden" });
    const file = await fileService.getFile(fileId);
    if (file.deletedAt) return reply.code(404).send({ error: "not_found" });
    return {
      id: file.id,
      name: file.name,
      size: file.size,
      mimeType: file.mimeType,
      folderId: file.folderId,
      updatedAt: file.updatedAt,
    };
  } catch (err) {
    if (err instanceof shareService.InvalidShareLinkError) {
      return reply.code(404).send({ error: err.message });
    }
    throw err;
  }
});

app.get("/public/links/:token/files/:fileId/download", async (request, reply) => {
  const { token, fileId } = request.params as { token: string; fileId: string };
  try {
    const link = await shareService.resolveShareLink(token);
    if (link.targetType !== "folder") {
      return reply.code(400).send({ error: "not_a_folder_link" });
    }
    const under = await isFileUnderFolder(fileId, link.targetId);
    if (!under) return reply.code(403).send({ error: "forbidden" });
    const file = await fileService.getFile(fileId);
    if (file.deletedAt) return reply.code(404).send({ error: "not_found" });
    return streamFileDownload(request, reply, file);
  } catch (err) {
    if (err instanceof shareService.InvalidShareLinkError) {
      return reply.code(404).send({ error: err.message });
    }
    throw err;
  }
});

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
