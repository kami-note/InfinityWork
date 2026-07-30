-- CreateEnum
CREATE TYPE "ShareLinkTargetType" AS ENUM ('file', 'folder');

-- CreateTable
CREATE TABLE "folder_permissions" (
    "folder_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "FilePermissionRole" NOT NULL,

    CONSTRAINT "folder_permissions_pkey" PRIMARY KEY ("folder_id","user_id")
);

-- CreateTable
CREATE TABLE "share_links" (
    "id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "target_type" "ShareLinkTargetType" NOT NULL,
    "target_id" TEXT NOT NULL,
    "role" "FilePermissionRole" NOT NULL DEFAULT 'viewer',
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "share_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "folder_permissions_user_id_idx" ON "folder_permissions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "share_links_token_hash_key" ON "share_links"("token_hash");

-- CreateIndex
CREATE INDEX "share_links_target_type_target_id_idx" ON "share_links"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "file_permissions_user_id_idx" ON "file_permissions"("user_id");

-- AddForeignKey
ALTER TABLE "folder_permissions" ADD CONSTRAINT "folder_permissions_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
