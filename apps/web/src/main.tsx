import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Activity, Boxes, CreditCard, ExternalLink, Gauge, Gamepad2, Globe2, ImageIcon, KeyRound, LayoutDashboard, ListChecks, Loader2, Network, Play, Plus, RotateCcw, Search, Server, Settings, Shield, Sparkles, Square, UploadCloud, Users } from "lucide-react";
import "./styles/global.css";
import { api, login, logout, token } from "./lib/api";

type Template = { id: string; name: string; category: string; summary: string; resources: { recommended_ram_mb: number; min_disk_gb: number; cpu: string }; workshop: { enabled: boolean; providers: string[] }; ports: Array<{ key: string; default: number; protocol: string }> };
type ModEntry = { id: string; provider: string; name?: string; summary?: string; thumbnail_url?: string; page_url?: string; enabled: boolean; order: number };
type Service = { id: string; name: string; template_id: string; status: string; power_state: string; ports: Array<{ key: string; host: number; protocol: string }>; mods: ModEntry[] };
type ModProvider = { id: string; name: string; configured: boolean; searchable: boolean; web_url: string; note: string };
type ModSearchItem = { id: string; provider: string; name: string; summary?: string; thumbnail_url?: string; page_url?: string; tags?: string[]; subscriptions?: number; favorited?: number };

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
  }), [services, templates, nodes]);

  const nav = [
    ["dashboard", LayoutDashboard, "Dashboard"],
    ["services", Server, "Services"],
    ["templates", Gamepad2, "Game Templates"],
    ["mods", Boxes, "Workshop Mods"],
    ["nodes", Network, "Nodes"],
    ["billing", CreditCard, "Billing"],
    ["provisioning", ListChecks, "Provisioning"],
    ["users", Users, "Users"],
    ["settings", Settings, "Settings"],
    ["audit", Shield, "Audit"],
  ] as const;

  if (loading) return <div className="min-h-screen grid place-items-center"><Loader2 className="h-8 w-8 animate-spin text-cyan" /></div>;

  return (
    <div className="min-h-screen grid grid-cols-[260px_1fr]">
      <aside className="border-r border-white/10 bg-black/30 p-4">
        <div className="mb-8 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-cyan/15 text-cyan glow"><Server /></div>
          <div>
            <div className="font-display text-xl font-bold">AetherPanel</div>
            <div className="text-xs text-slate-400">Proprietary Hosting OS</div>
          </div>
        </div>
        <nav className="space-y-1">
          {nav.map(([id, Icon, label]) => (
            <button key={id} onClick={() => setActive(id)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${active === id ? "bg-cyan/15 text-cyan" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </nav>
        <button onClick={logout} className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-300 hover:bg-white/5">
          <KeyRound className="h-4 w-4" /> Sign out
        </button>
      </aside>
      <main className="p-8">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <div className="text-sm uppercase tracking-[0.3em] text-cyan">Control Plane</div>
            <h1 className="font-display text-4xl font-bold">{nav.find(([id]) => id === active)?.[2]}</h1>
          </div>
          <div className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-sm text-emerald-200">Docker MVP Runtime</div>
        </header>
        {active === "dashboard" && <Dashboard stats={stats} audits={audits} services={services} />}
        {active === "templates" && <Templates templates={templates} />}
        {active === "services" && <Services services={services} templates={templates} selected={selectedService} setSelected={setSelectedService} refresh={refresh} logs={logs} />}
        {active === "mods" && <Mods service={selectedService} refresh={refresh} />}
        {active === "nodes" && <Panel title="Nodes" items={nodes} empty="No nodes yet. The local Docker node is seeded by the API." />}
        {active === "billing" && <Billing />}
        {active === "provisioning" && <Provisioning />}
        {active === "users" && <Placeholder icon={Users} title="Users & Roles" body="RBAC contracts are implemented for superadmin, provider admin, staff, customer, and viewer roles." />}
        {active === "settings" && <Placeholder icon={Settings} title="Settings" body="Branding, Steam, payment gateway, security, and support settings are exposed through /api/v1/settings/:section." />}
        {active === "audit" && <Panel title="Audit Log" items={audits} empty="No audit events yet." />}
      </main>
    </div>
  );
}

function Dashboard({ stats, audits, services }: any) {
  return <div className="space-y-6">
    <div className="grid grid-cols-4 gap-4">
      {[["Active Services", stats.active, Server], ["Running", stats.running, Activity], ["Workshop Ready", stats.workshop, Boxes], ["Nodes", stats.nodes, Network]].map(([label, value, Icon]: any) => (
        <div key={label} className="glass rounded-2xl p-5"><Icon className="mb-4 text-cyan" /><div className="text-3xl font-bold">{value}</div><div className="text-sm text-slate-400">{label}</div></div>
      ))}
    </div>
    <div className="grid grid-cols-[1.3fr_0.7fr] gap-4">
      <div className="glass rounded-2xl p-6"><h2 className="mb-4 font-display text-2xl">Live Services</h2><ServiceRows services={services} /></div>
      <div className="glass rounded-2xl p-6"><h2 className="mb-4 font-display text-2xl">Recent Audit</h2><pre className="max-h-80 overflow-auto text-xs text-slate-300">{JSON.stringify(audits.slice(0, 8), null, 2)}</pre></div>
    </div>
  </div>;
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
  return <div className="grid grid-cols-[360px_1fr] gap-5">
    <div className="glass rounded-2xl p-5">
      <h2 className="mb-4 font-display text-2xl">Deploy</h2>
      <div className="max-h-[560px] space-y-2 overflow-auto">
        {templates.slice(0, 24).map((template: Template) => <button key={template.id} onClick={() => createService(template.id)} className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-sm hover:border-cyan/40">
          <span>{template.name}</span><UploadCloud className="h-4 w-4 text-cyan" />
        </button>)}
      </div>
    </div>
    <div className="space-y-5">
      <div className="glass rounded-2xl p-5"><h2 className="mb-4 font-display text-2xl">Services</h2><ServiceRows services={services} onPick={setSelected} /></div>
      {selected && <div className="glass rounded-2xl p-5">
        <div className="mb-4 flex items-center justify-between"><h3 className="font-display text-2xl">{selected.name}</h3><span className="text-sm text-slate-400">{selected.status} · {selected.power_state}</span></div>
        <div className="mb-4 flex gap-2">{["start", "stop", "restart", "kill"].map((action) => <button key={action} onClick={() => power(action)} className="rounded-xl bg-cyan/15 px-3 py-2 text-sm capitalize text-cyan hover:bg-cyan/25">{action === "start" ? <Play className="inline h-4 w-4" /> : action === "stop" ? <Square className="inline h-4 w-4" /> : <RotateCcw className="inline h-4 w-4" />} {action}</button>)}</div>
        <pre className="h-72 overflow-auto rounded-xl border border-white/10 bg-black/40 p-4 font-mono text-xs text-emerald-200">{logs}</pre>
      </div>}
    </div>
  </div>;
}

function ServiceRows({ services, onPick }: any) {
  if (!services.length) return <div className="rounded-xl border border-dashed border-white/15 p-8 text-center text-slate-400">No services yet.</div>;
  return <div className="space-y-2">{services.map((service: Service) => <button key={service.id} onClick={() => onPick?.(service)} className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left hover:border-cyan/40">
    <span><span className="font-semibold">{service.name}</span><span className="ml-2 text-xs text-slate-500">{service.template_id}</span></span><span className="text-xs text-cyan">{service.power_state}</span>
  </button>)}</div>;
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
