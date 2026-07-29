# Memory Index - InfinityWork

## Project Context
InfinityWork is a self-hosted, low-computational-cost alternative to Google Drive containing a file manager and document editor. It is designed to run on a single Docker Compose stack targeting cheap VPS hosting (e.g. low CPU and low RAM limits).

## Core Architectural Decisions

### 1. Memory Management & File Upload Optimization
- **Problem**: Large file uploads and chunk uploads (chunk sizes are up to 80MB) caused the Portal application (Next.js server) to consume high amounts of RAM (RSS) even after the uploads completed.
- **Cause**: V8 does not eagerly run a full Garbage Collection cycle to release memory back to the host operating system, causing the memory footprint in `docker stats` to stay high and potentially lead to out-of-memory (OOM) crashes on low-resource servers.
- **Solution**: 
  - Enabled manual garbage collection via `NODE_OPTIONS="--expose-gc"` inside the portal service container (`docker-compose.yml`) and local dev setup (`Makefile`).
  - Added a defensive check `if (global.gc)` and invoked `global.gc()` inside a `setTimeout(() => ..., 0)` hook at the end of the Route Handlers for file uploads (`/api/files/upload` and `/api/files/uploads/[id]/chunks/[index]`).
  - This ensures that once the request finishes execution, all stream buffers and multipart data (which can be up to 90MB per file/chunk) are immediately collected by the V8 engine, keeping memory usage minimal.

## Active Status & Milestones
- **Status**: Tested TypeScript type-checking on portal project successfully. Code changes are ready for production deployment.
- **Next Milestone**: Validate production deployment on the remote server and monitor container RAM usage under load.
