FROM node:24-alpine AS base
WORKDIR /repo
# See services/auth/Dockerfile for why openssl is required here.
RUN apk add --no-cache openssl

COPY package.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY services/file-manager/package.json services/file-manager/package.json
RUN npm install --workspace=@infinitywork/shared --workspace=@infinitywork/file-manager --include-workspace-root

COPY packages/shared packages/shared
COPY services/file-manager services/file-manager

RUN npm run build -w packages/shared
RUN npm run prisma:generate -w services/file-manager
RUN npm run build -w services/file-manager

FROM node:24-alpine AS runtime
WORKDIR /repo
ENV NODE_ENV=production
RUN apk add --no-cache openssl
COPY --from=base /repo/node_modules node_modules
COPY --from=base /repo/packages/shared/dist packages/shared/dist
COPY --from=base /repo/packages/shared/package.json packages/shared/package.json
COPY --from=base /repo/services/file-manager/dist services/file-manager/dist
# See services/auth/Dockerfile for why the generated Prisma Client is
# copied into dist/ separately from the compiled TypeScript output.
COPY --from=base /repo/services/file-manager/src/generated services/file-manager/dist/generated
COPY --from=base /repo/services/file-manager/prisma services/file-manager/prisma
COPY --from=base /repo/services/file-manager/package.json services/file-manager/package.json

EXPOSE 4002
CMD ["node", "services/file-manager/dist/interface/server.js"]
