#!/usr/bin/env bash
set -euo pipefail

DB_NAME="${POSTGRES_DB:-aetherpanel}"
DB_USER="${POSTGRES_USER:-aetherpanel}"
DB_PASSWORD="${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD before running this script.}"
APP_CIDR="${APP_CIDR:-10.1.10.0/24}"

sudo apt-get update
sudo apt-get install -y postgresql postgresql-contrib

PG_VERSION="$(ls /etc/postgresql | sort -V | tail -1)"
PG_CONF="/etc/postgresql/${PG_VERSION}/main/postgresql.conf"
PG_HBA="/etc/postgresql/${PG_VERSION}/main/pg_hba.conf"

sudo -u postgres psql <<SQL
do \$\$
begin
  if not exists (select from pg_roles where rolname = '${DB_USER}') then
    create role ${DB_USER} login password '${DB_PASSWORD}';
  else
    alter role ${DB_USER} with login password '${DB_PASSWORD}';
  end if;
end
\$\$;

select 'create database ${DB_NAME} owner ${DB_USER}'
where not exists (select from pg_database where datname = '${DB_NAME}')\\gexec
grant all privileges on database ${DB_NAME} to ${DB_USER};
SQL

sudo sed -i "s/^#\\?listen_addresses\\s*=.*/listen_addresses = '*'/" "${PG_CONF}"
if ! sudo grep -q "AetherPanel application subnet" "${PG_HBA}"; then
  echo "# AetherPanel application subnet" | sudo tee -a "${PG_HBA}" >/dev/null
  echo "host    ${DB_NAME}    ${DB_USER}    ${APP_CIDR}    scram-sha-256" | sudo tee -a "${PG_HBA}" >/dev/null
fi

sudo systemctl enable postgresql
sudo systemctl restart postgresql

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sudo -u postgres psql -d "${DB_NAME}" -f "${SCRIPT_DIR}/schema.sql"

echo "PostgreSQL is ready for AetherPanel on database ${DB_NAME}, user ${DB_USER}, subnet ${APP_CIDR}."
