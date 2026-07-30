import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { prisma } from "../infrastructure/prisma.js";
import {
  requireFileRole,
  ForbiddenResourceError,
  highestAccessibleAncestor,
  isFileUnderFolder,
} from "./access-control.js";
import * as shareService from "./share-service.js";

const runDbTests = process.env.RUN_DB_TESTS === "1";

describe("access-control inheritance", { skip: !runDbTests }, () => {
  const ownerId = "acl-owner-00000000000000000001";
  const collaboratorId = "acl-collab-0000000000000000002";
  const outsiderId = "acl-outsid-0000000000000000003";
  let parentFolderId = "";
  let childFolderId = "";
  let fileId = "";
  let outsideFileId = "";

  before(async () => {
    const parent = await prisma.folder.create({
      data: { name: "__acl_parent__", ownerId },
    });
    parentFolderId = parent.id;

    const child = await prisma.folder.create({
      data: { name: "__acl_child__", ownerId, parentId: parentFolderId },
    });
    childFolderId = child.id;

    // File owned by collaborator inside owner's folder — the key inheritance case.
    const file = await prisma.file.create({
      data: {
        name: "collab-upload.txt",
        ownerId: collaboratorId,
        folderId: childFolderId,
        storageKey: "00/acl-test-key",
        size: 4n,
        mimeType: "text/plain",
        checksumSha256: "a".repeat(64),
      },
    });
    fileId = file.id;

    const outside = await prisma.file.create({
      data: {
        name: "outside.txt",
        ownerId,
        folderId: null,
        storageKey: "00/acl-outside-key",
        size: 1n,
        mimeType: "text/plain",
        checksumSha256: "b".repeat(64),
      },
    });
    outsideFileId = outside.id;

    await prisma.folderPermission.create({
      data: { folderId: parentFolderId, userId: collaboratorId, role: "editor" },
    });
  });

  after(async () => {
    await prisma.file.deleteMany({ where: { id: { in: [fileId, outsideFileId] } } });
    await prisma.folderPermission.deleteMany({ where: { folderId: parentFolderId } });
    await prisma.folder.deleteMany({ where: { id: { in: [childFolderId, parentFolderId] } } });
    await prisma.$disconnect();
  });

  it("folder owner can access file owned by collaborator via ancestor ownership", async () => {
    await requireFileRole(fileId, ownerId, "viewer");
    await requireFileRole(fileId, ownerId, "editor");
  });

  it("collaborator with folder editor grant can access the file", async () => {
    await requireFileRole(fileId, collaboratorId, "editor");
  });

  it("outsider is forbidden", async () => {
    await assert.rejects(() => requireFileRole(fileId, outsiderId, "viewer"), ForbiddenResourceError);
  });

  it("breadcrumb cutoff is the shared parent, not above", async () => {
    const highest = await highestAccessibleAncestor(childFolderId, collaboratorId);
    assert.equal(highest, parentFolderId);
  });

  it("isFileUnderFolder detects ancestry", async () => {
    assert.equal(await isFileUnderFolder(fileId, parentFolderId), true);
    assert.equal(await isFileUnderFolder(fileId, childFolderId), true);
    assert.equal(await isFileUnderFolder(outsideFileId, parentFolderId), false);
  });

  it("revoked or expired share link is invalid", async () => {
    const { link, token } = await shareService.createShareLink({
      targetType: "file",
      targetId: outsideFileId,
      createdBy: ownerId,
    });
    const resolved = await shareService.resolveShareLink(token);
    assert.equal(resolved.id, link.id);

    await shareService.revokeShareLink(link.id, ownerId);
    await assert.rejects(() => shareService.resolveShareLink(token), shareService.InvalidShareLinkError);

    const { token: expiredToken } = await shareService.createShareLink({
      targetType: "file",
      targetId: outsideFileId,
      createdBy: ownerId,
      expiresAt: new Date(Date.now() - 1000),
    });
    await assert.rejects(
      () => shareService.resolveShareLink(expiredToken),
      shareService.InvalidShareLinkError,
    );
  });
});
