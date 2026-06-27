FROM node:22-alpine AS build
WORKDIR /app
ENV CI=true PNPM_VERIFY_DEPS_BEFORE_RUN=false
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY apps/agent/package.json apps/agent/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile --config.dangerouslyAllowAllBuilds=true
COPY . .
RUN cd apps/web && ../../node_modules/.bin/vite build

FROM nginx:1.27-alpine
COPY deploy/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
