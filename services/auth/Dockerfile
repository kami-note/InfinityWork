FROM node:24-alpine AS base
WORKDIR /repo
# Prisma's query engine needs libssl; without it Alpine (musl) builds fall
# back to a network fetch for engine detection, which fails on networks
# with no outbound internet (like this service's internal-only network).
RUN apk add --no-cache openssl

COPY package.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY services/auth/package.json services/auth/package.json
RUN npm install --workspace=@infinitywork/shared --workspace=@infinitywork/auth --include-workspace-root

COPY packages/shared packages/shared
COPY services/auth services/auth

RUN npm run build -w packages/shared
RUN npm run prisma:generate -w services/auth
RUN npm run build -w services/auth

FROM node:24-alpine AS runtime
WORKDIR /repo
ENV NODE_ENV=production
RUN apk add --no-cache openssl
COPY --from=base /repo/node_modules node_modules
COPY --from=base /repo/packages/shared/dist packages/shared/dist
COPY --from=base /repo/packages/shared/package.json packages/shared/package.json
COPY --from=base /repo/services/auth/dist services/auth/dist
# tsc only emits compiled .ts sources — the Prisma Client is already plain
# JS, so it has to be copied into dist/ separately to match the relative
# import path used by dist/infrastructure/prisma.js.
COPY --from=base /repo/services/auth/src/generated services/auth/dist/generated
COPY --from=base /repo/services/auth/prisma services/auth/prisma
COPY --from=base /repo/services/auth/package.json services/auth/package.json

EXPOSE 4001
CMD ["node", "services/auth/dist/interface/server.js"]
