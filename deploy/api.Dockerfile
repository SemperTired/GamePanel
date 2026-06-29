FROM node:22-alpine AS deps
WORKDIR /app
ENV CI=true PNPM_VERIFY_DEPS_BEFORE_RUN=false
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/agent/package.json apps/agent/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/templates/package.json packages/templates/package.json
COPY packages/runtime-docker/package.json packages/runtime-docker/package.json
RUN pnpm install --frozen-lockfile --config.dangerouslyAllowAllBuilds=true

FROM deps AS build
ENV CI=true PNPM_VERIFY_DEPS_BEFORE_RUN=false
COPY . .
RUN ./node_modules/.bin/tsc -b --force

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable && apk add --no-cache openssh-client sshpass
COPY --from=build /app ./
EXPOSE 4100
CMD ["node", "apps/api/dist/main.js"]
