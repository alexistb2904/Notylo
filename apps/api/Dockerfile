FROM node:24-alpine AS build
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/package.json
RUN corepack enable && pnpm install --filter @notylo/api... --frozen-lockfile
COPY apps/api ./apps/api
RUN pnpm --filter @notylo/api build
RUN pnpm --filter @notylo/api deploy --prod --legacy /out
RUN cp -R apps/api/dist /out/dist
FROM node:24-alpine
WORKDIR /app
COPY --from=build /out ./
EXPOSE 3001
CMD ["node", "dist/server.js"]
