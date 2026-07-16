FROM node:24-alpine AS base
WORKDIR /repo

COPY package.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/portal/package.json apps/portal/package.json
RUN npm install --workspace=@infinitywork/shared --workspace=@infinitywork/portal --include-workspace-root

COPY packages/shared packages/shared
COPY apps/portal apps/portal

RUN npm run build -w packages/shared
RUN npm run build -w apps/portal

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=base /repo/apps/portal/.next/standalone ./
COPY --from=base /repo/apps/portal/.next/static ./apps/portal/.next/static

EXPOSE 3000
CMD ["node", "apps/portal/server.js"]
