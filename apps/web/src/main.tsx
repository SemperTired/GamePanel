import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Activity, Bell, Boxes, CalendarClock, CreditCard, Database, ExternalLink, FileText, Folder, Gauge, Gamepad2, Globe2, ImageIcon, KeyRound, LayoutDashboard, ListChecks, Loader2, Mail, Network, Play, Plus, RotateCcw, Router, Save, Search, Send, Server, Settings, Shield, SlidersHorizontal, Sparkles, Square, Terminal, Trash2, UploadCloud, UserPlus, Users, Wifi } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import "./styles/global.css";
import { api, login, logout, token } from "./lib/api";

type Template = { id: string; name: string; category: string; summary: string; install?: { method: string; image?: string; app_id?: string; cache_key?: string; copy_strategy?: string }; runtime?: { startup: string; working_dir?: string; stop_command?: string }; resources: { recommended_ram_mb: number; min_ram_mb?: number; min_disk_gb: number; cpu: string }; workshop: { enabled: boolean; providers: string[] }; ports: Array<{ key: string; default: number; protocol: string }>; config_files?: Array<{ path: string; type: string; editable: boolean }>; startup_variables?: Array<{ key: string; label: string; default: string; customer_editable: boolean; required?: boolean; sensitive?: boolean }>; source?: { needs_review?: boolean; type?: string }; readiness?: { customer_ready: boolean; required_env: string[]; required_customer_variables: string[]; missing_env: string[]; operator_actions: string[]; warnings: string[] } };
type ModEntry = { id: string; provider: string; name?: string; summary?: string; thumbnail_url?: string; page_url?: string; enabled: boolean; order: number };
type ServicePort = { key: string; host: number; container?: number; protocol: string; host_ip?: string };
type NetworkMapping = { id?: string; name?: string; wan_ip?: string; external_port?: number; internal_ip?: string; internal_port?: number };
type Service = { id: string; name: string; template_id: string; owner_user_id?: string; location_id?: string; status: string; power_state: string; ports: ServicePort[]; mods: ModEntry[]; runtime_id?: string; node_id?: string; network_mappings?: NetworkMapping[]; startup_variables?: Record<string, string> };
type ScheduledTask = { id: string; service_id: string; name: string; action: string; cadence: string; enabled: boolean; next_run_at?: string; last_run_at?: string; last_status?: string; last_error?: string; command?: string; interval_minutes?: number; time_of_day?: string; day_of_week?: number };
type EmailRecord = { id: string; to: string; subject: string; body: string; status: string; created_at: string; updated_at: string };
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
  const [loadError, setLoadError] = useState("");

  async function refresh() {
    setLoadError("");
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

  useEffect(() => { refresh().catch((error) => { setLoadError(error instanceof Error ? error.message : "Unable to load panel data"); setLoading(false); }); }, []);
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
    { label: "Operate", items: [["dashboard", LayoutDashboard, "Overview"], ["services", Server, "Instances"], ["console", Terminal, "Console"], ["files", Folder, "Files"], ["config", SlidersHorizontal, "Config"], ["mods", Boxes, "Mods"], ["backups", Database, "Backups"], ["scheduler", CalendarClock, "Scheduler"]] },
    { label: "Provision", items: [["templates", Gamepad2, "Game Library"], ["provisioning", ListChecks, "Queue"], ["nodes", Network, "Nodes"]] },
    { label: "Business", items: [["billing", CreditCard, "Billing"], ["users", Users, "Users"], ["mail", Mail, "Mail"], ["audit", Shield, "Audit"]] },
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
        {loadError && <div className="mb-5 rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-100">
          Could not load panel data: {loadError}. Try signing out and back in if your session expired.
        </div>}
        {active === "dashboard" && <Dashboard stats={stats} audits={audits} services={services} />}
        {active === "templates" && <Templates templates={templates} nodes={nodes} refresh={refresh} setActive={setActive} setSelectedService={setSelectedService} />}
        {active === "services" && <Services services={services} templates={templates} selected={selectedService} setSelected={setSelectedService} refresh={refresh} logs={logs} />}
        {active === "console" && <ConsolePanel service={selectedService} logs={logs} setLogs={setLogs} />}
        {active === "files" && <FilesPanel service={selectedService} />}
        {active === "config" && <ConfigurationPanel service={selectedService} />}
        {active === "mods" && <Mods service={selectedService} refresh={refresh} />}
        {active === "backups" && <BackupsPanel service={selectedService} />}
        {active === "scheduler" && <SchedulerPanel service={selectedService} services={services} />}
        {active === "infrastructure" && <InfrastructurePanel service={selectedService} />}
        {active === "nodes" && <Nodes nodes={nodes} refresh={refresh} />}
        {active === "billing" && <Billing />}
        {active === "mail" && <MailOutbox />}
        {active === "provisioning" && <Provisioning />}
        {active === "users" && <UsersPanel />}
        {active === "settings" && <SettingsPanel />}
        {active === "audit" && <AuditConsole audits={audits} />}
      </main>
    </div>
  );
}

const gameArtLibrary: Array<[RegExp, string, string]> = [
  [/minecraft/i, "Minecraft", "https://images.unsplash.com/photo-1627856013091-fed6e4e30025?auto=format&fit=crop&w=900&q=80"],
  [/path.of.titans|dinosaur/i, "Path of Titans", "https://images.unsplash.com/photo-1525877442103-5ddb2089b2bb?auto=format&fit=crop&w=900&q=80"],
  [/ark|survival evolved|survival ascended/i, "ARK", "https://images.unsplash.com/photo-1518709268805-4e9042af2176?auto=format&fit=crop&w=900&q=80"],
  [/rust/i, "Rust", "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80"],
  [/zomboid|dayz|7 days|dead|zombie/i, "Survival", "https://images.unsplash.com/photo-1509248961158-e54f6934749c?auto=format&fit=crop&w=900&q=80"],
  [/arma|reforger|squad|insurgency|operation/i, "Tactical", "https://images.unsplash.com/photo-1519074069444-1ba4fff66d16?auto=format&fit=crop&w=900&q=80"],
  [/valheim|v rising|conan|enshrouded|forest/i, "Open World", "https://images.unsplash.com/photo-1511497584788-876760111969?auto=format&fit=crop&w=900&q=80"],
  [/factorio|satisfactory|space engineers|stationeers/i, "Factory", "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=900&q=80"],
  [/terraria|starbound|tmod/i, "Adventure", "https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=900&q=80"],
  [/counter|cs2|team fortress|garry|source|half-life/i, "Source", "https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=900&q=80"],
  [/fivem|redm|gta|rage/i, "Roleplay", "https://images.unsplash.com/photo-1511919884226-fd3cad34687c?auto=format&fit=crop&w=900&q=80"],
  [/palworld|creature|monster/i, "Creature", "https://images.unsplash.com/photo-1535223289827-42f1e9919769?auto=format&fit=crop&w=900&q=80"],
];

function gameVisual(input?: Pick<Template, "name" | "id" | "category"> | Pick<Service, "name" | "template_id"> | string) {
  const text = typeof input === "string" ? input : `${(input as any)?.name || ""} ${(input as any)?.id || ""} ${(input as any)?.template_id || ""} ${(input as any)?.category || ""}`;
  const match = gameArtLibrary.find(([pattern]) => pattern.test(text));
  return { label: match?.[1] || "Game Server", image: match?.[2] || "https://images.unsplash.com/photo-1605902711622-cfb43c4437d0?auto=format&fit=crop&w=900&q=80" };
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
      <div className="command-panel rounded-3xl p-6"><h2 className="mb-4 font-display text-2xl">Live Fleet</h2><ServiceRows services={services} detailed /></div>
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

function AuditConsole({ audits }: { audits: any[] }) {
  const lines = audits.map((audit) => {
    const time = audit.created_at ? new Date(audit.created_at).toLocaleString() : "unknown time";
    const metadata = audit.metadata ? ` ${JSON.stringify(audit.metadata)}` : "";
    return `[${time}] ${audit.actor || "system"} :: ${audit.action || "event"} -> ${audit.target || "platform"}${metadata}`;
  });
  return <div className="space-y-5">
    <section className="hero-panel overflow-hidden rounded-[2rem] p-7">
      <div className="relative z-10 flex items-center justify-between gap-5">
        <div><div className="text-sm uppercase tracking-[0.25em] text-cyan">Security Console</div><h2 className="font-display text-4xl font-bold">Audit Stream</h2><p className="mt-2 max-w-2xl text-sm text-slate-300">Readable operator timeline for payments, provisioning, user actions, automation, and infrastructure events.</p></div>
        <div className="rounded-2xl border border-cyan/20 bg-cyan/10 px-5 py-4 text-center"><div className="text-3xl font-bold text-white">{audits.length}</div><div className="text-xs uppercase tracking-[0.18em] text-cyan">events</div></div>
      </div>
    </section>
    <ConsoleFrame title="Audit Console" logs={lines.join("\n") || "[audit] No audit events have been recorded yet."} />
  </div>;
}

function Templates({ templates, nodes, refresh, setActive, setSelectedService }: { templates: Template[]; nodes: any[]; refresh: () => Promise<void>; setActive: (value: string) => void; setSelectedService: (service: Service | null) => void }) {
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState("path-of-titans");
  const [serviceName, setServiceName] = useState("AetherNode Path of Titans Test");
  const [nodeId] = useState("amp-linux-target");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<any>({});
  const filtered = templates.filter((template) => `${template.name} ${template.category} ${template.id}`.toLowerCase().includes(q.toLowerCase()));
  const selected = templates.find((template) => template.id === selectedId) || templates.find((template) => template.id === "path-of-titans") || templates[0];

  useEffect(() => {
    if (!selected) return;
    setServiceName((current) => current && current !== "AetherNode Path of Titans Test" ? current : `AetherNode ${selected.name} Test`);
    setEditor({
      name: selected.name,
      category: selected.category,
      summary: selected.summary,
      install_method: selected.install?.method || "docker_image",
      install_image: selected.install?.image || "",
      app_id: selected.install?.app_id || "",
      startup: selected.runtime?.startup || "",
      working_dir: selected.runtime?.working_dir || "/data",
      recommended_ram_mb: selected.resources.recommended_ram_mb,
      min_disk_gb: selected.resources.min_disk_gb,
      cpu: selected.resources.cpu,
    });
  }, [selected?.id]);

  async function deploy(provision = true) {
    if (!selected) return;
    setBusy(true);
    setMessage("");
    try {
      const service = await api<Service>("/services", {
        method: "POST",
        body: JSON.stringify({
          name: serviceName || `AetherNode ${selected.name} Test`,
          template_id: selected.id,
          owner_user_id: "usr_superadmin",
          location_id: "local",
          node_id: nodeId || "local",
          auto_start: false,
        }),
      });
      const finalService = provision ? await api<Service>(`/services/${service.id}/provision`, { method: "POST" }) : service;
      await refresh();
      setSelectedService(finalService);
      setActive("services");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Deploy failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveTemplate() {
    if (!selected) return;
    setBusy(true);
    setMessage("");
    try {
      await api<Template>(`/templates/${selected.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: editor.name,
          category: editor.category,
          summary: editor.summary,
          install: { method: editor.install_method, image: editor.install_image || undefined, app_id: editor.app_id || undefined },
          runtime: { startup: editor.startup, working_dir: editor.working_dir },
          resources: { recommended_ram_mb: Number(editor.recommended_ram_mb), min_disk_gb: Number(editor.min_disk_gb), cpu: editor.cpu },
        }),
      });
      setMessage(`Saved template override for ${editor.name}`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Template save failed");
    } finally {
      setBusy(false);
    }
  }

  if (!templates.length) return <div className="empty-state"><Gamepad2 className="mx-auto mb-4 h-12 w-12 text-cyan" /><h2>Game library did not load</h2><p>No templates were returned by the API. Check login/session state and the `/api/v1/templates` endpoint.</p></div>;

  return <div className="space-y-6">
    <section className="deploy-hero">
      <div className="relative z-10">
        <div className="mb-2 flex items-center gap-2 text-sm uppercase tracking-[0.24em] text-cyan"><UploadCloud className="h-4 w-4" /> One Click Deploy</div>
        <h2 className="font-display text-5xl font-bold">Launch a game server</h2>
        <p className="mt-3 max-w-3xl text-slate-300">Pick a supported title, name the instance, and AetherPanel will assign ports, apply template defaults, create managed config files, and provision the runtime.</p>
      </div>
      <div className="relative z-10 grid grid-cols-3 gap-3">
        <MetricPill label="Templates" value={templates.length} />
        <MetricPill label="Targets" value={nodes.length || 1} />
        <MetricPill label="Workshop" value={templates.filter((template) => template.workshop.enabled).length} />
      </div>
    </section>

    <div className="grid grid-cols-[minmax(0,1fr)_390px] gap-5">
      <section className="command-panel rounded-3xl p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-2xl">Game Library</h3>
            <p className="text-sm text-slate-400">Curated templates deploy immediately. Imported templates are visible but marked for review.</p>
          </div>
          <button className="primary-button" onClick={() => { setQ("Path of Titans"); setSelectedId("path-of-titans"); }}>Path of Titans Test</button>
        </div>
        <div className="relative mb-4"><Search className="absolute left-4 top-3.5 h-4 w-4 text-slate-500" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search 247 supported games..." className="field pl-11" /></div>
        <div className="template-grid">
          {filtered.map((template) => {
            const visual = gameVisual(template);
            return <button key={template.id} onClick={() => setSelectedId(template.id)} className={`template-tile ${selected?.id === template.id ? "template-tile-active" : ""}`}>
            <div className="template-art premium-art" style={{ backgroundImage: `linear-gradient(180deg, rgba(2,6,23,0.02), rgba(2,6,23,0.74)), url(${visual.image})` }}><span>{visual.label}</span></div>
            <div className="p-4 text-left">
              <div className="mb-2 flex items-start justify-between gap-2"><h4 className="font-display text-xl leading-5">{template.name}</h4><span className="rounded-full bg-violet/15 px-2 py-1 text-[0.68rem] text-violet-100">{template.category}</span></div>
              <p className="line-clamp-2 min-h-10 text-sm text-slate-400">{template.summary}</p>
              <div className="mt-4 grid grid-cols-3 gap-2 text-[0.72rem] text-slate-300"><span>{template.resources.recommended_ram_mb / 1024}GB RAM</span><span>{template.resources.min_disk_gb}GB disk</span><span>{template.ports.length} ports</span></div>
              <div className="mt-3 flex flex-wrap gap-2">
                {template.workshop.enabled && <span className="rounded-full bg-cyan/10 px-2 py-1 text-[0.68rem] text-cyan">Mods</span>}
                {template.source?.needs_review && <span className="rounded-full bg-amber-300/10 px-2 py-1 text-[0.68rem] text-amber-100">Review</span>}
              </div>
            </div>
          </button>;
          })}
        </div>
      </section>

      <aside className="command-panel rounded-3xl p-5">
        <h3 className="font-display text-2xl">Deploy Instance</h3>
        {selected ? <div className="mt-4 space-y-4">
          <div className="rounded-2xl border border-cyan/20 bg-cyan/10 p-4">
            <div className="selected-game-art mb-4" style={{ backgroundImage: `linear-gradient(90deg, rgba(2,6,23,0.20), rgba(2,6,23,0.72)), url(${gameVisual(selected).image})` }} />
            <div className="text-xs uppercase tracking-[0.2em] text-cyan">Selected Game</div>
            <div className="mt-1 font-display text-3xl font-bold">{selected.name}</div>
            <p className="mt-2 text-sm text-slate-300">{selected.summary}</p>
          </div>
          <label className="setting-field"><span>Instance Name</span><input className="field" value={serviceName} onChange={(event) => setServiceName(event.target.value)} /></label>
          <div className="rounded-2xl border border-cyan/20 bg-cyan/10 p-4 text-sm text-slate-200">
            <div className="font-semibold text-white">Automatic provisioning profile</div>
            <div className="mt-2 grid gap-2">
              <div className="flex justify-between gap-3"><span className="text-slate-400">Runtime target</span><span className="font-mono text-cyan">{nodeId || "local"}</span></div>
              <div className="flex justify-between gap-3"><span className="text-slate-400">Memory</span><span>{selected.resources.recommended_ram_mb} MB</span></div>
              <div className="flex justify-between gap-3"><span className="text-slate-400">Storage</span><span>{selected.resources.min_disk_gb} GB</span></div>
              <div className="flex justify-between gap-3"><span className="text-slate-400">Config fields</span><span>{(selected as any).config_schema?.fields?.length || selected.startup_variables?.length || 0}</span></div>
            </div>
          </div>
          <InfoBlock title="Ports" items={selected.ports.map((port) => [port.key, `${port.default}/${port.protocol}`])} />
          <InfoBlock title="Install" items={[["method", selected.id === "path-of-titans" ? "alderon" : selected.source?.type || "template"], ["mods", selected.workshop.enabled ? selected.workshop.providers.join(", ") : "none"]]} />
          <div className={`rounded-2xl border p-4 ${selected.readiness?.customer_ready ? "border-emerald-400/30 bg-emerald-500/10" : "border-amber-400/30 bg-amber-500/10"}`}>
            <div className="flex items-center justify-between gap-3">
              <h4 className="font-semibold">{selected.readiness?.customer_ready ? "Ready to Sell" : "Setup Required"}</h4>
              <span className={`status-pill ${selected.readiness?.customer_ready ? "status-good" : ""}`}>{selected.install?.method || "template"}</span>
            </div>
            <div className="mt-3 space-y-2 text-sm text-slate-300">
              {(selected.readiness?.missing_env || []).map((item) => <div key={item}>Missing env: <span className="font-mono text-amber-100">{item}</span></div>)}
              {(selected.readiness?.required_customer_variables || []).map((item) => <div key={item}>Editable after creation: <span className="font-mono text-cyan">{item}</span></div>)}
              {(selected.readiness?.operator_actions || []).map((item) => <div key={item}>{item}</div>)}
              {(selected.readiness?.warnings || []).slice(0, 2).map((item) => <div key={item} className="text-slate-400">{item}</div>)}
              {selected.readiness?.customer_ready && <div className="text-emerald-100">No blocking installer prerequisites detected on this API node.</div>}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
            <div className="mb-3 font-display text-xl">Template Editor</div>
            <div className="space-y-3">
              <input className="field" value={editor.name || ""} onChange={(e) => setEditor({ ...editor, name: e.target.value })} placeholder="Template name" />
              <input className="field" value={editor.category || ""} onChange={(e) => setEditor({ ...editor, category: e.target.value })} placeholder="Category" />
              <textarea className="field min-h-24" value={editor.summary || ""} onChange={(e) => setEditor({ ...editor, summary: e.target.value })} placeholder="Summary" />
              <select className="field" value={editor.install_method || "docker_image"} onChange={(e) => setEditor({ ...editor, install_method: e.target.value })}><option value="docker_image">Docker Image</option><option value="steamcmd">SteamCMD</option><option value="alderon">Alderon</option><option value="fivem">FiveM</option><option value="direct_archive">Direct Archive</option><option value="custom">Custom</option></select>
              <input className="field" value={editor.install_image || ""} onChange={(e) => setEditor({ ...editor, install_image: e.target.value })} placeholder="Runtime image" />
              <input className="field" value={editor.app_id || ""} onChange={(e) => setEditor({ ...editor, app_id: e.target.value })} placeholder="Steam App ID / installer app id" />
              <textarea className="field min-h-20 font-mono text-sm" value={editor.startup || ""} onChange={(e) => setEditor({ ...editor, startup: e.target.value })} placeholder="Startup command" />
              <div className="grid grid-cols-3 gap-2">
                <input className="field" type="number" value={editor.recommended_ram_mb || 0} onChange={(e) => setEditor({ ...editor, recommended_ram_mb: Number(e.target.value) })} />
                <input className="field" type="number" value={editor.min_disk_gb || 0} onChange={(e) => setEditor({ ...editor, min_disk_gb: Number(e.target.value) })} />
                <input className="field" value={editor.cpu || ""} onChange={(e) => setEditor({ ...editor, cpu: e.target.value })} />
              </div>
              <button className="icon-button w-full" onClick={saveTemplate} disabled={busy}><Save className="h-4 w-4" /> Save Template Override</button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button disabled={busy} className="icon-button" onClick={() => deploy(false)}><Plus className="h-4 w-4" /> Create Only</button>
            <button disabled={busy} className="primary-button" onClick={() => deploy(true)}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />} Create & Provision</button>
          </div>
          {message && <div className="rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-100">{message}</div>}
        </div> : <div className="mt-4 rounded-2xl border border-dashed border-white/15 p-8 text-center text-slate-400">Select a game to deploy.</div>}
      </aside>
    </div>
  </div>;
}

function Services({ services, templates, selected, setSelected, refresh, logs }: any) {
  const [users, setUsers] = useState<any[]>([]);
  const [edit, setEdit] = useState<Record<string, any>>({});
  const [message, setMessage] = useState("");
  useEffect(() => { api<any[]>("/users").then(setUsers).catch(() => undefined); }, []);
  useEffect(() => {
    if (!selected) return;
    setEdit({ name: selected.name, owner_user_id: selected.owner_user_id || "", status: selected.status, node_id: selected.node_id || "local", location_id: selected.location_id || "local" });
  }, [selected?.id]);
  async function power(action: string) {
    if (!selected) return;
    const service = await api<Service>(`/services/${selected.id}/power/${action}`, { method: "POST" });
    setSelected(service);
    await refresh();
  }
  async function provision() {
    if (!selected) return;
    const service = await api<Service>(`/services/${selected.id}/provision`, { method: "POST" });
    setSelected(service);
    await refresh();
  }
  async function serviceAction(action: "reinstall" | "refresh-cache" | "suspend" | "activate") {
    if (!selected) return;
    const result = await api<Service | any>(`/services/${selected.id}/${action}`, { method: "POST" });
    if (result?.id) setSelected(result);
    await refresh();
  }
  async function terminate() {
    if (!selected || !confirm(`Terminate ${selected.name}? This removes the runtime container and service record.`)) return;
    await api(`/services/${selected.id}`, { method: "DELETE" });
    setSelected(null);
    await refresh();
  }
  async function saveService() {
    if (!selected) return;
    const updated = await api<Service>(`/services/${selected.id}`, { method: "PUT", body: JSON.stringify(edit) });
    setSelected(updated);
    setMessage("Instance settings saved");
    await refresh();
  }
  const template = selected ? templates.find((item: Template) => item.id === selected.template_id) : null;
  return <div className="space-y-5">
      <div className="command-panel rounded-3xl p-5">
        <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="font-display text-2xl">Instances</h2><p className="text-sm text-slate-400">Manage purchased and provisioned game servers. New servers are created from Game Library.</p></div><span className="status-pill">{services.length} total</span></div>
        <ServiceRows services={services} onPick={setSelected} selectedId={selected?.id} detailed />
      </div>
      {selected && <div className="command-panel rounded-3xl p-5">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div><h3 className="font-display text-3xl">{selected.name}</h3><div className="mt-1 text-sm text-slate-400">{template?.name || selected.template_id} · {selected.node_id || "local node"}</div></div>
          <div className="flex flex-wrap gap-2">
            {!selected.runtime_id && <button onClick={provision} className="primary-button"><UploadCloud className="h-4 w-4" /> Provision</button>}
            {["start", "stop", "restart", "kill"].map((action) => <button key={action} onClick={() => power(action)} className="control-button">{action === "start" ? <Play className="h-4 w-4" /> : action === "stop" ? <Square className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />} {action}</button>)}
          </div>
        </div>
        <div className="mb-5 flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
          <button className="control-button" onClick={() => serviceAction("suspend")}><Shield className="h-4 w-4" /> Suspend</button>
          <button className="control-button" onClick={() => serviceAction("activate")}><Activity className="h-4 w-4" /> Activate</button>
          <button className="control-button" onClick={() => serviceAction("reinstall")}><RotateCcw className="h-4 w-4" /> Reinstall</button>
          <button className="control-button" onClick={() => serviceAction("refresh-cache")}><Database className="h-4 w-4" /> Refresh Cache</button>
          <button className="control-button border-red-400/40 text-red-100 hover:bg-red-500/10" onClick={terminate}><Trash2 className="h-4 w-4" /> Terminate</button>
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
        <div className="mb-5 grid grid-cols-2 gap-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
            <div className="mb-3 font-semibold">Assignment & Status</div>
            <div className="space-y-3">
              <label className="setting-field"><span>Name</span><input className="field" value={edit.name || ""} onChange={(event) => setEdit({ ...edit, name: event.target.value })} /></label>
              <label className="setting-field"><span>Owner</span><select className="field" value={edit.owner_user_id || ""} onChange={(event) => setEdit({ ...edit, owner_user_id: event.target.value })}>{users.map((user) => <option key={user.id} value={user.id}>{user.name} - {user.email}</option>)}</select></label>
              <label className="setting-field"><span>Status</span><select className="field" value={edit.status || selected.status} onChange={(event) => setEdit({ ...edit, status: event.target.value })}>{["pending_payment", "paid", "queued", "provisioning", "installing", "active", "suspended", "terminated", "failed"].map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
              <button className="icon-button w-full" onClick={saveService}><Save className="h-4 w-4" /> Save Instance</button>
              {message && <div className="rounded-xl border border-cyan/20 bg-cyan/10 px-3 py-2 text-sm text-cyan">{message}</div>}
            </div>
          </div>
          <ConsoleFrame title="Live Console Preview" logs={logs} compact />
        </div>
      </div>}
  </div>;
}

function ConsolePanel({ service, logs, setLogs }: { service: Service | null; logs: string; setLogs: (value: string) => void }) {
  const [command, setCommand] = useState("");
  const [busy, setBusy] = useState(false);
  async function refreshLogs() {
    if (!service) return;
    setLogs(await api<string>(`/services/${service.id}/logs`));
  }
  async function sendCommand(event: React.FormEvent) {
    event.preventDefault();
    if (!service || !command.trim()) return;
    setBusy(true);
    try {
      await api(`/services/${service.id}/command`, { method: "POST", body: JSON.stringify({ command }) });
      setLogs(`${logs}\n> ${command}`);
      setCommand("");
      await refreshLogs();
    } finally {
      setBusy(false);
    }
  }
  if (!service) return <div className="empty-state"><Terminal className="mx-auto mb-4 h-12 w-12 text-cyan" /><h2>Select an instance</h2><p>The console attaches to the selected game server and shows plain terminal output.</p></div>;
  return <div className="space-y-5">
    <section className="hero-panel overflow-hidden rounded-[2rem] p-7"><div className="relative z-10 flex items-center justify-between gap-5"><div><div className="text-sm uppercase tracking-[0.25em] text-cyan">Interactive Terminal</div><h2 className="font-display text-4xl font-bold">{service.name}</h2><p className="mt-2 text-sm text-slate-300">Send commands, review stdout/stderr, and operate the instance without JSON log dumps.</p></div><button className="icon-button" onClick={refreshLogs}><RotateCcw className="h-4 w-4" /> Refresh</button></div></section>
    <ConsoleFrame title="Console Output" logs={logs} />
    <form onSubmit={sendCommand} className="command-panel flex items-center gap-3 rounded-3xl p-4">
      <Terminal className="h-5 w-5 text-cyan" />
      <input className="field" value={command} onChange={(event) => setCommand(event.target.value)} placeholder="say Server restart in 5 minutes" />
      <button className="primary-button" disabled={busy || !command.trim()}><Send className="h-4 w-4" /> Send</button>
    </form>
  </div>;
}

function ConsoleFrame({ title, logs, compact }: { title: string; logs: string; compact?: boolean }) {
  const lines = (logs || "[panel] No console output yet.").split(/\r?\n/).slice(compact ? -120 : -500);
  return <div className="console-frame rounded-3xl p-5">
    <div className="mb-4 flex items-center justify-between"><h3 className="font-display text-2xl">{title}</h3><span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200">text console</span></div>
    <div className={`${compact ? "h-64" : "h-[620px]"} overflow-auto rounded-2xl border border-white/10 bg-black/60 p-4 font-mono text-xs leading-5 text-emerald-100`}>
      {lines.map((line, index) => <div key={`${index}-${line.slice(0, 20)}`}><span className="select-none text-slate-600">{String(index + 1).padStart(3, "0")} </span>{line}</div>)}
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
  return <div className="space-y-2">{services.map((service: Service) => {
    const visual = gameVisual(service);
    return <button key={service.id} onClick={() => onPick?.(service)} className={`service-row service-row-premium ${selectedId === service.id ? "service-row-active" : ""}`}>
      <span className="service-thumb" style={{ backgroundImage: `linear-gradient(180deg, rgba(2,6,23,0.05), rgba(2,6,23,0.52)), url(${visual.image})` }} />
      <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{service.name}</span><span className="text-xs text-slate-500">{service.template_id}</span>{detailed && <span className="mt-2 flex flex-wrap gap-2 text-[0.7rem] text-slate-400"><span>{service.ports?.length || 0} ports</span><span>{service.mods?.length || 0} mods</span><span>{service.node_id || "local"}</span></span>}</span><span className={`status-pill ${service.power_state === "running" ? "status-good" : ""}`}>{service.power_state}</span>
    </button>;
  })}</div>;
}

function Nodes({ nodes, refresh }: { nodes: any[]; refresh: () => Promise<void> }) {
  const [form, setForm] = useState({
    id: "amp-linux-target",
    name: "AMP Linux Target",
    host: "10.1.10.48",
    ssh_user: "user",
    runtime: "docker",
    runtime_mode: "agent",
    agent_url: "http://10.1.10.48:4210",
    agent_token: "",
    docker_host: "",
    role: "linux-target",
    status: "ready",
    data_root: "/srv/aetherpanel/services",
    cache_root: "/srv/aetherpanel/cache",
  });
  const [message, setMessage] = useState("");

  async function saveNode() {
    setMessage("");
    try {
      await api("/nodes", { method: "POST", body: JSON.stringify(form) });
      await refresh();
      setMessage("Runtime target saved. Remote Docker-over-SSH execution is represented in node metadata; install the node agent or set DOCKER_HOST for live remote provisioning.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save node");
    }
  }

  return <div className="grid grid-cols-[380px_1fr] gap-5">
    <section className="command-panel rounded-3xl p-5">
      <h2 className="font-display text-2xl">Runtime Target</h2>
      <p className="mt-1 text-sm text-slate-400">Register the Linux target that will host Docker game instances.</p>
      <div className="mt-5 space-y-3">
        {Object.entries(form).map(([key, value]) => <label key={key} className="setting-field">
          <span>{key.replaceAll("_", " ")}</span>
          <input className="field" value={String(value)} onChange={(event) => setForm({ ...form, [key]: event.target.value })} />
        </label>)}
        <button className="primary-button w-full" onClick={saveNode}><Save className="h-4 w-4" /> Save AMP Linux Target</button>
        {message && <div className="rounded-2xl border border-cyan/20 bg-cyan/10 px-4 py-3 text-sm text-cyan">{message}</div>}
      </div>
    </section>
    <section className="command-panel rounded-3xl p-5">
      <div className="mb-4 flex items-center justify-between"><h2 className="font-display text-2xl">Registered Nodes</h2><span className="status-pill">{nodes.length} total</span></div>
      {nodes.length ? <div className="grid grid-cols-2 gap-4">{nodes.map((node) => <article key={node.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <div className="mb-2 flex items-center justify-between gap-3"><strong>{node.name || node.id}</strong><span className="status-pill status-good">{node.status || "unknown"}</span></div>
        <div className="space-y-2 text-sm text-slate-300">
          <div className="flex justify-between gap-3"><span className="text-slate-500">Host</span><span className="font-mono">{node.host || node.lan_ip || "local"}</span></div>
          <div className="flex justify-between gap-3"><span className="text-slate-500">Runtime</span><span>{node.runtime || "docker"}</span></div>
          <div className="flex justify-between gap-3"><span className="text-slate-500">Data</span><span className="truncate font-mono">{node.data_root || "default"}</span></div>
        </div>
      </article>)}</div> : <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-slate-400">No nodes registered yet.</div>}
    </section>
  </div>;
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

  async function createFile(name: string, template = "# Managed by AetherPanel\n") {
    if (!service) return;
    const filePath = path === "." ? name : `${path}/${name}`;
    const data = await api<{ content: string; path: string }>(`/services/${service.id}/files/content?path=${encodeURIComponent(filePath)}&create=true&template=${encodeURIComponent(template)}`);
    setOpenFile(data.path);
    setContent(data.content);
    await load(path);
  }

  async function createDirectory(name = "config") {
    if (!service) return;
    const dirPath = path === "." ? name : `${path}/${name}`;
    await api(`/services/${service.id}/files/mkdir`, { method: "POST", body: JSON.stringify({ path: dirPath }) });
    setMessage(`Created directory ${dirPath}`);
    await load(path);
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
      <div className="mb-4 grid grid-cols-2 gap-2">
        <button className="control-button justify-center" onClick={() => createFile("server.cfg")}><FileText className="h-4 w-4" /> New Config</button>
        <button className="control-button justify-center" onClick={() => createDirectory()}><Folder className="h-4 w-4" /> New Folder</button>
      </div>
      <div className="space-y-2">
        {path !== "." && <button className="provider-tile" onClick={() => load(path.split("/").slice(0, -1).join("/") || ".")}><Folder className="h-4 w-4" /> ..</button>}
        {entries.map((entry) => <button key={entry.name} className="provider-tile" onClick={() => entry.type === "directory" ? load(path === "." ? entry.name : `${path}/${entry.name}`) : readFile(entry.name)}>
          {entry.type === "directory" ? <Folder className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
          <span className="flex-1 truncate">{entry.name}</span>
          <span className="text-xs text-slate-500">{entry.type === "file" ? `${entry.size}b` : "dir"}</span>
        </button>)}
      </div>
      {!entries.length && <div className="mt-4 rounded-2xl border border-dashed border-white/15 p-5 text-center text-sm text-slate-400">This service directory is empty. Create a config file or provision/reinstall the service to populate game files.</div>}
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
  const [openFile, setOpenFile] = useState<any>(null);
  const [fileContent, setFileContent] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    if (!service) return;
    const data = await api<any>(`/services/${service.id}/configuration`);
    setConfig(data);
    const allFields = [...(data.config_schema?.fields || []), ...(data.startup_variables || [])];
    setValues(Object.fromEntries(allFields.map((field: any) => [field.key, field.value ?? field.default ?? ""])));
  }

  async function save() {
    if (!service) return;
    const data = await api<any>(`/services/${service.id}/configuration/startup`, { method: "PUT", body: JSON.stringify({ values }) });
    setConfig(data);
    setMessage("Configuration saved. Restart the service to apply startup changes.");
  }

  async function openManagedFile(file: any) {
    if (!service) return;
    const query = new URLSearchParams({ path: file.path, create: "true", type: file.type || "text" });
    if (file.template) query.set("template", file.template);
    const data = await api<{ path: string; content: string }>(`/services/${service.id}/files/content?${query.toString()}`);
    setOpenFile({ ...file, path: data.path });
    setFileContent(data.content);
    setMessage("");
  }

  async function saveManagedFile() {
    if (!service || !openFile) return;
    await api(`/services/${service.id}/files/content`, { method: "PUT", body: JSON.stringify({ path: openFile.path, content: fileContent }) });
    setMessage(`Saved ${openFile.path}. Restart the service if the game only reads this at startup.`);
  }

  function commandPreview() {
    const startup = config?.runtime?.startup || "";
    const portValues = Object.fromEntries((config?.ports || []).flatMap((port: ServicePort) => [[`${port.key}_port`, String(port.host)], [port.key, String(port.host)]]));
    const merged = { ...portValues, ...values };
    return startup.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match: string, key: string) => merged[key] ?? `{${key}}`);
  }

  const visibleFields = (config?.config_schema?.fields || []).filter((field: any) => !field.hidden);
  const groupedFields = visibleFields.reduce((groups: Record<string, any[]>, field: any) => {
    const key = `${field.category || "General"} / ${field.subcategory || "General"}`;
    groups[key] = [...(groups[key] || []), field];
    return groups;
  }, {});

  function renderConfigControl(field: any) {
    const value = values[field.key] ?? "";
    const update = (next: string) => setValues((current) => ({ ...current, [field.key]: next }));
    const inputType = String(field.input_type || "text").toLowerCase();
    if (inputType === "enum" || Object.keys(field.enum_values || {}).length) {
      return <select className="field" value={value} onChange={(event) => update(event.target.value)} disabled={!field.customer_editable}>
        {Object.entries(field.enum_values || {}).map(([optionValue, label]) => <option key={optionValue} value={optionValue}>{String(label)}</option>)}
        {!Object.keys(field.enum_values || {}).length && <option value={value}>{value || "Default"}</option>}
      </select>;
    }
    if (inputType === "checkbox") {
      const checked = ["true", "1", "yes", "on"].includes(String(value).toLowerCase());
      return <button type="button" className={`toggle-row ${checked ? "active" : ""}`} onClick={() => update(checked ? "false" : "true")} disabled={!field.customer_editable}>
        <span>{checked ? "Enabled" : "Disabled"}</span>
        <span className="toggle-dot" />
      </button>;
    }
    if (inputType === "textarea" || inputType === "list") {
      return <textarea className="field min-h-28 resize-y" value={value} placeholder={field.placeholder || ""} onChange={(event) => update(event.target.value)} disabled={!field.customer_editable} />;
    }
    return <input className="field" type={inputType === "password" ? "password" : inputType === "number" ? "number" : "text"} value={value} placeholder={field.placeholder || ""} min={field.min} max={field.max} onChange={(event) => update(event.target.value)} disabled={!field.customer_editable} />;
  }

  useEffect(() => { load().catch((error) => setMessage(error.message)); }, [service?.id]);

  if (!service) return <div className="empty-state"><SlidersHorizontal className="mx-auto mb-4 h-12 w-12 text-cyan" /><h2>Select a server</h2><p>Configuration is generated from the selected game template.</p></div>;
  return <div className="space-y-5">
    <div className="hero-panel overflow-hidden rounded-[2rem] p-7"><div className="relative z-10"><div className="text-sm uppercase tracking-[0.25em] text-cyan">Instance Config</div><h2 className="font-display text-4xl font-bold">{service.name}</h2></div></div>
    <div className="command-panel rounded-3xl p-5">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-2xl">Game Settings</h3>
          <p className="text-sm text-slate-400">{visibleFields.length} controls imported from AMP metadata for this game template.</p>
        </div>
        <button className="primary-button" onClick={save}><Save className="h-4 w-4" /> Save Settings</button>
      </div>
      <div className="space-y-5">
        {Object.entries(groupedFields).map(([group, fields]) => <section key={group} className="config-group">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h4 className="font-display text-xl text-white">{group}</h4>
            <span className="status-pill">{(fields as any[]).length} settings</span>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {(fields as any[]).map((field) => <label key={field.key} className="setting-card">
              <span className="flex items-start justify-between gap-3">
                <span>
                  <span className="block font-semibold text-white">{field.label}</span>
                  <span className="mt-1 block text-xs uppercase tracking-[0.16em] text-cyan/80">{field.key}{field.required ? " · required" : ""}</span>
                </span>
                {field.sensitive && <span className="status-pill">secret</span>}
              </span>
              <span className="mt-3 block">{renderConfigControl(field)}</span>
              {field.description && <span className="mt-2 block text-xs leading-relaxed text-slate-400">{field.description}</span>}
            </label>)}
          </div>
        </section>)}
        {!visibleFields.length && <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-slate-400">This template has not imported AMP config metadata yet.</div>}
      </div>
    </div>
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
        <div className="space-y-3">{(config?.config_files || []).map((file: any) => <button key={file.path} className="w-full rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left transition hover:border-cyan/50 hover:bg-cyan/10" onClick={() => openManagedFile(file)}>
          <strong>{file.path}</strong><div className="mt-1 text-xs text-slate-400">{file.type} · {file.editable ? "editable" : "locked"} · click to open</div>
        </button>)}</div>
        {!config?.config_files?.length && <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-slate-400">This template has no managed config files yet. Use Files for manual edits.</div>}
      </div>
    </div>
    <div className="command-panel rounded-3xl p-5">
      <div className="mb-4 flex items-center justify-between"><h3 className="font-display text-2xl">Command Line Builder</h3><span className="status-pill">{config?.runtime?.working_dir || "/data"}</span></div>
      <div className="rounded-2xl border border-white/10 bg-black/35 p-4 font-mono text-sm text-emerald-100">{commandPreview() || "No startup command declared."}</div>
      <p className="mt-3 text-sm text-slate-400">Preview updates as startup variables change. Save variables and restart the service to apply.</p>
    </div>
    {openFile && <div className="command-panel rounded-3xl p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div><h3 className="font-display text-2xl">{openFile.path}</h3><p className="text-sm text-slate-400">{openFile.type} managed config</p></div>
        <button className="primary-button" onClick={saveManagedFile} disabled={!openFile.editable}><Save className="h-4 w-4" /> Save File</button>
      </div>
      <textarea value={fileContent} onChange={(event) => setFileContent(event.target.value)} disabled={!openFile.editable} className="h-[520px] w-full rounded-2xl border border-white/10 bg-black/40 p-4 font-mono text-sm text-emerald-100 outline-none focus:border-cyan/50 disabled:opacity-60" spellCheck={false} />
    </div>}
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
  const mappings = plan?.mappings || (service?.network_mappings as any[]) || [];
  const fallbackPorts = service?.ports?.map((port) => ({
    id: `${service.id}-${port.key}`,
    name: port.key,
    protocol: port.protocol,
    external_port: port.host,
    internal_port: port.host,
    internal_ip: port.host_ip || "node",
    wan_ip: "WAN",
  })) || [];
  const displayMappings = mappings.length ? mappings : fallbackPorts;

  return <div className="space-y-5">
    <section className="hero-panel overflow-hidden rounded-[2rem] p-7"><div className="relative z-10"><div className="text-sm uppercase tracking-[0.25em] text-cyan">Connection Routing</div><h2 className="font-display text-4xl font-bold">Network & Ports</h2><p className="mt-2 max-w-2xl text-sm text-slate-300">Plan and apply the player-facing connection routes for the selected instance. Use dry-run until UniFiOS credentials are confirmed.</p></div></section>
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
        <div className="command-panel rounded-3xl p-5">
          <div className="mb-4 flex items-center justify-between"><h3 className="font-display text-2xl">Connectors</h3><span className="status-pill">{connectors.length} total</span></div>
          {connectors.length ? <div className="grid grid-cols-2 gap-3">{connectors.map((connector) => <article key={connector.id} className="record-card">
            <div className="mb-2 flex items-center justify-between gap-3"><strong>{connector.name}</strong><span className={`status-pill ${connector.enabled ? "status-good" : ""}`}>{connector.provider}</span></div>
            <div className="space-y-2 text-sm text-slate-300"><div className="flex justify-between"><span>WAN</span><strong>{connector.wan_ip || "not set"}</strong></div><div className="flex justify-between"><span>Mode</span><strong>{connector.dry_run ? "dry run" : "live apply"}</strong></div><div className="flex justify-between"><span>Site</span><strong>{connector.site_id || "default"}</strong></div></div>
          </article>)}</div> : <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-slate-400">No infrastructure connectors yet.</div>}
        </div>
        <div className="command-panel rounded-3xl p-5">
          <div className="mb-4 flex items-center justify-between"><div><h3 className="font-display text-2xl">Connection Plan</h3><p className="text-sm text-slate-400">{service ? service.name : "Select an instance to preview routing."}</p></div><div className="flex gap-2"><button className="icon-button" onClick={planPorts}>Plan</button><button className="primary-button" onClick={applyPorts}>Apply</button></div></div>
          {service ? <div className="grid grid-cols-2 gap-3">{displayMappings.map((mapping: any) => <article key={mapping.id || `${mapping.name}-${mapping.external_port}`} className="network-route">
            <div className="mb-3 flex items-center justify-between gap-3"><strong>{mapping.name || "Game Port"}</strong><span className="status-pill">{mapping.protocol || "tcp"}</span></div>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-sm">
              <div className="rounded-xl bg-black/25 p-3"><div className="text-xs uppercase tracking-[0.16em] text-slate-500">Players</div><div className="font-mono text-cyan">{mapping.wan_ip || "WAN"}:{mapping.external_port || "?"}</div></div>
              <Network className="h-5 w-5 text-slate-500" />
              <div className="rounded-xl bg-black/25 p-3"><div className="text-xs uppercase tracking-[0.16em] text-slate-500">Node</div><div className="font-mono text-emerald-200">{mapping.internal_ip || "LAN"}:{mapping.internal_port || "?"}</div></div>
            </div>
          </article>)}</div> : <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-slate-400">Select a service to generate mappings.</div>}
          {plan?.result && <div className="mt-4 rounded-2xl border border-cyan/20 bg-cyan/10 px-4 py-3 text-sm text-cyan">{plan.result.message || "Port plan updated."}</div>}
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
  const [manualId, setManualId] = useState("");
  const [manualName, setManualName] = useState("");
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

  async function installManualMod(event: React.FormEvent) {
    event.preventDefault();
    if (!service || !manualId.trim()) return;
    await api(`/services/${service.id}/mods`, {
      method: "POST",
      body: JSON.stringify({ id: manualId.trim(), provider, name: manualName.trim() || `${activeProvider?.name || provider} ${manualId.trim()}`, enabled: true }),
    });
    setManualId("");
    setManualName("");
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
              <p className="text-sm text-slate-400">Search through the provider API when available, or add a Workshop/mod ID directly. External providers open in a new tab.</p>
            </div>
            {activeProvider?.web_url && <a href={activeProvider.web_url} target="_blank" className="icon-button"><ExternalLink className="h-4 w-4" /> Open</a>}
          </div>
          <div className="flex gap-3">
            <div className="relative flex-1"><Search className="absolute left-4 top-3.5 h-4 w-4 text-slate-500" /><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && searchMods()} placeholder="Search by mod name, keyword, collection, or author..." className="field pl-11" /></div>
            <button onClick={searchMods} className="primary-button min-w-32">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Search</button>
          </div>
          {message && <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">{message}</div>}
        </div>

        <form onSubmit={installManualMod} className="command-panel rounded-3xl p-5">
          <div className="mb-4 flex items-center justify-between gap-4"><div><h3 className="font-display text-2xl">Add Mod By ID</h3><p className="text-sm text-slate-400">Use this for Steam Workshop IDs, Nexus/Mod.io IDs, collections, or providers that block iframe browsing.</p></div><span className="status-pill">{provider}</span></div>
          <div className="grid grid-cols-[1fr_1fr_auto] gap-3">
            <input className="field" value={manualId} onChange={(event) => setManualId(event.target.value)} placeholder="Mod or collection ID" />
            <input className="field" value={manualName} onChange={(event) => setManualName(event.target.value)} placeholder="Friendly name optional" />
            <button className="primary-button"><Plus className="h-4 w-4" /> Install</button>
          </div>
        </form>

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

        {!results.length && <div className="provider-guide rounded-3xl p-6">
          <Globe2 className="h-10 w-10 text-cyan" />
          <div><h3 className="font-display text-2xl">Provider Browser</h3><p className="mt-1 text-sm text-slate-400">Use the Open button to browse {activeProvider?.name || "the provider"} in a new tab, then paste the mod or collection ID above. This avoids blank embedded pages caused by provider frame-blocking policies.</p></div>
          {activeProvider?.web_url && <a href={activeProvider.web_url} target="_blank" className="primary-button"><ExternalLink className="h-4 w-4" /> Open Provider</a>}
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

function BackupsPanel({ service }: { service: Service | null }) {
  const [backups, setBackups] = useState<any[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    if (!service) return;
    setBackups(await api<any[]>(`/services/${service.id}/backups`));
  }
  async function create() {
    if (!service) return;
    setBusy(true);
    setMessage("");
    try {
      const backup = await api<any>(`/services/${service.id}/backups`, { method: "POST" });
      setMessage(`Backup created: ${backup.name}`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Backup failed");
    } finally {
      setBusy(false);
    }
  }
  async function restore(name: string) {
    if (!service || !window.confirm(`Restore ${name}? This stops the service and replaces the current server files.`)) return;
    setBusy(true);
    setMessage("");
    try {
      await api<any>(`/services/${service.id}/backups/restore`, { method: "POST", body: JSON.stringify({ name }) });
      setMessage(`Restored backup: ${name}`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Restore failed");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => { load().catch((error) => setMessage(error.message)); }, [service?.id]);
  if (!service) return <div className="empty-state"><Database className="mx-auto mb-4 h-12 w-12 text-cyan" /><h2>Select a server</h2><p>Backups are created per game instance on the node that owns the service data.</p></div>;
  return <div className="space-y-5">
    <section className="hero-panel overflow-hidden rounded-[2rem] p-7"><div className="relative z-10 flex items-center justify-between gap-5"><div><div className="text-sm uppercase tracking-[0.25em] text-cyan">Snapshots</div><h2 className="font-display text-4xl font-bold">{service.name}</h2><p className="mt-2 text-sm text-slate-300">Create archived restore points from the live service directory.</p></div><button className="primary-button" onClick={create} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />} Create Backup</button></div></section>
    <div className="command-panel rounded-3xl p-5">
      <h3 className="mb-4 font-display text-2xl">Available Backups</h3>
      {backups.length ? <div className="grid grid-cols-3 gap-4">{backups.map((backup) => <article key={backup.name} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <div className="font-semibold">{backup.name}</div><div className="mt-2 text-sm text-slate-400">{Math.ceil((backup.size || 0) / 1024)} KB</div><div className="mt-1 text-xs text-slate-500">{backup.created_at || backup.updated_at}</div>
        <button className="control-button mt-4 w-full justify-center" onClick={() => restore(backup.name)} disabled={busy}><RotateCcw className="h-4 w-4" /> Restore</button>
      </article>)}</div> : <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-slate-400">No backups yet.</div>}
      {message && <div className="mt-4 rounded-2xl border border-cyan/20 bg-cyan/10 px-4 py-3 text-sm text-cyan">{message}</div>}
    </div>
  </div>;
}

function SchedulerPanel({ service, services }: { service: Service | null; services: Service[] }) {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ service_id: service?.id || "", name: "Daily backup", action: "backup", cadence: "daily", time_of_day: "04:00", interval_minutes: "60", command: "say Scheduled maintenance starting" });
  async function load() {
    const suffix = service ? `?service_id=${service.id}` : "";
    setTasks(await api<ScheduledTask[]>(`/scheduler/tasks${suffix}`));
  }
  async function createTask(event: React.FormEvent) {
    event.preventDefault();
    const task = await api<ScheduledTask>("/scheduler/tasks", {
      method: "POST",
      body: JSON.stringify({
        ...form,
        service_id: form.service_id || service?.id,
        interval_minutes: Number(form.interval_minutes),
      }),
    });
    setMessage(`Scheduled ${task.name}`);
    await load();
  }
  async function runTask(task: ScheduledTask) {
    const updated = await api<ScheduledTask>(`/scheduler/tasks/${task.id}/run`, { method: "POST" });
    setMessage(`${updated.name}: ${updated.last_status || "run queued"}`);
    await load();
  }
  async function toggleTask(task: ScheduledTask) {
    await api<ScheduledTask>(`/scheduler/tasks/${task.id}`, { method: "PUT", body: JSON.stringify({ enabled: !task.enabled }) });
    await load();
  }
  async function deleteTask(task: ScheduledTask) {
    if (!window.confirm(`Delete scheduled task ${task.name}?`)) return;
    await api(`/scheduler/tasks/${task.id}`, { method: "DELETE" });
    await load();
  }
  useEffect(() => { setForm((current) => ({ ...current, service_id: service?.id || current.service_id })); }, [service?.id]);
  useEffect(() => { load().catch((error) => setMessage(error.message)); }, [service?.id]);
  return <div className="space-y-5">
    <section className="hero-panel overflow-hidden rounded-[2rem] p-7"><div className="relative z-10"><div className="text-sm uppercase tracking-[0.25em] text-cyan">Automation</div><h2 className="font-display text-4xl font-bold">Scheduler</h2><p className="mt-2 max-w-2xl text-sm text-slate-300">Create customer-safe automation for restarts, backups, power actions, and server console commands.</p></div></section>
    <form onSubmit={createTask} className="command-panel rounded-3xl p-5">
      <div className="mb-4 flex items-center gap-3"><CalendarClock className="h-5 w-5 text-cyan" /><h3 className="font-display text-2xl">Create Scheduled Task</h3></div>
      <div className="grid grid-cols-3 gap-3">
        <label className="setting-field"><span>Instance</span><select className="field" value={form.service_id} onChange={(event) => setForm({ ...form, service_id: event.target.value })}>{services.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="setting-field"><span>Name</span><input className="field" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
        <label className="setting-field"><span>Action</span><select className="field" value={form.action} onChange={(event) => setForm({ ...form, action: event.target.value })}>{["backup", "restart", "start", "stop", "kill", "command"].map((action) => <option key={action} value={action}>{action}</option>)}</select></label>
        <label className="setting-field"><span>Cadence</span><select className="field" value={form.cadence} onChange={(event) => setForm({ ...form, cadence: event.target.value })}>{["daily", "weekly", "hourly", "interval", "manual"].map((cadence) => <option key={cadence} value={cadence}>{cadence}</option>)}</select></label>
        <label className="setting-field"><span>Time</span><input className="field" value={form.time_of_day} onChange={(event) => setForm({ ...form, time_of_day: event.target.value })} placeholder="04:00" /></label>
        <label className="setting-field"><span>Interval Minutes</span><input className="field" value={form.interval_minutes} onChange={(event) => setForm({ ...form, interval_minutes: event.target.value })} /></label>
      </div>
      {form.action === "command" && <label className="setting-field mt-3"><span>Command</span><input className="field" value={form.command} onChange={(event) => setForm({ ...form, command: event.target.value })} /></label>}
      <button className="primary-button mt-4"><Plus className="h-4 w-4" /> Add Task</button>
    </form>
    <div className="command-panel rounded-3xl p-5">
      <h3 className="mb-4 font-display text-2xl">Scheduled Automation</h3>
      {tasks.length ? <div className="space-y-3">{tasks.map((task) => <div key={task.id} className="grid grid-cols-[1fr_auto] gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <div><div className="flex items-center gap-2"><strong>{task.name}</strong><span className={`rounded-full px-2 py-1 text-xs ${task.enabled ? "bg-emerald-400/10 text-emerald-200" : "bg-slate-500/10 text-slate-300"}`}>{task.enabled ? "enabled" : "disabled"}</span><span className="rounded-full bg-cyan/10 px-2 py-1 text-xs text-cyan">{task.action}</span></div>
          <div className="mt-1 text-sm text-slate-400">{task.cadence} · next {task.next_run_at || "manual only"} · last {task.last_status || "never"}</div>
          {task.last_error && <div className="mt-2 text-sm text-red-200">{task.last_error}</div>}</div>
        <div className="flex items-center gap-2"><button className="control-button" onClick={() => runTask(task)}><Play className="h-4 w-4" /> Run</button><button className="control-button" onClick={() => toggleTask(task)}>{task.enabled ? "Disable" : "Enable"}</button><button className="control-button danger" onClick={() => deleteTask(task)}><Trash2 className="h-4 w-4" /></button></div>
      </div>)}</div> : <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-slate-400">No scheduled tasks yet.</div>}
      {message && <div className="mt-4 rounded-2xl border border-cyan/20 bg-cyan/10 px-4 py-3 text-sm text-cyan">{message}</div>}
    </div>
  </div>;
}

function MailOutbox() {
  const [emails, setEmails] = useState<EmailRecord[]>([]);
  const [selected, setSelected] = useState<EmailRecord | null>(null);
  const [message, setMessage] = useState("");
  async function load() {
    const data = await api<EmailRecord[]>("/email/outbox");
    setEmails(data);
    setSelected((current) => current || data[0] || null);
  }
  useEffect(() => { load().catch((error) => setMessage(error.message)); }, []);
  return <div className="space-y-5">
    <section className="hero-panel overflow-hidden rounded-[2rem] p-7"><div className="relative z-10 flex items-center justify-between gap-5"><div><div className="text-sm uppercase tracking-[0.25em] text-cyan">Customer Communications</div><h2 className="font-display text-4xl font-bold">Mail Outbox</h2><p className="mt-2 max-w-2xl text-sm text-slate-300">Review provisioning and login emails generated by payment fulfillment.</p></div><button className="icon-button" onClick={load}><RotateCcw className="h-4 w-4" /> Refresh</button></div></section>
    <div className="grid grid-cols-[380px_1fr] gap-5">
      <div className="command-panel rounded-3xl p-4">
        {emails.map((email) => <button key={email.id} onClick={() => setSelected(email)} className={`mini-service mb-2 w-full ${selected?.id === email.id ? "mini-service-active" : ""}`}><span className="truncate">{email.subject}</span><span>{email.status}</span></button>)}
        {!emails.length && <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-slate-400">No customer emails generated yet.</div>}
      </div>
      <div className="console-frame rounded-3xl p-5">
        {selected ? <><div className="mb-4"><div className="text-sm text-slate-400">To {selected.to}</div><h3 className="font-display text-2xl">{selected.subject}</h3><div className="mt-1 text-xs text-slate-500">{selected.status} · {selected.created_at}</div></div><pre className="h-[520px] overflow-auto whitespace-pre-wrap rounded-2xl border border-white/10 bg-black/60 p-4 font-mono text-sm leading-6 text-emerald-100">{selected.body}</pre></> : <div className="empty-state"><Mail className="mx-auto mb-4 h-12 w-12 text-cyan" /><h2>No email selected</h2><p>Select an outbox item to read the customer-facing message.</p></div>}
      </div>
    </div>
    {message && <div className="rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-100">{message}</div>}
  </div>;
}

function UsersPanel() {
  const [users, setUsers] = useState<any[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ email: "", name: "", password: "", role: "customer" });
  async function load() {
    const [userData, roleData, serviceData] = await Promise.all([api<any[]>("/users"), api<string[]>("/users/roles"), api<Service[]>("/services")]);
    setUsers(userData);
    setRoles(roleData);
    setServices(serviceData);
  }
  async function createUser(event: React.FormEvent) {
    event.preventDefault();
    const created = await api<any>("/users", { method: "POST", body: JSON.stringify(form) });
    setMessage(`Created ${created.email}`);
    setForm({ email: "", name: "", password: "", role: "customer" });
    await load();
  }
  async function updateRole(user: any, role: string) {
    const updated = await api<any>(`/users/${user.id}/role`, { method: "PUT", body: JSON.stringify({ role }) });
    setUsers((items) => items.map((item) => item.id === updated.id ? updated : item));
    setMessage(`${updated.email} is now ${updated.role}`);
  }
  async function assignService(service: Service, owner_user_id: string) {
    await api<Service>(`/services/${service.id}`, { method: "PUT", body: JSON.stringify({ owner_user_id }) });
    const owner = users.find((user) => user.id === owner_user_id);
    setMessage(`${service.name} assigned to ${owner?.email || owner_user_id}`);
    await load();
  }
  useEffect(() => { load().catch((error) => setMessage(error.message)); }, []);
  return <div className="space-y-5">
    <section className="hero-panel overflow-hidden rounded-[2rem] p-7"><div className="relative z-10"><div className="text-sm uppercase tracking-[0.25em] text-cyan">Access Control</div><h2 className="font-display text-4xl font-bold">Users & Roles</h2><p className="mt-2 max-w-2xl text-sm text-slate-300">Assign platform roles for staff, customers, viewers, and superadmins.</p></div></section>
    <form onSubmit={createUser} className="command-panel rounded-3xl p-5">
      <div className="mb-4 flex items-center gap-3"><UserPlus className="h-5 w-5 text-cyan" /><h3 className="font-display text-2xl">Create User</h3></div>
      <div className="grid grid-cols-4 gap-3">
        <input className="field" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="customer@example.com" />
        <input className="field" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Customer name" />
        <input className="field" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="Temporary password" />
        <select className="field" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>{roles.map((role) => <option key={role} value={role}>{role}</option>)}</select>
      </div>
      <button className="primary-button mt-4"><UserPlus className="h-4 w-4" /> Create User</button>
    </form>
    <div className="command-panel rounded-3xl p-5">
      <div className="space-y-3">{users.map((user) => <div key={user.id} className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <div><div className="font-semibold">{user.name}</div><div className="text-sm text-slate-400">{user.email}</div></div>
        <select className="field max-w-64" value={user.role} onChange={(event) => updateRole(user, event.target.value)}>{roles.map((role) => <option key={role} value={role}>{role}</option>)}</select>
      </div>)}</div>
      {!users.length && <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-slate-400">No users loaded.</div>}
      {message && <div className="mt-4 rounded-2xl border border-cyan/20 bg-cyan/10 px-4 py-3 text-sm text-cyan">{message}</div>}
    </div>
    <div className="command-panel rounded-3xl p-5">
      <h3 className="mb-4 font-display text-2xl">Instance Assignments</h3>
      <div className="space-y-3">{services.map((service) => <div key={service.id} className="grid grid-cols-[1fr_320px] items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <div><div className="font-semibold">{service.name}</div><div className="text-sm text-slate-400">{service.template_id} · {service.status} · {service.power_state}</div></div>
        <select className="field" value={service.owner_user_id || ""} onChange={(event) => assignService(service, event.target.value)}>{users.map((user) => <option key={user.id} value={user.id}>{user.name} - {user.email}</option>)}</select>
      </div>)}</div>
      {!services.length && <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-slate-400">No services available to assign.</div>}
    </div>
  </div>;
}

function Billing() {
  const [gateways, setGateways] = useState<any[]>([]);
  const [message, setMessage] = useState("");
  useEffect(() => { api<any[]>("/billing/gateways").then(setGateways).catch((error) => setMessage(error.message)); }, []);
  return <div className="space-y-5">
    <section className="hero-panel overflow-hidden rounded-[2rem] p-7"><div className="relative z-10"><div className="text-sm uppercase tracking-[0.25em] text-cyan">Revenue Operations</div><h2 className="font-display text-4xl font-bold">AetherNode Billing Bridge</h2><p className="mt-2 max-w-2xl text-sm text-slate-300">Checkout happens on AetherNode.org. AetherPanel receives paid-order fulfillment, creates the client account, provisions the service, and queues the welcome email.</p></div></section>
    <div className="grid grid-cols-[1fr_0.8fr] gap-5">
      <div className="command-panel rounded-3xl p-5">
        <h3 className="mb-4 font-display text-2xl">Payment Gateways</h3>
        <div className="grid grid-cols-2 gap-4">{gateways.map((gateway) => <article key={gateway.id} className="gateway-card">
          <div className="mb-4 flex items-center justify-between gap-3"><div><div className="text-xs uppercase tracking-[0.18em] text-cyan">{gateway.mode}</div><h4 className="font-display text-2xl">{gateway.name}</h4></div><span className={`status-pill ${gateway.status === "configured" ? "status-good" : ""}`}>{gateway.status}</span></div>
          <div className="space-y-2 text-sm text-slate-300"><div className="flex justify-between"><span>Currency</span><strong>{gateway.currency}</strong></div><div className="flex justify-between"><span>Client Panel</span><strong>panel.aethernode.org</strong></div><div className="flex justify-between"><span>Storefront</span><strong>AetherNode.org</strong></div></div>
        </article>)}</div>
        {!gateways.length && <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-slate-400">No payment gateways returned by the API.</div>}
      </div>
      <div className="command-panel rounded-3xl p-5">
        <h3 className="mb-4 font-display text-2xl">Fulfillment Endpoint</h3>
        <div className="rounded-2xl border border-cyan/20 bg-cyan/10 p-4 font-mono text-sm text-cyan">POST /api/v1/billing/fulfillment/payment-completed</div>
        <div className="mt-4 space-y-3 text-sm text-slate-300">
          <div className="flex items-center gap-3"><span className="status-pill status-good">1</span> PayPal confirms payment on AetherNode.org</div>
          <div className="flex items-center gap-3"><span className="status-pill status-good">2</span> AetherPanel creates or reuses the client login</div>
          <div className="flex items-center gap-3"><span className="status-pill status-good">3</span> The game server is assigned and queued for install</div>
          <div className="flex items-center gap-3"><span className="status-pill status-good">4</span> Login/server details are written to Mail</div>
        </div>
      </div>
    </div>
    {message && <div className="rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-100">{message}</div>}
  </div>;
}

function Provisioning() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [message, setMessage] = useState("");
  async function load() { setJobs(await api<any[]>("/provisioning/jobs")); }
  useEffect(() => { load().catch((error) => setMessage(error.message)); }, []);
  return <div className="space-y-5">
    <section className="hero-panel overflow-hidden rounded-[2rem] p-7"><div className="relative z-10 flex items-center justify-between gap-5"><div><div className="text-sm uppercase tracking-[0.25em] text-cyan">Automation</div><h2 className="font-display text-4xl font-bold">Provisioning Queue</h2><p className="mt-2 max-w-2xl text-sm text-slate-300">Install, reinstall, update, and fulfillment jobs submitted by the panel and billing pipeline.</p></div><button className="icon-button" onClick={load}><RotateCcw className="h-4 w-4" /> Refresh</button></div></section>
    <ConsoleFrame title="Queue Console" logs={jobs.length ? jobs.map((job) => `[${job.updated_at || job.created_at || "pending"}] ${job.status || "queued"} ${job.action || "job"} service=${job.service_id || "unknown"} queue=${job.queue || "memory"} id=${job.id || "n/a"}${job.warning ? ` warning=${job.warning}` : ""}${job.completed_at ? ` completed=${job.completed_at}` : ""}`).join("\n") : "[queue] No provisioning jobs have been queued yet."} />
    {message && <div className="rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-100">{message}</div>}
  </div>;
}

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
