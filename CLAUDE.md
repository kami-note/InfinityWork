# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

InfinityWork is a self-hosted, low-computational-cost alternative to Google Drive: file manager + document editor (spreadsheet editor planned next), built as independently-deployable modules behind a single public web portal. Optimizing for cheap VPS hosting (one Docker Compose stack, no managed cloud services) drove most of the architecture decisions below — don't reach for heavier infra (Kubernetes, managed queues, image/video transcoding pipelines) without a specific reason.

## Commands

**Local development** (fast iteration, no image rebuilds):
```bash
make dev          # starts postgres/auth/file-manager/docs in Docker, runs the portal natively via `next dev`
make dev-down     # stops everything, including anything still bound to :3000
```
Requires `.env` (copy from `.env.example`). Seeded admin login: `admin@infinitywork.local` / `changeme123` (see `services/auth/src/infrastructure/seed.ts`).

**Production stack** (everything containerized): `docker compose up -d --build`. Only the `portal` service publishes a port — `auth`, `file-manager`, `docs`, `postgres` are internal-only.

**Type checking** (no repo-wide script; run per package):
```bash
npx tsc -p services/<name>/tsconfig.json --noEmit
npx tsc --noEmit          # from apps/portal/
```

**Build**: `npm run build` (root) builds `packages/shared` first, then every workspace — shared must build first since the others import its compiled output, not its source.

**E2E tests** (Playwright, `tests/e2e/`):
```bash
make test-e2e      # or: npx playwright test
```
Assumes `make dev` is already running. Every test creates its own isolated folder via the file-manager API (`testFolder` fixture in `tests/e2e/fixtures.ts`) and deletes it afterward — safe to run against a real account with real data. Runs with a single worker on purpose: `next dev` compiles routes on first hit, and concurrent workers hitting cold routes caused login timeouts.

**Per-service dev servers** (rarely needed standalone — `make dev` is the normal path):
```bash
npm run dev -w services/auth
npm run dev -w services/file-manager
npm run dev -w services/docs
npm run dev -w apps/portal
```

**Prisma** (per service, `services/auth` and `services/file-manager` each own a schema):
```bash
npx prisma generate --schema=services/<name>/prisma/schema.prisma
npx prisma migrate dev --schema=services/<name>/prisma/schema.prisma --name <migration_name>
```

## Architecture

### Module boundary rule

Each service (`services/auth`, `services/file-manager`, `services/docs`) owns its own data and is the *only* thing allowed to touch its own database. Cross-module interaction happens exclusively through the other module's public HTTP API, using the caller's own JWT — never direct DB access, even though they currently share one Postgres instance (`file-manager` uses schema `file_manager`, `auth` uses schema `auth`; `docs` has no database at all — see below). Adding a module should never require modifying another module.

### Services

- **`apps/portal`** — Next.js App Router app, the *only* service exposed to the internet (`ports:` in `docker-compose.yml`). Server Components call the internal services directly over the Docker network; anything the browser needs directly (file upload, file download, docx export) goes through a portal Route Handler that proxies to the right service, because browsers can't reach `auth`/`file-manager`/`docs` directly.
- **`services/auth`** — Fastify + Prisma. Users, RBAC roles/permissions, login/refresh, argon2id password hashing. Issues short-lived (15 min) access JWTs carrying the resolved permission list, plus a 7-day refresh token (hashed at rest, rotated on use).
- **`services/file-manager`** — Fastify + Prisma. Owns folders/files, physical storage, per-file sharing ACLs, trash, and recursive copy. This is the source of truth for every file's bytes, even files that "belong" to another module (see docs below).
- **`services/docs`** — Fastify, **no database of its own**. Stateless orchestrator: a "document" is just a `file-manager` file with mime type `DOCUMENT_MIME_TYPE` (`packages/shared/src/mime-types.ts`) whose content happens to be TipTap JSON. `docs` reads/writes that content via `file-manager`'s own upload/download/content-update endpoints, and converts to HTML/docx (via `mammoth`/`html-to-docx`) on export. This is the template for adding new document-backed modules (a future spreadsheet editor would follow the same pattern) — don't give a new module its own file storage if file-manager can already own the bytes.
- **`packages/shared`** — JWT sign/verify, the permission-string table, and the Fastify auth plugin (`createAuthPlugin`) used identically by all three backend services. Must be built (`npm run build -w packages/shared`) before anything that imports it — its `main` points at `dist/`, not `src/`.

### Auth & permissions

Permission strings follow `<domain>.<resource>.<action>` (e.g. `files.file.upload`, `docs.document.export` — see `packages/shared/src/permissions.ts`). Each module declares its own slice of the table; roles (`DEFAULT_ROLES`) are just named permission bundles, wildcard-expandable (`"*.*.*"` for admin).

Every backend service validates the JWT **locally** using a shared secret (`createAuthPlugin`) rather than calling back to `auth` on every request — that's what keeps a distributed system cheap to run on one VPS. `auth` is the only service that ever touches the signing key's issuance side.

Two authorization layers, don't confuse them:
- **RBAC** (`requirePermission(...)`) — "can this user do this kind of action at all."
- **Resource ACL** (`requireFileRole(fileId, userId, role)` in `file-manager/src/application/access-control.ts`) — "can this user touch *this specific* file/folder," independent of their global role. Google-Drive-style per-file sharing lives here, not in the permission table.

### Session persistence

Access tokens live 15 minutes. Two independent mechanisms keep a session alive without the user noticing:
- `apps/portal/src/middleware.ts` decodes (not verifies — that still happens server-side) the JWT's `exp` on every page navigation and silently calls `auth`'s `/refresh` when it's within 2 minutes of expiring.
- `apps/portal/src/components/SessionKeepAlive.tsx` is a client component that calls `/api/auth/refresh` every 10 minutes, for pages the user sits on without navigating (e.g. the docs editor autosaving).

Middleware **excludes `/api/*`** — see the "gotchas" section below for why.

### Storage

`file-manager`'s `StorageProvider` interface (`src/domain/storage-provider.ts`) is the only thing that knows files live on local disk (`LocalStorageProvider`); swapping to S3-compatible storage later means implementing that interface, not touching callers. Physical files are named by a fresh UUID (never the user's filename) and sharded into `storage/<first-2-hex-chars>/<uuid>` so no single directory accumulates enough entries to slow down ext4. No dedup/refcounting — copying a file duplicates its bytes.

Download supports HTTP Range requests (`Content-Range`/`Accept-Ranges`, `206`/`416`) so `<video>`/`<audio>` can seek — this is the entire "streaming" mechanism, no transcoding. The same endpoint takes a `?disposition=inline` query param (proxied through by the portal) to render in-browser instead of triggering a download; the plain "Baixar" links omit it.

### Known gotchas (found the hard way — don't reintroduce)

- **Fastify's default `bodyLimit` is 1MB** and applies to the raw request regardless of `@fastify/multipart`'s own `limits.fileSize`. Every Fastify instance that accepts uploads must set `bodyLimit` explicitly (see `services/file-manager/src/interface/server.ts`).
- **Next.js middleware runs in the Edge runtime**, which silently truncates large request bodies. The middleware matcher excludes `/api/*` entirely — every API route enforces its own auth via `requireAccessToken()` instead.
- **`@fastify/multipart` field order matters.** `request.file()` resolves and hands back `data.fields` as soon as it sees the file part; fields placed *after* the file in the FormData aren't parsed yet. Always append non-file fields (like `folderId`) before the file (see `UploadQueueProvider.tsx` and `services/docs/src/infrastructure/file-manager-client.ts`).
- **Docker's `internal: true` network flag blocks host port-publishing entirely** under rootless Docker (verified empirically). Isolation between services is achieved by simply not declaring `ports:` on the internal-only services, not by the network flag.
- **Each service needs its own Prisma Client output path.** npm workspaces hoist `node_modules`, so the default `node_modules/@prisma/client` location would be shared and clobbered between services; each `schema.prisma` sets `output = "../src/generated/prisma-client"`. Docker builds must copy that generated dir into `dist/` separately since `tsc` only emits compiled `.ts`, not the already-JS Prisma Client.
- **Prisma's `BigInt` columns (file `size`) don't survive `JSON.stringify`** — `file-manager`'s server patches `BigInt.prototype.toJSON` once at startup rather than serializing manually at every call site.
- Content-Disposition on the download endpoint defaults to `attachment`; forgetting the `?disposition=inline` query param on an embedded `<iframe>`/`<img>`/`<video>` makes the browser force-download instead of rendering it.
