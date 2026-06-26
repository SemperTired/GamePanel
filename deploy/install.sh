#!/usr/bin/env bash
set -euo pipefail

if ! grep -q "22.04" /etc/os-release; then
  echo "AetherPanel installer currently targets Ubuntu 22.04 LTS."
  exit 1
fi

sudo apt-get update
sudo apt-get install -y ca-certificates curl git openssl
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sudo sh
fi

cp .env.example .env
sed -i "s/JWT_SECRET=.*/JWT_SECRET=$(openssl rand -hex 48)/" .env
sed -i "s/ENCRYPTION_KEY=.*/ENCRYPTION_KEY=$(openssl rand -base64 32 | tr -d '\\n')/" .env
sed -i "s/POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(openssl rand -hex 18)/" .env
sed -i "s/DATABASE_REQUIRED=.*/DATABASE_REQUIRED=true/" .env
sed -i "s/REDIS_REQUIRED=.*/REDIS_REQUIRED=true/" .env
sed -i "s/NODE_ENV=.*/NODE_ENV=production/" .env

docker compose up -d --build
echo "AetherPanel is starting on http://$(hostname -I | awk '{print $1}'):4000"
echo "Default admin email comes from SUPERADMIN_EMAIL in .env. Change SUPERADMIN_PASSWORD immediately."
