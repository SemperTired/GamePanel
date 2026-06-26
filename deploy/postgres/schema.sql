create table if not exists users (
  id text primary key,
  email text not null unique,
  name text not null,
  role text not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists services (
  id text primary key,
  owner_user_id text not null,
  template_id text not null,
  name text not null,
  status text not null,
  power_state text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists services_owner_idx on services(owner_user_id);
create index if not exists services_template_idx on services(template_id);

create table if not exists nodes (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists settings (
  section text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists provisioning_jobs (
  id text primary key,
  service_id text not null,
  action text not null,
  status text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists provisioning_jobs_service_idx on provisioning_jobs(service_id);

create table if not exists audit_logs (
  id text primary key,
  actor text not null,
  action text not null,
  target text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_idx on audit_logs(created_at desc);

create table if not exists infrastructure_connectors (
  id text primary key,
  provider text not null,
  name text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
