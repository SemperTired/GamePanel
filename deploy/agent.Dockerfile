FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/agent/package.json apps/agent/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/runtime-docker/package.json packages/runtime-docker/package.json
RUN pnpm install --frozen-lockfile --config.dangerouslyAllowAllBuilds=true

FROM deps AS build
COPY . .
RUN pnpm exec tsc -b packages/shared packages/runtime-docker apps/agent --force

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY --from=build /app ./
EXPOSE 4210
CMD ["node", "apps/agent/dist/main.js"]
