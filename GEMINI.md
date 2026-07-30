# Project Instructions - InfinityWork

This file contains instructions and shared context for Gemini/AI coding assistants working on this workspace.

## Technology Stack & Architecture
- **Monorepo**: Powered by npm workspaces.
- **Frontend Portal**: Next.js App Router standalone app (`apps/portal`).
- **Backend Services**:
  - `services/auth`: Fastify + Prisma + Argon2id.
  - `services/file-manager`: Fastify + Prisma. Streams physical files named by UUID to storage directories.
  - `services/docs`: Fastify. Stateless document editor using TipTap schemas.

## Guidelines & Constraints

### 1. Memory Management for Large Uploads
- Large file uploads or chunks (up to 80MB each) are proxied through the portal route handlers.
- **Always invoke `global.gc()`** (using `setTimeout(() => global.gc?.(), 0)`) after processing large file uploads or stream proxying in:
  - Portal Route Handlers: `/api/files/upload/route.ts` and `/api/files/uploads/[id]/chunks/[index]/route.ts`.
  - File Manager routes: POST `/files` and PUT `/uploads/:id/chunks/:index` in `services/file-manager/src/interface/server.ts`.
  - File Manager chunk assembler: `assemble()` method in `services/file-manager/src/application/chunked-upload-service.ts`.
- Ensure memory is released immediately on low-memory VPS host environments.
- The portal and file-manager Node.js processes must be run with the `--expose-gc` flag (via `NODE_OPTIONS="--expose-gc"`).

### 2. Fastify Upload Body Limits
- Fastify has a default `bodyLimit` of 1MB. Any upload route must explicitly override the limit in Fastify configuration (e.g. `services/file-manager/src/interface/server.ts`).

### 3. Next.js Edge Runtime Limitations
- Next.js middleware runs in the Edge runtime, which truncates request bodies above 10MB.
- Ensure that the middleware matcher config always excludes `/api/*` so that raw/multipart upload routes can bypass it.
