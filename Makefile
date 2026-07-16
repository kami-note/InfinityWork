.PHONY: dev dev-down test-e2e

# Starts postgres/auth/file-manager/docs in Docker (ports published to the
# host via docker-compose.dev.yml) and runs the portal natively with
# `next dev` for instant hot reload — no image rebuild while iterating on UI.
dev:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres auth file-manager docs
	AUTH_SERVICE_URL=http://localhost:4001 \
	FILE_MANAGER_SERVICE_URL=http://localhost:4002 \
	DOCS_SERVICE_URL=http://localhost:4003 \
	JWT_SECRET=$$(grep '^JWT_SECRET=' .env | cut -d= -f2-) \
	npm run dev -w apps/portal

# Stops the dev containers AND whatever is still bound to :3000 — Ctrl+C on
# `make dev` normally handles the portal, but this covers it too in case
# that process was started elsewhere (background shell, another terminal)
# and has no controlling terminal to Ctrl+C.
dev-down:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml down
	@lsof -ti:3000 | xargs -r kill 2>/dev/null || true

# Runs the E2E suite (tests/e2e) against an already-running `make dev` stack.
# Every test creates its own isolated folder via the API and deletes it when
# done, so this is safe to run against a real account with real data in it.
test-e2e:
	npx playwright test
