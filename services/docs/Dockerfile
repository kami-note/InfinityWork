FROM node:24-alpine AS base
WORKDIR /repo

COPY package.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY services/docs/package.json services/docs/package.json
RUN npm install --workspace=@infinitywork/shared --workspace=@infinitywork/docs --include-workspace-root

COPY packages/shared packages/shared
COPY services/docs services/docs

RUN npm run build -w packages/shared
RUN npm run build -w services/docs

FROM node:24-alpine AS runtime
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=base /repo/node_modules node_modules
COPY --from=base /repo/packages/shared/dist packages/shared/dist
COPY --from=base /repo/packages/shared/package.json packages/shared/package.json
COPY --from=base /repo/services/docs/dist services/docs/dist
COPY --from=base /repo/services/docs/package.json services/docs/package.json

EXPOSE 4003
CMD ["node", "services/docs/dist/interface/server.js"]
