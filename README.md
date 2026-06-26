# AetherPanel

AetherPanel is a proprietary SaaS game server hosting panel. It is a greenfield TypeScript monorepo with a NestJS API, React customer/admin portal, Docker-per-game MVP runtime, PostgreSQL persistence, Redis/BullMQ provisioning, and an extensible YAML game template engine.

## Quick Start

```bash
cp .env.example .env
npm install
npm run build
npm run test
npm run dev
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

No proprietary AMP or TCAdmin code is used. AMPTemplates are treated as MIT-licensed inspiration/import input for game-template concepts.
