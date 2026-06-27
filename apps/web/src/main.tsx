import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Activity, Bell, Boxes, CreditCard, Database, ExternalLink, FileText, Folder, Gauge, Gamepad2, Globe2, ImageIcon, KeyRound, LayoutDashboard, ListChecks, Loader2, Mail, Network, Play, Plus, RotateCcw, Router, Save, Search, Server, Settings, Shield, SlidersHorizontal, Sparkles, Square, UploadCloud, Users, Wifi } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import "./styles/global.css";
import { api, login, logout, token } from "./lib/api";

type Template = { id: string; name: string; category: string; summary: string; resources: { recommended_ram_mb: number; min_disk_gb: number; cpu: string }; workshop: { enabled: boolean; providers: string[] }; ports: Array<{ key: string; default: number; protocol: string }>; source?: { needs_review?: boolean; type?: string } };
type ModEntry = { id: string; provider: string; name?: string; summary?: string; thumbnail_url?: string; page_url?: string; enabled: boolean; order: number };
type ServicePort = { key: string; host: number; container?: number; protocol: string; host_ip?: string };
type NetworkMapping = { id?: string; name?: string; wan_ip?: string; external_port?: number; internal_ip?: string; internal_port?: number };
type Service = { id: string; name: string; template_id: string; status: string; power_state: string; ports: ServicePort[]; mods: ModEntry[]; runtime_id?: string; node_id?: string; network_mappings?: NetworkMapping[]; startup_variables?: Record<string, string> };
type ModProvider = { id: string; name: string; configured: boolean; searchable: boolean; web_url: string; note: string };
type ModSearchItem = { id: string; provider: string; name: string; summary?: string; thumbnail_url?: string; page_url?: string; tags?: string[]; subscriptions?: number; favorited?: number };
type FileEntry = { name: string; type: "file" | "directory"; size: number; updated_at: string };
type NavItem = [string, LucideIcon, string];

function Shell() {
  const [active, setActive] = useState("dashboard");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [nodes, setNodes] = useState<any[]>([]);
  const [audits, setAudits] = useState<any[]>([]);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [logs, setLogs] = useState("");
  const [loading, setLoading] = useState(true);

  async function refresh() {
    const [templateData, serviceData, nodeData, auditData] = await Promise.all([
      api<Template[]>("/templates"),
      api<Service[]>("/services"),
      api<any[]>("/nodes"),
      api<any[]>("/audit").catch(() => []),
    ]);
    setTemplates(templateData);
    setServices(serviceData);
    setNodes(nodeData);
    setAudits(auditData);
    setSelectedService((current) => current ? serviceData.find((service) => service.id === current.id) || null : serviceData[0] || null);
    setLoading(false);
  }

  useEffect(() => { refresh().catch(() => setLoading(false)); }, []);
  useEffect(() => {
    if (!selectedService) return;
    api<string>(`/services/${selectedService.id}/logs`).then(setLogs).catch((error) => setLogs(error.message));
  }, [selectedService?.id]);

  const stats = useMemo(() => ({
    active: services.filter((s) => s.status === "active").length,
    running: services.filter((s) => s.power_state === "running").length,
    workshop: templates.filter((t) => t.workshop.enabled).length,
    nodes: nodes.length,
    templates: templates.length,
    review: templates.filter((t) => t.source?.needs_review).length,
    mods: services.reduce((total, service) => total + (service.mods?.length || 0), 0),
    ports: services.reduce((total, service) => total + (service.ports?.length || 0), 0),
  }), [services, templates, nodes]);

  const navGroups: Array<{ label: string; items: NavItem[] }> = [
    { label: "Operate", items: [["dashboard", LayoutDashboard, "Overview"], ["services", Server, "Instances"], ["files", Folder, "Files"], ["config", SlidersHorizontal, "Config"], ["mods", Boxes, "Mods"]] },
    { label: "Deploy", items: [["templates", Gamepad2, "Game Library"], ["provisioning", ListChecks, "Queue"], ["nodes", Network, "Nodes"]] },
    { label: "Business", items: [["billing", CreditCard, "Billing"], ["users", Users, "Users"], ["audit", Shield, "Audit"]] },
    { label: "Platform", items: [["infrastructure", Router, "Network"], ["settings", Settings, "Settings"]] },
  ];
  const nav = navGroups.flatMap((group) => group.items);
  const selectedTemplate = selectedService ? templates.find((template) => template.id === selectedService.template_id) : null;

  if (loading) return <div className="min-h-screen grid place-items-center"><Loader2 className="h-8 w-8 animate-spin text-cyan" /></div>;

  return (
    <div className="panel-shell min-h-screen">
      <aside className="panel-sidebar">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-cyan/15 text-cyan glow"><Gauge /></div>
          <div>
            <div className="font-display text-xl font-bold">AetherPanel</div>
            <div className="text-xs text-slate-400">AetherNode Control</div>
          </div>
        </div>

        <div className="service-switcher">
          <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.18em] text-slate-500"><span>Active Instance</span><span>{services.length}</span></div>
          {selectedService ? <div className="rounded-2xl border border-cyan/20 bg-cyan/10 p-3">
            <div className="truncate font-semibold">{selectedService.name}</div>
            <div className="mt-1 truncate text-xs text-slate-400">{selectedTemplate?.name || selectedService.template_id}</div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <span className="rounded-lg bg-black/25 px-2 py-1 text-emerald-200">{selectedService.status}</span>
              <span className="rounded-lg bg-black/25 px-2 py-1 text-cyan">{selectedService.power_state}</span>
            </div>
          </div> : <div className="rounded-2xl border border-dashed border-white/15 p-4 text-sm text-slate-400">No service selected</div>}
          <div className="mt-3 max-h-36 space-y-1 overflow-auto">
            {services.slice(0, 8).map((service) => <button key={service.id} onClick={() => setSelectedService(service)} className={`mini-service ${selectedService?.id === service.id ? "mini-service-active" : ""}`}>
              <span className="truncate">{service.name}</span><span>{service.power_state}</span>
            </button>)}
          </div>
        </div>

        <nav className="mt-5 space-y-5">
          {navGroups.map((group) => <div key={group.label}>
            <div className="mb-2 px-2 text-[0.68rem] font-bold uppercase tracking-[0.22em] text-slate-500">{group.label}</div>
            <div className="space-y-1">
              {group.items.map(([id, Icon, label]) => (
                <button key={id} onClick={() => setActive(id)} className={`nav-item ${active === id ? "nav-item-active" : ""}`}>
                  <Icon className="h-4 w-4" /> {label}
                </button>
              ))}
            </div>
          </div>)}
        </nav>
        <button onClick={logout} className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-300 hover:bg-white/5">
          <KeyRound className="h-4 w-4" /> Sign out
        </button>
      </aside>
      <main className="panel-main">
        <header className="topbar">
          <div>
            <div className="text-sm uppercase tracking-[0.3em] text-cyan">AetherNode Hosting</div>
            <h1 className="font-display text-4xl font-bold">{nav.find(([id]) => id === active)?.[2]}</h1>
          </div>
          <div className="topbar-metrics">
            <span><Server className="h-4 w-4" /> {stats.active} active</span>
            <span><Gamepad2 className="h-4 w-4" /> {stats.templates} games</span>
            <span><Network className="h-4 w-4" /> {stats.nodes} nodes</span>
          </div>
        </header>
        {active === "dashboard" && <Dashboard stats={stats} audits={audits} services={services} />}
        {active === "templates" && <Templates templates={templates} />}
        {active === "services" && <Services services={services} templates={templates} selected={selectedService} setSelected={setSelectedService} refresh={refresh} logs={logs} />}
        {active === "files" && <FilesPanel service={selectedService} />}
        {active === "config" && <ConfigurationPanel service={selectedService} />}
        {active === "mods" && <Mods service={selectedService} refresh={refresh} />}
        {active === "infrastructure" && <InfrastructurePanel service={selectedService} />}
        {active === "nodes" && <Panel title="Nodes" items={nodes} empty="No nodes yet. The local Docker node is seeded by the API." />}
        {active === "billing" && <Billing />}
        {active === "provisioning" && <Provisioning />}
        {active === "users" && <Placeholder icon={Users} title="Users & Roles" body="RBAC contracts are implemented for superadmin, provider admin, staff, customer, and viewer roles." />}
        {active === "settings" && <SettingsPanel />}
        {active === "audit" && <Panel title="Audit Log" items={audits} empty="No audit events yet." />}
      </main>
    </div>
  );
}

function Dashboard({ stats, audits, services }: any) {
  const statusRows = [
    ["Active Services", stats.active, Server, "Provisioned and customer-visible"],
    ["Running Now", stats.running, Activity, "Power state currently running"],
    ["Game Catalog", stats.templates, Gamepad2, `${stats.review} imported templates pending review`],
    ["Open Ports", stats.ports, Wifi, "Customer-facing bindings planned"],
    ["Workshop Ready", stats.workshop, Boxes, "Templates with mod provider support"],
    ["Nodes Online", stats.nodes, Network, "Runtime capacity records"],
    ["Installed Mods", stats.mods, Sparkles, "Across all services"],
    ["Audit Events", audits.length, Shield, "Recent platform activity"],
  ];
  return <div className="space-y-6">
    <section className="dashboard-hero">
      <div className="relative z-10">
        <div className="mb-2 text-sm uppercase tracking-[0.28em] text-cyan">Operator Overview</div>
        <h2 className="font-display text-5xl font-bold">AetherNode Service Control</h2>
        <p className="mt-3 max-w-3xl text-slate-300">Monitor game instances, provisioning state, network exposure, customer workload, and template readiness from one focused workspace.</p>
      </div>
      <div className="relative z-10 grid grid-cols-3 gap-3">
        <MetricPill label="Healthy" value={`${Math.max(0, stats.active - services.filter((s: Service) => s.status === "failed").length)}`} />
        <MetricPill label="Queued" value={services.filter((s: Service) => s.status === "queued").length} />
        <MetricPill label="Suspended" value={services.filter((s: Service) => s.status === "suspended").length} />
      </div>
    </section>

    <div className="grid grid-cols-4 gap-4">
      {statusRows.map(([label, value, Icon, detail]: any) => (
        <div key={label} className="metric-card"><Icon className="text-cyan" /><div className="mt-4 text-3xl font-bold">{value}</div><div className="text-sm font-semibold text-slate-200">{label}</div><p>{detail}</p></div>
      ))}
    </div>

    <div className="grid grid-cols-[1.25fr_0.75fr] gap-4">
      <div className="command-panel rounded-3xl p-6"><h2 className="mb-4 font-display text-2xl">Instances</h2><ServiceRows services={services} detailed /></div>
      <div className="command-panel rounded-3xl p-6"><h2 className="mb-4 font-display text-2xl">Recent Activity</h2><ActivityFeed audits={audits} /></div>
    </div>
  </div>;
}

function MetricPill({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-2xl border border-white/10 bg-black/25 p-4"><div className="text-3xl font-bold text-white">{value}</div><div className="text-xs uppercase tracking-[0.18em] text-slate-400">{label}</div></div>;
}

function ActivityFeed({ audits }: { audits: any[] }) {
  if (!audits.length) return <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-slate-400">No recent activity.</div>;
  return <div className="space-y-3">{audits.slice(0, 10).map((audit) => <div key={audit.id || `${audit.action}-${audit.created_at}`} className="activity-row">
    <div className="grid h-9 w-9 place-items-center rounded-xl bg-cyan/10 text-cyan"><Shield className="h-4 w-4" /></div>
    <div className="min-w-0"><div className="truncate text-sm font-semibold">{audit.action || "event"}</div><div className="truncate text-xs text-slate-500">{audit.actor || "system"} · {audit.target || "platform"}</div></div>
  </div>)}</div>;
}

function Templates({ templates }: { templates: Template[] }) {
  const [q, setQ] = useState("");
  const filtered = templates.filter((template) => `${template.name} ${template.category}`.toLowerCase().includes(q.toLowerCase()));
  return <div className="space-y-4">
    <div className="relative"><Search className="absolute left-4 top-3 h-4 w-4 text-slate-500" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search templates..." className="w-full rounded-2xl border border-white/10 bg-black/25 py-3 pl-11 pr-4 outline-none focus:border-cyan/50" /></div>
    <div className="grid grid-cols-3 gap-4">
      {filtered.map((template) => <div key={template.id} className="glass rounded-2xl p-5">
        <div className="mb-2 flex items-center justify-between"><h3 className="font-display text-xl">{template.name}</h3><span className="rounded-full bg-violet/15 px-2 py-1 text-xs text-violet-200">{template.category}</span></div>
        <p className="mb-4 min-h-12 text-sm text-slate-400">{template.summary}</p>
        <div className="grid grid-cols-3 gap-2 text-xs text-slate-300"><span>{template.resources.recommended_ram_mb / 1024}GB RAM</span><span>{template.resources.min_disk_gb}GB disk</span><span>{template.ports[0]?.default}/{template.ports[0]?.protocol}</span></div>
        {template.workshop.enabled && <div className="mt-4 rounded-xl border border-cyan/20 bg-cyan/10 px-3 py-2 text-xs text-cyan">Workshop: {template.workshop.providers.join(", ")}</div>}
      </div>)}
    </div>
  </div>;
}

function Services({ services, templates, selected, setSelected, refresh, logs }: any) {
  async function createService(templateId: string) {
    await api("/services", { method: "POST", body: JSON.stringify({ name: `${templateId} server`, template_id: templateId, owner_user_id: "usr_superadmin", location_id: "local", auto_start: false }) });
    await refresh();
  }
  async function power(action: string) {
    if (!selected) return;
    await api(`/services/${selected.id}/power/${action}`, { method: "POST" });
    await refresh();
  }
  const template = selected ? templates.find((item: Template) => item.id === selected.template_id) : null;
  return <div className="grid grid-cols-[360px_1fr] gap-5">
    <div className="command-panel rounded-3xl p-5">
      <h2 className="mb-4 font-display text-2xl">Deploy</h2>
      <div className="max-h-[560px] space-y-2 overflow-auto">
        {templates.slice(0, 24).map((template: Template) => <button key={template.id} onClick={() => createService(template.id)} className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-sm hover:border-cyan/40">
          <span>{template.name}</span><UploadCloud className="h-4 w-4 text-cyan" />
        </button>)}
      </div>
    </div>
    <div className="space-y-5">
      <div className="command-panel rounded-3xl p-5"><h2 className="mb-4 font-display text-2xl">Instances</h2><ServiceRows services={services} onPick={setSelected} selectedId={selected?.id} detailed /></div>
      {selected && <div className="command-panel rounded-3xl p-5">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div><h3 className="font-display text-3xl">{selected.name}</h3><div className="mt-1 text-sm text-slate-400">{template?.name || selected.template_id} · {selected.node_id || "local node"}</div></div>
          <div className="flex gap-2">{["start", "stop", "restart", "kill"].map((action) => <button key={action} onClick={() => power(action)} className="control-button">{action === "start" ? <Play className="h-4 w-4" /> : action === "stop" ? <Square className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />} {action}</button>)}</div>
        </div>
        <div className="mb-5 grid grid-cols-5 gap-3">
          <DataPoint icon={Activity} label="State" value={selected.power_state} />
          <DataPoint icon={Shield} label="Status" value={selected.status} />
          <DataPoint icon={Wifi} label="Ports" value={selected.ports?.length || 0} />
          <DataPoint icon={Boxes} label="Mods" value={selected.mods?.length || 0} />
          <DataPoint icon={Database} label="Runtime" value={selected.runtime_id ? "Ready" : "Pending"} />
        </div>
        <div className="mb-5 grid grid-cols-2 gap-4">
          <InfoBlock title="Connection Info" items={(selected.ports || []).map((port: ServicePort) => [`${port.key} ${port.protocol}`, `${port.host_ip || "0.0.0.0"}:${port.host}`])} />
          <InfoBlock title="Network Mappings" items={(selected.network_mappings || []).map((mapping: NetworkMapping) => [mapping.name || mapping.id || "mapping", `${mapping.wan_ip || "WAN"}:${mapping.external_port || "?"} -> ${mapping.internal_ip || "LAN"}:${mapping.internal_port || "?"}`])} empty="No port-forward mappings recorded yet." />
        </div>
        <pre className="h-72 overflow-auto rounded-xl border border-white/10 bg-black/40 p-4 font-mono text-xs text-emerald-200">{logs}</pre>
      </div>}
    </div>
  </div>;
}

function DataPoint({ icon: Icon, label, value }: any) {
  return <div className="data-point"><Icon className="h-4 w-4 text-cyan" /><div><div className="text-xs text-slate-500">{label}</div><div className="truncate font-semibold">{value}</div></div></div>;
}

function InfoBlock({ title, items, empty }: { title: string; items: Array<[string, string]>; empty?: string }) {
  return <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><h4 className="mb-3 font-semibold">{title}</h4>{items.length ? <div className="space-y-2">{items.map(([key, value]) => <div key={`${key}-${value}`} className="flex items-center justify-between gap-3 text-sm"><span className="text-slate-400">{key}</span><span className="font-mono text-cyan">{value}</span></div>)}</div> : <div className="text-sm text-slate-500">{empty || "No data yet."}</div>}</div>;
}

function ServiceRows({ services, onPick, selectedId, detailed }: any) {
  if (!services.length) return <div className="rounded-xl border border-dashed border-white/15 p-8 text-center text-slate-400">No services yet.</div>;
  return <div className="space-y-2">{services.map((service: Service) => <button key={service.id} onClick={() => onPick?.(service)} className={`service-row ${selectedId === service.id ? "service-row-active" : ""}`}>
    <span className="min-w-0"><span className="block truncate font-semibold">{service.name}</span><span className="text-xs text-slate-500">{service.template_id}</span>{detailed && <span className="mt-2 flex gap-2 text-[0.7rem] text-slate-400"><span>{service.ports?.length || 0} ports</span><span>{service.mods?.length || 0} mods</span><span>{service.node_id || "local"}</span></span>}</span><span className={`status-pill ${service.power_state === "running" ? "status-good" : ""}`}>{service.power_state}</span>
  </button>)}</div>;
}

function FilesPanel({ service }: { service: Service | null }) {
  const [path, setPath] = useState(".");
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [openFile, setOpenFile] = useState("");
  const [content, setContent] = useState("");
  const [message, setMessage] = useState("");

  async function load(target = path) {
    if (!service) return;
    setMessage("");
    const data = await api<FileEntry[]>(`/services/${service.id}/files?path=${encodeURIComponent(target)}`);
    setEntries(data);
    setPath(target);
  }

  async function readFile(name: string) {
    if (!service) return;
    const filePath = path === "." ? name : `${path}/${name}`;
    const data = await api<{ content: string; path: string }>(`/services/${service.id}/files/content?path=${encodeURIComponent(filePath)}`);
    setOpenFile(data.path);
    setContent(data.content);
  }

  async function saveFile() {
    if (!service || !openFile) return;
    await api(`/services/${service.id}/files/content`, { method: "PUT", body: JSON.stringify({ path: openFile, content }) });
    setMessage(`Saved ${openFile}`);
    await load(path);
  }

  useEffect(() => { if (service) load(".").catch((error) => setMessage(error.message)); }, [service?.id]);

  if (!service) return <div className="empty-state"><Folder className="mx-auto mb-4 h-12 w-12 text-cyan" /><h2>Select a server</h2><p>Files are scoped to a single service volume.</p></div>;
  return <div className="grid grid-cols-[360px_1fr] gap-5">
    <div className="command-panel rounded-3xl p-5">
      <div className="mb-4 flex items-center justify-between"><h2 className="font-display text-2xl">Files</h2><button className="icon-button" onClick={() => load(".")}>Root</button></div>
      <div className="mb-3 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs text-slate-300">{path}</div>
      <div className="space-y-2">
        {path !== "." && <button className="provider-tile" onClick={() => load(path.split("/").slice(0, -1).join("/") || ".")}><Folder className="h-4 w-4" /> ..</button>}
        {entries.map((entry) => <button key={entry.name} className="provider-tile" onClick={() => entry.type === "directory" ? load(path === "." ? entry.name : `${path}/${entry.name}`) : readFile(entry.name)}>
          {entry.type === "directory" ? <Folder className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
          <span className="flex-1 truncate">{entry.name}</span>
          <span className="text-xs text-slate-500">{entry.type === "file" ? `${entry.size}b` : "dir"}</span>
        </button>)}
      </div>
      {message && <div className="mt-4 rounded-xl border border-cyan/20 bg-cyan/10 px-3 py-2 text-sm text-cyan">{message}</div>}
    </div>
    <div className="command-panel rounded-3xl p-5">
      <div className="mb-4 flex items-center justify-between"><h2 className="font-display text-2xl">{openFile || "Select a file"}</h2><button className="primary-button" onClick={saveFile} disabled={!openFile}><Save className="h-4 w-4" /> Save</button></div>
      <textarea value={content} onChange={(event) => setContent(event.target.value)} className="h-[620px] w-full rounded-2xl border border-white/10 bg-black/40 p-4 font-mono text-sm text-emerald-100 outline-none focus:border-cyan/50" spellCheck={false} />
    </div>
  </div>;
}

function ConfigurationPanel({ service }: { service: Service | null }) {
  const [config, setConfig] = useState<any>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");

  async function load() {
    if (!service) return;
    const data = await api<any>(`/services/${service.id}/configuration`);
    setConfig(data);
    setValues(Object.fromEntries((data.startup_variables || []).map((variable: any) => [variable.key, variable.value || ""])));
  }

  async function save() {
    if (!service) return;
    const data = await api<any>(`/services/${service.id}/configuration/startup`, { method: "PUT", body: JSON.stringify({ values }) });
    setConfig(data);
    setMessage("Configuration saved. Restart the service to apply startup changes.");
  }

  useEffect(() => { load().catch((error) => setMessage(error.message)); }, [service?.id]);

  if (!service) return <div className="empty-state"><SlidersHorizontal className="mx-auto mb-4 h-12 w-12 text-cyan" /><h2>Select a server</h2><p>Configuration is generated from the selected game template.</p></div>;
  return <div className="space-y-5">
    <div className="hero-panel overflow-hidden rounded-[2rem] p-7"><div className="relative z-10"><div className="text-sm uppercase tracking-[0.25em] text-cyan">Instance Config</div><h2 className="font-display text-4xl font-bold">{service.name}</h2></div></div>
    <div className="grid grid-cols-2 gap-5">
      <div className="command-panel rounded-3xl p-5">
        <div className="mb-4 flex items-center justify-between"><h3 className="font-display text-2xl">Startup Variables</h3><button className="primary-button" onClick={save}><Save className="h-4 w-4" /> Save</button></div>
        <div className="space-y-3">
          {(config?.startup_variables || []).map((variable: any) => <label key={variable.key} className="block">
            <span className="mb-1 block text-sm text-slate-300">{variable.label}</span>
            <input className="field" value={values[variable.key] || ""} onChange={(event) => setValues({ ...values, [variable.key]: event.target.value })} disabled={!variable.customer_editable} />
          </label>)}
          {!config?.startup_variables?.length && <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-slate-400">No startup variables declared for this template yet.</div>}
        </div>
      </div>
      <div className="command-panel rounded-3xl p-5">
        <h3 className="mb-4 font-display text-2xl">Managed Config Files</h3>
        <div className="space-y-3">{(config?.config_files || []).map((file: any) => <div key={file.path} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <strong>{file.path}</strong><div className="mt-1 text-xs text-slate-400">{file.type} · {file.editable ? "editable" : "locked"}</div>
        </div>)}</div>
        {!config?.config_files?.length && <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-slate-400">This template has no managed config files yet. Use Files for manual edits.</div>}
      </div>
    </div>
    {message && <div className="rounded-2xl border border-cyan/20 bg-cyan/10 px-4 py-3 text-sm text-cyan">{message}</div>}
  </div>;
}

function InfrastructurePanel({ service }: { service: Service | null }) {
  const [connectors, setConnectors] = useState<any[]>([]);
  const [form, setForm] = useState({ name: "AetherNode UniFi", provider: "unifi_os", base_url: "https://unifi.ui.com", site_id: "default", gateway_ip: "", wan_ip: "", dry_run: true });
  const [plan, setPlan] = useState<any>(null);
  const [message, setMessage] = useState("");

  async function load() {
    setConnectors(await api<any[]>("/infrastructure/connectors"));
  }
  async function create() {
    const connector = await api<any>("/infrastructure/connectors", { method: "POST", body: JSON.stringify(form) });
    setMessage(`Connector saved: ${connector.name}`);
    await load();
  }
  async function planPorts() {
    if (!service) return;
    setPlan(await api<any>(`/infrastructure/services/${service.id}/port-plan`));
  }
  async function applyPorts() {
    if (!service) return;
    setPlan(await api<any>(`/infrastructure/services/${service.id}/apply-port-forwards`, { method: "POST", body: JSON.stringify({}) }));
  }
  useEffect(() => { load().catch((error) => setMessage(error.message)); }, []);

  return <div className="space-y-5">
    <section className="hero-panel overflow-hidden rounded-[2rem] p-7"><div className="relative z-10"><div className="text-sm uppercase tracking-[0.25em] text-cyan">Backend Infrastructure</div><h2 className="font-display text-4xl font-bold">Network Automation</h2><p className="mt-2 max-w-2xl text-sm text-slate-300">Register UniFiOS, UPnP, or manual connectors so AetherPanel can prepare customer-facing port mappings per instance.</p></div></section>
    <div className="grid grid-cols-[420px_1fr] gap-5">
      <div className="command-panel rounded-3xl p-5">
        <h3 className="mb-4 font-display text-2xl">New Connector</h3>
        <div className="space-y-3">
          <input className="field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Connector name" />
          <select className="field" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })}><option value="unifi_os">UniFiOS</option><option value="upnp">UPnP</option><option value="manual">Manual</option></select>
          <input className="field" value={form.base_url} onChange={(e) => setForm({ ...form, base_url: e.target.value })} placeholder="UniFiOS base URL" />
          <input className="field" value={form.gateway_ip} onChange={(e) => setForm({ ...form, gateway_ip: e.target.value })} placeholder="Internal game node IP" />
          <input className="field" value={form.wan_ip} onChange={(e) => setForm({ ...form, wan_ip: e.target.value })} placeholder="WAN IP shown to players" />
          <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={form.dry_run} onChange={(e) => setForm({ ...form, dry_run: e.target.checked })} /> Dry run only</label>
          <button className="primary-button w-full" onClick={create}><Plus className="h-4 w-4" /> Save Connector</button>
        </div>
      </div>
      <div className="space-y-5">
        <Panel title="Connectors" items={connectors} empty="No infrastructure connectors yet." />
        <div className="command-panel rounded-3xl p-5">
          <div className="mb-4 flex items-center justify-between"><h3 className="font-display text-2xl">Port Plan</h3><div className="flex gap-2"><button className="icon-button" onClick={planPorts}>Plan</button><button className="primary-button" onClick={applyPorts}>Apply</button></div></div>
          {service ? <pre className="max-h-80 overflow-auto rounded-2xl bg-black/30 p-4 text-xs text-slate-300">{JSON.stringify(plan || service.ports, null, 2)}</pre> : <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-slate-400">Select a service to generate mappings.</div>}
        </div>
      </div>
    </div>
    {message && <div className="rounded-2xl border border-cyan/20 bg-cyan/10 px-4 py-3 text-sm text-cyan">{message}</div>}
  </div>;
}

function SettingsPanel() {
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [activeSection, setActiveSection] = useState("branding");
  const [message, setMessage] = useState("");
  const sections = [
    ["branding", Gauge, "Branding"],
    ["payments", CreditCard, "Payments"],
    ["steam", Gamepad2, "Steam"],
    ["security", Shield, "Security"],
    ["infrastructure", Router, "Infrastructure"],
    ["mail", Mail, "Mail"],
    ["notifications", Bell, "Notifications"],
    ["support", Users, "Support"],
  ] as const;

  async function load() {
    setSettings(await api<Record<string, any>>("/settings"));
  }
  async function save(section = activeSection) {
    await api(`/settings/${section}`, { method: "PUT", body: JSON.stringify(settings[section] || {}) });
    setMessage(`${section} settings saved`);
  }
  function update(section: string, key: string, value: any) {
    setSettings({ ...settings, [section]: { ...(settings[section] || {}), [key]: value } });
  }

  useEffect(() => { load().catch((error) => setMessage(error.message)); }, []);
  const current = settings[activeSection] || {};

  return <div className="grid grid-cols-[280px_1fr] gap-5">
    <div className="command-panel rounded-3xl p-5">
      <h2 className="mb-4 font-display text-2xl">Settings</h2>
      <div className="space-y-2">{sections.map(([id, Icon, label]) => <button key={id} onClick={() => setActiveSection(id)} className={`provider-tile ${activeSection === id ? "provider-tile-active" : ""}`}>
        <Icon className="h-4 w-4" /><span>{label}</span>
      </button>)}</div>
    </div>
    <div className="command-panel rounded-3xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div><div className="text-sm uppercase tracking-[0.22em] text-cyan">Platform Settings</div><h2 className="font-display text-3xl capitalize">{activeSection}</h2></div>
        <button className="primary-button" onClick={() => save()}><Save className="h-4 w-4" /> Save Section</button>
      </div>
      <div className="settings-grid">
        {Object.entries(current).map(([key, value]) => <label key={key} className="setting-field">
          <span>{key.replaceAll("_", " ")}</span>
          {typeof value === "boolean"
            ? <select className="field" value={String(value)} onChange={(event) => update(activeSection, key, event.target.value === "true")}><option value="true">Enabled</option><option value="false">Disabled</option></select>
            : typeof value === "number"
              ? <input className="field" type="number" value={value} onChange={(event) => update(activeSection, key, Number(event.target.value))} />
              : <input className="field" value={String(value ?? "")} onChange={(event) => update(activeSection, key, event.target.value)} />}
        </label>)}
      </div>
      {message && <div className="mt-5 rounded-2xl border border-cyan/20 bg-cyan/10 px-4 py-3 text-sm text-cyan">{message}</div>}
    </div>
  </div>;
}

function Mods({ service, refresh }: any) {
  const [providers, setProviders] = useState<ModProvider[]>([]);
  const [provider, setProvider] = useState("steam");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ModSearchItem[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const activeProvider = providers.find((item) => item.id === provider);

  useEffect(() => {
    if (!service) return;
    api<{ providers: ModProvider[] }>(`/services/${service.id}/mods/providers`).then((data) => {
      setProviders(data.providers);
      setProvider((current) => data.providers.some((item) => item.id === current) ? current : data.providers[0]?.id || "steam");
    }).catch((error) => setMessage(error.message));
  }, [service?.id]);

  async function searchMods() {
    if (!service) return;
    setLoading(true);
    setMessage("");
    try {
      const data = await api<{ items: ModSearchItem[]; message?: string }>(`/services/${service.id}/mods/search?provider=${encodeURIComponent(provider)}&q=${encodeURIComponent(query)}`);
      setResults(data.items || []);
      setMessage(data.message || "");
    } catch (error) {
      setResults([]);
      setMessage(error instanceof Error ? error.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  async function installMod(mod: ModSearchItem) {
    if (!service) return;
    await api(`/services/${service.id}/mods`, { method: "POST", body: JSON.stringify({ ...mod, enabled: true }) });
    await refresh();
  }

  if (!service) {
    return <div className="empty-state"><Boxes className="mx-auto mb-4 h-12 w-12 text-cyan" /><h2>Select a server</h2><p>Choose a service first, then AetherPanel will show the mod providers supported by that game.</p></div>;
  }

  return <div className="space-y-6">
    <section className="hero-panel overflow-hidden rounded-[2rem] p-7">
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-5">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm uppercase tracking-[0.25em] text-cyan"><Sparkles className="h-4 w-4" /> Game Hub</div>
          <h2 className="font-display text-4xl font-bold">{service.name}</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-300">Search Workshop providers, preview mods visually, and install compatible content without hunting for raw IDs.</p>
        </div>
        <div className="rounded-2xl border border-cyan/30 bg-cyan/10 px-5 py-4">
          <div className="text-3xl font-bold text-cyan">{service.mods?.length || 0}</div>
          <div className="text-xs uppercase tracking-[0.18em] text-slate-300">Installed Mods</div>
        </div>
      </div>
    </section>

    <section className="grid grid-cols-[320px_1fr] gap-5">
      <aside className="command-panel rounded-3xl p-5">
        <h3 className="mb-4 font-display text-2xl">Providers</h3>
        <div className="space-y-3">
          {providers.map((item) => <button key={item.id} onClick={() => { setProvider(item.id); setResults([]); setMessage(item.note); }} className={`provider-tile ${provider === item.id ? "provider-tile-active" : ""}`}>
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/8"><Globe2 className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{item.name}</span>
              <span className={item.searchable ? "text-xs text-emerald-300" : "text-xs text-amber-200"}>{item.searchable ? "API search ready" : item.configured ? "WebUI/manual flow" : "Needs API key"}</span>
            </span>
          </button>)}
        </div>
        <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-slate-300">{activeProvider?.note || "Provider details will appear here."}</div>
      </aside>

      <div className="space-y-5">
        <div className="command-panel rounded-3xl p-5">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h3 className="font-display text-2xl">{activeProvider?.name || "Mod Browser"}</h3>
              <p className="text-sm text-slate-400">Search through the provider API when available, or browse the embedded provider WebUI.</p>
            </div>
            {activeProvider?.web_url && <a href={activeProvider.web_url} target="_blank" className="icon-button"><ExternalLink className="h-4 w-4" /> Open</a>}
          </div>
          <div className="flex gap-3">
            <div className="relative flex-1"><Search className="absolute left-4 top-3.5 h-4 w-4 text-slate-500" /><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && searchMods()} placeholder="Search by mod name, keyword, collection, or author..." className="field pl-11" /></div>
            <button onClick={searchMods} className="primary-button min-w-32">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Search</button>
          </div>
          {message && <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">{message}</div>}
        </div>

        <div className="grid grid-cols-3 gap-4">
          {results.map((mod) => <article key={`${mod.provider}-${mod.id}`} className="mod-card overflow-hidden rounded-3xl">
            <div className="mod-art">
              {mod.thumbnail_url ? <img src={mod.thumbnail_url} alt="" loading="lazy" /> : <ImageIcon className="h-10 w-10 text-slate-500" />}
            </div>
            <div className="p-4">
              <div className="mb-2 flex items-start justify-between gap-2"><h4 className="font-display text-xl leading-5">{mod.name}</h4><span className="rounded-full bg-cyan/15 px-2 py-1 text-xs text-cyan">{mod.provider}</span></div>
              <p className="min-h-16 text-sm text-slate-400">{mod.summary || "No provider description supplied."}</p>
              <div className="mt-4 flex items-center gap-2">
                <button onClick={() => installMod(mod)} className="primary-button flex-1"><Plus className="h-4 w-4" /> Install</button>
                {mod.page_url && <a className="icon-button" href={mod.page_url} target="_blank"><ExternalLink className="h-4 w-4" /></a>}
              </div>
            </div>
          </article>)}
        </div>

        {!results.length && <div className="browser-frame">
          {activeProvider?.web_url ? <iframe title={`${activeProvider.name} browser`} src={activeProvider.web_url} /> : <div className="grid h-full place-items-center text-slate-400">This provider uses manual uploads.</div>}
        </div>}

        <div className="command-panel rounded-3xl p-5">
          <h3 className="mb-4 font-display text-2xl">Installed Loadout</h3>
          {service.mods?.length ? <div className="grid grid-cols-2 gap-3">{service.mods.map((mod: ModEntry) => <div key={`${mod.provider}-${mod.id}`} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="flex items-center justify-between gap-3"><strong>{mod.name || mod.id}</strong><span className="rounded-full bg-emerald-400/10 px-2 py-1 text-xs text-emerald-200">{mod.enabled ? "Enabled" : "Disabled"}</span></div>
            <div className="mt-1 text-xs text-slate-400">{mod.provider} · order {mod.order + 1}</div>
          </div>)}</div> : <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-slate-400">No mods installed yet.</div>}
        </div>
      </div>
    </section>
  </div>;
}

function Billing() { return <Placeholder icon={CreditCard} title="Billing Gateways" body="PayPal endpoint and settings placeholders are implemented. Add credentials in environment/settings before live payments." />; }
function Provisioning() { return <Placeholder icon={ListChecks} title="Provisioning Queue" body="BullMQ queue contracts are implemented for install/reinstall/update jobs." />; }
function Placeholder({ icon: Icon, title, body }: any) { return <div className="glass rounded-2xl p-10 text-center"><Icon className="mx-auto mb-4 h-10 w-10 text-cyan" /><h2 className="font-display text-3xl">{title}</h2><p className="mx-auto mt-3 max-w-xl text-slate-400">{body}</p></div>; }
function Panel({ title, items, empty }: any) { return <div className="glass rounded-2xl p-6"><h2 className="mb-4 font-display text-2xl">{title}</h2>{items?.length ? <pre className="max-h-[620px] overflow-auto text-xs text-slate-300">{JSON.stringify(items, null, 2)}</pre> : <div className="rounded-xl border border-dashed border-white/15 p-8 text-center text-slate-400">{empty}</div>}</div>; }

function Login() {
  const [email, setEmail] = useState("admin@aetherpanel.local");
  const [password, setPassword] = useState("change-me-now");
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    try { await login(email, password); window.location.reload(); } catch (err) { setError(err instanceof Error ? err.message : "Login failed"); }
  }
  return <div className="min-h-screen grid place-items-center p-6">
    <form onSubmit={submit} className="glass w-full max-w-md rounded-3xl p-8">
      <div className="mb-8 text-center"><div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-cyan/15 text-cyan glow"><Gauge /></div><h1 className="font-display text-4xl font-bold">AetherPanel</h1><p className="text-sm text-slate-400">Sign in to the control plane</p></div>
      <label className="mb-2 block text-sm text-slate-300">Email</label><input value={email} onChange={(e) => setEmail(e.target.value)} className="mb-4 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-cyan/50" />
      <label className="mb-2 block text-sm text-slate-300">Password</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mb-5 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-cyan/50" />
      {error && <div className="mb-4 rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-200">{error}</div>}
      <button className="w-full rounded-xl bg-cyan px-4 py-3 font-bold text-slate-950 hover:bg-cyan/90">Login</button>
    </form>
  </div>;
}

function App() {
  return token() ? <Shell /> : <Login />;
}

createRoot(document.getElementById("root")!).render(<App />);
