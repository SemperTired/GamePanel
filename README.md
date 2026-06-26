# AetherPanel

AetherPanel is the proprietary game server hosting control plane for AetherNode.org. It is designed as a standalone subprocess/platform service under the AetherNode business stack, with no runtime dependency on AMP, WHMCS, or TCAdmin.

It is a greenfield TypeScript monorepo with a NestJS API, React customer/admin portal, Docker-per-game runtime, PostgreSQL persistence, Redis/BullMQ provisioning, PayPal-ready fulfillment hooks, and an extensible YAML game template engine.

## Quick Start

```bash
cp .env.example .env
pnpm install
pnpm run build
pnpm run test
pnpm run dev
```

The web app runs on `http://127.0.0.1:4000` and proxies API calls to `http://127.0.0.1:4100`.

## Workspaces

- `apps/api` - NestJS REST API and WebSocket gateways.
- `apps/web` - React + Tailwind admin/customer panel.
- `apps/worker` - BullMQ provisioning worker.
- `packages/shared` - shared contracts, enums, Zod schemas, runtime interfaces.
- `packages/templates` - template schema, curated templates, AMPTemplates importer.
- `packages/runtime-docker` - Docker runtime provider.
- `deploy` - Docker Compose, Nginx, installer, systemd examples.

## Game Catalog

The catalog contains curated first-party templates plus 236 imported templates from CubeCoders/AMPTemplates converted into AetherPanel YAML. Imported templates are marked `needs_review` until a game-specific install/runtime adapter has been verified.

No proprietary AMP or TCAdmin code is used. AMPTemplates are treated as public template input for compatibility concepts only.

## Production Shape

- PostgreSQL is the source of truth for users, services, nodes, settings, provisioning jobs, and audit logs.
- Redis/BullMQ is the provisioning queue.
- The worker provisions Docker containers from queued jobs and updates service state.
- PayPal order/capture routes and webhook fulfillment are implemented under `/api/v1/billing/paypal/*`.
- Set `DATABASE_REQUIRED=true` and `REDIS_REQUIRED=true` in production so startup fails instead of silently falling back.
