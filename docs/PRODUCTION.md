# Production Deployment

1. Provision Ubuntu Server 22.04.
2. Point DNS to the panel VM.
3. Copy `.env.example` to `.env` and set strong secrets.
4. Configure PayPal/Stripe credentials only after test checkout passes.
5. Run `docker compose up -d --build`.
6. Place Caddy or Nginx/Certbot in front for trusted HTTPS.
7. Keep `/var/run/docker.sock` access limited to the API container host.

## Security Notes

- Docker runtime is the MVP runtime. Native systemd agents are intentionally deferred.
- Every file/config route must use `assertSafeRelativePath`.
- Customer routes must enforce service ownership in addition to RBAC.
- Workshop adapters should be treated as config writers, not arbitrary shell execution.
