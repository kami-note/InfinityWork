-- AlterTable
ALTER TABLE "files" ADD COLUMN     "thumbnail_status" TEXT NOT NULL DEFAULT 'none',
ADD COLUMN     "thumbnail_storage_key" TEXT;
