FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/agent/package.json apps/agent/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/runtime-docker/package.json packages/runtime-docker/package.json
COPY packages/templates/package.json packages/templates/package.json
RUN pnpm install --frozen-lockfile --config.dangerouslyAllowAllBuilds=true

FROM deps AS build
COPY . .
RUN pnpm exec tsc -b packages/shared packages/templates packages/runtime-docker apps/agent --force

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
RUN apt-get update \
  && apt-get install -y --no-install-recommends bash curl tar xz-utils git ca-certificates libstdc++6 \
  && rm -rf /var/lib/apt/lists/*
COPY --from=build /app ./
EXPOSE 4210
CMD ["node", "apps/agent/dist/main.js"]
