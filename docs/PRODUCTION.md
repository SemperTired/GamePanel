# Production Deployment

AetherPanel runs as an AetherNode.org platform service. It does not depend on AMP, WHMCS, or existing AetherNode website processes.

## Required Services

- PostgreSQL 16+ for durable platform data.
- Redis 7+ for BullMQ provisioning.
- Docker Engine on every node that will run game servers.
- HTTPS reverse proxy in front of `apps/web` and `apps/api`.

## Database Host

For the current AetherNode network, install PostgreSQL on `10.1.10.6`.

```bash
export POSTGRES_DB=aetherpanel
export POSTGRES_USER=aetherpanel
export POSTGRES_PASSWORD='replace-with-a-strong-password'
export APP_CIDR=10.1.10.0/24
./deploy/postgres/install-postgresql-ubuntu.sh
```

Then configure app hosts:

```env
POSTGRES_HOST=10.1.10.6
POSTGRES_PORT=5432
POSTGRES_DB=aetherpanel
POSTGRES_USER=aetherpanel
POSTGRES_PASSWORD=replace-with-a-strong-password
DATABASE_REQUIRED=true
```

## Redis

Run Redis on the panel host or a dedicated internal host.

```env
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_REQUIRED=true
PROVISIONING_QUEUE=redis
```

## PayPal

Production PayPal endpoints:

- Create order: `POST /api/v1/billing/paypal/orders`
- Capture order: `POST /api/v1/billing/paypal/orders/:orderId/capture`
- Webhook: `POST /api/v1/billing/paypal/webhook`

Required env:

```env
PAYPAL_MODE=live
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
PAYPAL_WEBHOOK_ID=...
PAYPAL_RETURN_URL=https://aethernode.org/checkout/paypal/return
PAYPAL_CANCEL_URL=https://aethernode.org/checkout/paypal/cancel
PAYPAL_WEBHOOK_URL=https://aethernode.org/api/v1/billing/paypal/webhook
PAYPAL_CURRENCY=USD
```

Webhook fulfillment marks the service `paid` and queues an `install` provisioning job after a verified completed payment event.

## Docker Compose

```bash
cp .env.example .env
openssl rand -hex 48
docker compose up -d --build
```

The Compose stack includes:

- `postgres`
- `redis`
- `api`
- `worker`
- `web`

## Security Checklist

- Set `NODE_ENV=production`.
- Set `DATABASE_REQUIRED=true` and `REDIS_REQUIRED=true`.
- Use a strong `JWT_SECRET` and `ENCRYPTION_KEY`.
- Do not expose PostgreSQL, Redis, or Docker TCP publicly.
- Keep `/var/run/docker.sock` limited to trusted AetherPanel services only.
- Put API and web behind trusted HTTPS.
- Rotate PayPal secrets before live launch if they were ever shared in chat or logs.
- Verify every imported game template before advertising it as fully supported.

## GitHub

Local repository is initialized on `main`. To publish:

```bash
git remote add origin git@github.com:SemperTired/AetherPanel.git
git push -u origin main
```

Repository creation requires GitHub CLI, an authenticated GitHub token, or creating `SemperTired/AetherPanel` in the GitHub UI first.
