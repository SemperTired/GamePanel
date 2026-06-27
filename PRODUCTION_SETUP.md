# AetherPanel Production Provisioning

## Fulfillment Flow

AetherNode should call AetherPanel after payment completion:

`POST /api/v1/billing/fulfillment/payment-completed`

Required header:

`x-aetherpanel-secret: $AETHERPANEL_FULFILLMENT_SECRET`

Example body:

```json
{
  "paid": true,
  "payment_id": "paypal-capture-or-order-id",
  "customer_email": "customer@example.com",
  "template_id": "minecraft-java",
  "service_name": "Customer Minecraft Server",
  "location_id": "local",
  "node_id": "local",
  "memory_mb": 4096,
  "disk_gb": 40,
  "cpu_limit": 2,
  "amount": "14.99",
  "currency": "USD"
}
```

If `service_id` is supplied, that service is marked paid and queued. If not supplied, AetherPanel creates the service, allocates ports, marks it paid, and queues provisioning.

## Data Layout

Set these paths to durable storage on the node:

```env
AETHERPANEL_DATA_ROOT=/srv/aetherpanel/services
AETHERPANEL_CACHE_ROOT=/srv/aetherpanel/cache
```

Each game template creates:

- a generalized cache folder under `AETHERPANEL_CACHE_ROOT`
- a per-service folder under `AETHERPANEL_DATA_ROOT/{serviceId}`
- `.aetherpanel-install.json` with the generated install plan
- `install.aetherpanel.sh` with operator-readable install commands

When `AETHERPANEL_RUN_INSTALLERS=true`, the worker runs generated installer commands and refreshes the cache from the completed service directory.

## Installers

Supported installer methods in templates:

- `steamcmd`
- `alderon`
- `fivem`
- `direct_archive`
- `docker_image`
- `manual`
- `custom`

SteamCMD templates require SteamCMD to be present in the worker/runtime image or mounted on the node. Non-anonymous games require `STEAMCMD_USERNAME` and `STEAMCMD_PASSWORD`.

AetherPanel now exposes template readiness metadata in the admin template screen and blocks live provisioning when strict readiness is enabled:

```env
AETHERPANEL_STRICT_TEMPLATE_READINESS=true
AETHERPANEL_RUN_INSTALLERS=true
AETHERPANEL_BACKUP_ROOT=/srv/aetherpanel/backups
```

FiveM is a first-class installer method. To sell FiveM, provide:

```env
FIVEM_LICENSE_KEY=your-cfx-license-key
FIVEM_ARTIFACT_URL=https://runtime.fivem.net/artifacts/fivem/build_proot_linux/master/.../fx.tar.xz
STEAM_WEB_API_KEY=optional-but-recommended
```

The FiveM installer creates `/data/server`, `/data/server-data`, downloads the Linux artifact, clones `cfx-server-data`, and writes a starter `server.cfg`.

Path of Titans/Alderon is a first-class installer method but requires operator-supplied Alderon credentials and a non-interactive install command on each target node:

```env
ALDERON_EMAIL=provider-account@example.com
ALDERON_PASSWORD=provider-password
ALDERON_INSTALL_COMMAND='approved non-interactive Alderon install command'
```

SteamCMD games that require authenticated app access need:

```env
STEAMCMD_USERNAME=steam-account
STEAMCMD_PASSWORD=steam-password
```

Do not publish a product card for a template unless its admin readiness badge says `Ready to Sell` and a smoke service has passed provision, start, backup, restore, stop, and delete on the intended target node.

## Backup And Restore

The node agent supports:

- `GET /backups/{serviceId}` to list backup archives.
- `POST /backups/{serviceId}` to create a `.tar.gz` from the service directory.
- `PUT /backups/{serviceId}` with `{ "name": "backup.tar.gz" }` to stop-safe restore files from the selected archive.

The web panel exposes Create Backup and Restore controls under `Backups`. Restores stop the container first, replace the service directory, and write `.aetherpanel-restore.json` in the restored service directory.

## Sellable Game Families

Use this release gate before taking payments:

- Docker image titles: sell only after image pull, start, backup, restore, and delete are verified on the target.
- Anonymous SteamCMD titles: sell after `AETHERPANEL_RUN_INSTALLERS=true` succeeds once and the cache is ready.
- Authenticated SteamCMD titles: sell after Steam credentials are configured and the cache is ready.
- FiveM: sell after `FIVEM_LICENSE_KEY` and `FIVEM_ARTIFACT_URL` are configured and one FXServer smoke instance starts.
- Path of Titans: sell after `ALDERON_INSTALL_COMMAND`, `ALDERON_EMAIL`, and `ALDERON_PASSWORD` are configured and one smoke instance starts with a real server binary.

## Ports And Network

Configure the public port pool:

```env
PORT_POOL_START=30000
PORT_POOL_END=60000
NODE_BIND_IP=0.0.0.0
NODE_LAN_IP=10.1.10.x
AETHERNODE_WAN_IP=75.122.94.89
NETWORK_APPLY_MODE=dry_run
```

Services allocate unique host ports at creation time. Provisioning records network mappings for every exposed port. Keep `NETWORK_APPLY_MODE=dry_run` until the UniFiOS or UPnP write connector is confirmed against production networking.

## Queue Requirements

Production should run:

- API
- web
- worker
- PostgreSQL
- Redis
- Docker Engine on runtime nodes

Use:

```env
DATABASE_REQUIRED=true
REDIS_REQUIRED=true
PROVISIONING_QUEUE=redis
```

## Runtime Nodes

AetherPanel supports three runtime target modes:

- `local`: use Docker on the same host/container.
- `docker_host`: connect to a Docker TCP/unix endpoint from node metadata.
- `agent`: call the AetherPanel node agent over HTTP.

Recommended on-prem layout:

```json
{
  "id": "amp-linux-target",
  "name": "AMP Linux Target",
  "host": "10.1.10.48",
  "runtime_mode": "agent",
  "agent_url": "http://10.1.10.48:4210",
  "agent_token": "$AETHERPANEL_AGENT_TOKEN",
  "data_root": "/srv/aetherpanel/services",
  "cache_root": "/srv/aetherpanel/cache"
}
```

The agent must run on the game host with Docker socket access:

```bash
docker compose up -d agent
curl -H "Authorization: Bearer $AETHERPANEL_AGENT_TOKEN" http://127.0.0.1:4210/health
```
