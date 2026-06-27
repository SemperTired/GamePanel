import { Global, Module } from "@nestjs/common";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import { PortProtocol, Role } from "@aetherpanel/shared";

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  role: Role;
  password_hash: string;
  created_at: string;
}

export interface ServiceRecord {
  id: string;
  name: string;
  template_id: string;
  owner_user_id: string;
  status: string;
  power_state: string;
  runtime_id?: string;
  node_id?: string;
  ports: Array<{ key: string; host: number; container: number; protocol: PortProtocol; host_ip: string }>;
  mods: unknown[];
  startup_variables?: Record<string, string>;
  network_mappings?: unknown[];
  created_at: string;
  updated_at: string;
}

export type AuditRecord = {
  id: string;
  actor: string;
  action: string;
  target?: string;
  metadata?: unknown;
  created_at: string;
};

const databaseRequired = () => process.env.DATABASE_REQUIRED === "true" || process.env.NODE_ENV === "production";

export class DataStore {
  public readonly pool = new Pool({
    host: process.env.POSTGRES_HOST || "127.0.0.1",
    port: Number(process.env.POSTGRES_PORT || 5432),
    database: process.env.POSTGRES_DB || "aetherpanel",
    user: process.env.POSTGRES_USER || "aetherpanel",
    password: process.env.POSTGRES_PASSWORD || "change-me",
    connectionTimeoutMillis: Number(process.env.POSTGRES_CONNECT_TIMEOUT_MS || 1500),
  });

  public readonly users = new Map<string, UserRecord>();
  public readonly services = new Map<string, ServiceRecord>();
  public readonly audits: AuditRecord[] = [];
  public readonly nodes = new Map<string, unknown>();
  public readonly settings = new Map<string, unknown>();
  public readonly provisioningJobs = new Map<string, unknown>();
  public readonly infrastructureConnectors = new Map<string, unknown>();
  public databaseOnline = false;
  private seeded = false;

  async seed(): Promise<void> {
    if (this.seeded) return;
    this.seeded = true;
    await this.connectAndHydrate();
    await this.ensureSuperadmin();
    await this.ensureLocalNode();
  }

  private async connectAndHydrate(): Promise<void> {
    try {
      await this.migrate();
      await this.hydrate();
      this.databaseOnline = true;
    } catch (error) {
      this.databaseOnline = false;
      const message = error instanceof Error ? error.message : String(error);
      if (databaseRequired()) throw new Error(`PostgreSQL is required but unavailable: ${message}`, { cause: error });
      console.warn(`[data] PostgreSQL unavailable, using volatile memory store: ${message}`);
    }
  }

  private async migrate(): Promise<void> {
    await this.pool.query(`
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
    `);
  }

  private async hydrate(): Promise<void> {
    const [users, services, nodes, settings, jobs, audits, connectors] = await Promise.all([
      this.pool.query("select id, email, name, role, password_hash, created_at from users"),
      this.pool.query("select data from services"),
      this.pool.query("select data from nodes"),
      this.pool.query("select section, data from settings"),
      this.pool.query("select data from provisioning_jobs"),
      this.pool.query("select id, actor, action, target, metadata, created_at from audit_logs order by created_at desc limit 500"),
      this.pool.query("select data from infrastructure_connectors"),
    ]);

    for (const row of users.rows) this.users.set(row.id, { ...row, created_at: new Date(row.created_at).toISOString() });
    for (const row of services.rows) this.services.set(row.data.id, this.deserializeDates(row.data) as ServiceRecord);
    for (const row of nodes.rows) this.nodes.set(row.data.id, this.deserializeDates(row.data));
    for (const row of settings.rows) this.settings.set(row.section, row.data);
    for (const row of jobs.rows) this.provisioningJobs.set(row.data.id, this.deserializeDates(row.data));
    for (const row of audits.rows) {
      this.audits.push({
        id: row.id,
        actor: row.actor,
        action: row.action,
        target: row.target,
        metadata: row.metadata,
        created_at: new Date(row.created_at).toISOString(),
      });
    }
    for (const row of connectors.rows) this.infrastructureConnectors.set(row.data.id, this.deserializeDates(row.data));
  }

  private deserializeDates(value: Record<string, unknown>) {
    return {
      ...value,
      created_at: value.created_at ? new Date(String(value.created_at)).toISOString() : new Date().toISOString(),
      updated_at: value.updated_at ? new Date(String(value.updated_at)).toISOString() : new Date().toISOString(),
    };
  }

  private async ensureSuperadmin(): Promise<void> {
    if (this.users.size) return;
    const email = (process.env.SUPERADMIN_EMAIL || "admin@aetherpanel.local").toLowerCase();
    const password = process.env.SUPERADMIN_PASSWORD || "change-me-now";
    await this.saveUser({
      id: "usr_superadmin",
      email,
      name: "AetherPanel Superadmin",
      role: "superadmin",
      password_hash: await bcrypt.hash(password, 10),
      created_at: new Date().toISOString(),
    });
  }

  private async ensureLocalNode(): Promise<void> {
    if (this.nodes.size) return;
    await this.saveNode({
      id: "local",
      name: "Local Docker Node",
      location_id: "local",
      status: "online",
      runtime: "docker",
      created_at: new Date().toISOString(),
    });
  }

  async saveUser(user: UserRecord): Promise<void> {
    this.users.set(user.id, user);
    if (!this.databaseOnline) return;
    await this.pool.query(
      `insert into users(id, email, name, role, password_hash, created_at)
       values($1, $2, $3, $4, $5, $6)
       on conflict(id) do update set email = excluded.email, name = excluded.name, role = excluded.role, password_hash = excluded.password_hash`,
      [user.id, user.email, user.name, user.role, user.password_hash, user.created_at],
    );
  }

  async saveService(service: ServiceRecord): Promise<void> {
    this.services.set(service.id, service);
    if (!this.databaseOnline) return;
    await this.pool.query(
      `insert into services(id, owner_user_id, template_id, name, status, power_state, data, created_at, updated_at)
       values($1, $2, $3, $4, $5, $6, $7, $8, $9)
       on conflict(id) do update set owner_user_id = excluded.owner_user_id, template_id = excluded.template_id,
       name = excluded.name, status = excluded.status, power_state = excluded.power_state, data = excluded.data,
       updated_at = excluded.updated_at`,
      [service.id, service.owner_user_id, service.template_id, service.name, service.status, service.power_state, service, service.created_at, service.updated_at],
    );
  }

  async saveNode(node: Record<string, unknown>): Promise<void> {
    this.nodes.set(String(node.id), node);
    if (!this.databaseOnline) return;
    await this.pool.query(
      `insert into nodes(id, data, created_at, updated_at) values($1, $2, now(), now())
       on conflict(id) do update set data = excluded.data, updated_at = now()`,
      [node.id, node],
    );
  }

  async saveSetting(section: string, value: unknown): Promise<void> {
    this.settings.set(section, value);
    if (!this.databaseOnline) return;
    await this.pool.query(
      `insert into settings(section, data, updated_at) values($1, $2, now())
       on conflict(section) do update set data = excluded.data, updated_at = now()`,
      [section, value],
    );
  }

  async saveProvisioningJob(job: Record<string, unknown>): Promise<void> {
    this.provisioningJobs.set(String(job.id), job);
    if (!this.databaseOnline) return;
    await this.pool.query(
      `insert into provisioning_jobs(id, service_id, action, status, data, created_at, updated_at)
       values($1, $2, $3, $4, $5, $6, now())
       on conflict(id) do update set status = excluded.status, data = excluded.data, updated_at = now()`,
      [job.id, job.service_id, job.action, job.status, job, job.created_at ?? new Date().toISOString()],
    );
  }

  async saveInfrastructureConnector(connector: Record<string, unknown>): Promise<void> {
    this.infrastructureConnectors.set(String(connector.id), connector);
    if (!this.databaseOnline) return;
    await this.pool.query(
      `insert into infrastructure_connectors(id, provider, name, data, created_at, updated_at)
       values($1, $2, $3, $4, $5, now())
       on conflict(id) do update set provider = excluded.provider, name = excluded.name, data = excluded.data, updated_at = now()`,
      [connector.id, connector.provider, connector.name, connector, connector.created_at ?? new Date().toISOString()],
    );
  }

  async recordAudit(record: AuditRecord): Promise<void> {
    this.audits.unshift(record);
    if (this.audits.length > 500) this.audits.length = 500;
    if (!this.databaseOnline) return;
    await this.pool.query(
      `insert into audit_logs(id, actor, action, target, metadata, created_at) values($1, $2, $3, $4, $5, $6)
       on conflict(id) do nothing`,
      [record.id, record.actor, record.action, record.target ?? null, record.metadata ?? null, record.created_at],
    );
  }
}

@Global()
@Module({
  providers: [DataStore],
  exports: [DataStore],
})
export class DataModule {}
