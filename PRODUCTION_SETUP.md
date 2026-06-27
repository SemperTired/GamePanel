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

Alderon and FiveM support is represented as first-class installer methods and generated install plans. Before live use, install the appropriate vendor tooling on the node/runtime image and provide credentials/license values through environment variables.

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
