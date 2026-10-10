import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../../../../packages/auth/src/react";
import { useResource, errorMessage } from "../../../../../packages/ui/src/workflows";
import { AuthenticatorPanel } from "../AuthenticatorPanel";
import {
  Activity, AlertTriangle, ArrowRight, Bell, Bike, CalendarDays, CheckCircle2,
  ChevronDown, ChevronLeft, ChevronRight, CircleDollarSign, Clock3, Download,
  FileText, Filter, Headphones, LayoutDashboard, LifeBuoy, LockKeyhole, LogOut,
  MapPin, Maximize2, MoreHorizontal, Navigation, Package, Radio, RefreshCw,
  Search, Settings, Shield, ShoppingCart, Store, TrendingUp, Truck, UserRound,
  Users, Wallet, X
} from "lucide-react";
import "./phase-one.css";

type Row = Record<string, any>;
type View = "command" | "dispatch" | "orders" | "riders";
type NavItem = { id: string; label: string; group?: string };
const fmt = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value.toLocaleString("en-KE") : "—";
const money = (minor: unknown) => typeof minor === "number" && Number.isFinite(minor) ? "KES " + (minor / 100).toLocaleString("en-KE", { minimumFractionDigits: 2 }) : "—";
const since = (value?: string) => value && !Number.isNaN(new Date(value).getTime()) ? new Date(value).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" }) : "Not recorded";
const safe = (value: any, fallback = "Not available") => value === undefined || value === null || value === "" ? fallback : String(value);
const normal = (s: any) => String(s || "UNKNOWN").replaceAll("_", " ").toLowerCase();
const id = (r: Row) => encodeURIComponent(String(r.id));
const isAllowed = (roles: string[], arr: string[]) => roles.some((r) => arr.includes(r));
const asList = (data: unknown): Row[] => Array.isArray(data) ? data as Row[] : [];
const coord = (p: any) => {
  if (!p) return null;
  const lat = Number(p.latitude ?? p.lat ?? p.lastKnownLatitude);
  const lng = Number(p.longitude ?? p.lng ?? p.lon ?? p.lastKnownLongitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
};

function Status({ value }: { value: unknown }) {
  const text = safe(value, "Unknown");
  const up = text.toUpperCase();
  const tone = /COMPLETED|DELIVERED|ACTIVE|APPROVED|ONLINE_AVAILABLE|PAID|HEALTHY/.test(up) ? "green" :
    /CANCEL|FAIL|REJECT|SUSPEND|CRITICAL|DELAY/.test(up) ? "red" :
    /PENDING|PREPAR|OFFERED|REVIEW|UNASSIGNED/.test(up) ? "amber" :
    /ASSIGNED|EN_ROUTE|PICK|BUSY/.test(up) ? "blue" : "grey";
  return <span className={"ar-status ar-" + tone}>{normal(text)}</span>;
}
function Panel({ title, caption, action, children, className = "" }: { title: string; caption?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return <section className={"ar-panel " + className}><div className="ar-panel-head"><div><h2>{title}</h2>{caption && <p>{caption}</p>}</div>{action}</div>{children}</section>;
}
function Loading({ loading, error, hasData, refresh }: { loading?: boolean; error?: string | null; hasData?: boolean; refresh?: () => unknown }) {
  return <>{loading && !hasData && <div className="ar-notice" role="status">Loading records…</div>}{error && <div className="ar-notice ar-error" role="alert">{error} {refresh && <button onClick={refresh}>Retry</button>}</div>}</>;
}
function Empty({ label = "No records match this view" }: { label?: string }) { return <div className="ar-empty"><Package size={23}/><strong>{label}</strong><span>Try a different filter or refresh to check again.</span></div>; }
function Metric({ icon, label, value, detail, tone = "green" }: { icon: React.ReactNode; label: string; value: React.ReactNode; detail?: React.ReactNode; tone?: string }) {
  return <div className="ar-metric"><span className={"ar-metric-icon ar-ink-" + tone}>{icon}</span><div><span className="ar-metric-label">{label}</span><strong>{value}</strong><small>{detail || "Live platform records"}</small></div></div>;
}
function Tabs({ active, items, set }: { active: string; items: { key: string; text: string }[]; set: (key: string) => void }) {
  return <div className="ar-tabs" role="tablist" aria-label="View filters">{items.map(t => <button key={t.key} role="tab" aria-selected={active === t.key} className={active === t.key ? "active" : ""} onClick={() => set(t.key)}>{t.text}</button>)}</div>;
}
function CSV({ name, rows, columns }: { name: string; rows: Row[]; columns: string[] }) {
  return <button className="ar-button ar-outline" onClick={() => {
    const escape = (v: any) => '"' + String(v ?? "").replaceAll('"', '""') + '"';
    const content = [columns.join(","), ...rows.map(r => columns.map(c => escape(r[c])).join(","))].join("\r\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
  }} disabled={!rows.length}><Download size={15}/> Export visible</button>;
}
function Callout({ children }: { children: React.ReactNode }) { return <p className="ar-callout">{children}</p>; }
const navGroups = [
  { name: "OPERATIONS", entries: [["command", "Command Center", LayoutDashboard], ["dispatch", "Live Dispatch", Radio], ["orders", "Orders & Deliveries", Truck], ["riders", "Riders & Fleet", Bike], ["incidents", "Incidents", AlertTriangle], ["support", "Support & Conversations", Headphones]] },
  { name: "MARKETPLACE", entries: [["merchants", "Merchants", Store], ["users", "Customers", Users], ["geography", "Geography & Coverage", MapPin]] },
  { name: "FINANCE", entries: [["payments", "Payments & Refunds", Wallet], ["settlements", "Settlements & Payouts", CircleDollarSign], ["financeOverview", "Financial Control", TrendingUp]] },
  { name: "INTELLIGENCE", entries: [["notifications", "Notifications", Bell]] },
  { name: "ADMINISTRATION", entries: [["governance", "Identity & Security", Shield], ["overview", "System Health", Activity], ["configuration", "Configuration", Settings]] }
] as const;

export function ApprovedPhaseOne({ view, available, onNavigate, onLogout, userName }: {
  view: View; available: NavItem[]; onNavigate: (id: string) => void; onLogout: () => void; userName?: string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState("");
  const [globalSearch, setGlobalSearch] = useState("");
  const allowed = useMemo(() => new Set(available.map(i => i.id)), [available]);
  const go = (destination: string) => { if (allowed.has(destination)) onNavigate(destination); };
  return <div className={"ar-app" + (collapsed ? " ar-collapsed" : "")}>
    <aside className="ar-sidebar">
      <div className="ar-brand"><span className="ar-brand-symbol">◉▶</span><span className="ar-brand-name">DeeToo<small>Rush</small></span></div>
      <div className="ar-side-nav">
        {navGroups.map(group => {
          const entries = group.entries.filter(e => allowed.has(e[0]));
          if (!entries.length) return null;
          return <div className="ar-navgroup" key={group.name}><div className="ar-group-label">{group.name}</div>{entries.map(([key, label, Icon]) =>
            <button key={key} type="button" onClick={() => go(key)} aria-current={key === view ? "page" : undefined} title={label} className={"ar-navitem" + (key === view ? " selected" : "")}><Icon size={17}/><span>{label}</span></button>
          )}</div>;
        })}
        {available.filter(item => !navGroups.some(g => g.entries.some(e => e[0] === item.id))).length > 0 && <div className="ar-navgroup"><div className="ar-group-label">MORE WORKSPACES</div>{available.filter(item => !navGroups.some(g => g.entries.some(e => e[0] === item.id))).map(item => <button key={item.id} className="ar-navitem" onClick={() => go(item.id)}><FileText size={16}/><span>{item.label}</span></button>)}</div>}
      </div>
      <div className="ar-side-foot"><button onClick={() => setCollapsed(!collapsed)}><ChevronLeft size={16}/><span>{collapsed ? "Expand" : "Collapse"} Sidebar</span></button><button onClick={onLogout}><LogOut size={16}/><span>Sign out</span></button></div>
    </aside>
    <div className="ar-frame">
      <header className="ar-topbar">
        <form className="ar-global-search" onSubmit={e => { e.preventDefault(); setGlobalSearch(query); go("orders"); }}><Search size={18}/><input aria-label="Global admin search" placeholder="Search orders, riders, merchants, customers…" value={query} onChange={e => setQuery(e.target.value)}/><kbd>↵</kbd></form>
        <div className="ar-topright"><span className="ar-county"><MapPin size={16}/> Kenya (All Counties) <ChevronDown size={13}/></span><span className="ar-top-user"><span className="ar-avatar">AD</span><span>{safe(userName, "Admin User")}<small>DeeToo Administration</small></span></span></div>
      </header>
      <main className="ar-main"><AuthenticatorPanel/>
        {view === "command" && <CommandScreen onNavigate={go}/>}
        {view === "dispatch" && <DispatchScreen onNavigate={go}/>}
        {view === "orders" && <OrdersScreen onNavigate={go} globalSearch={globalSearch}/>}
        {view === "riders" && <RidersScreen onNavigate={go} canProvision={allowed.has("governance")}/>}
      </main>
    </div>
  </div>;
}

function BarChart({ rows, label }: { rows: { label: string; value: number }[]; label: string }) {
  const max = Math.max(1, ...rows.map(r => r.value));
  return <div className="ar-bars" role="img" aria-label={label}>{rows.map(r => <div key={r.label} title={r.label + ": " + r.value}><span style={{ height: Math.max(2, 100 * r.value / max) + "%" }}/><small>{r.label}</small></div>)}</div>;
}

/* A real map, showing only reported coordinates. No fictitious routes or location estimates. */
type Point = { key: string; title: string; kind: "rider" | "pickup" | "dropoff" | "alert"; latitude: number; longitude: number; onClick?: () => void };
function GeoMap({ points, height = 375, onNavigate }: { points: Point[]; height?: number; onNavigate?: () => void }) {
  const [zoom, setZoom] = useState(11);
  const [focus, setFocus] = useState<{ lat: number; lng: number } | null>(null);
  const valid = points.filter(p => Number.isFinite(p.latitude) && Number.isFinite(p.longitude));
  const center = focus ?? (valid.length ? { lat: valid.reduce((a, p) => a + p.latitude, 0) / valid.length, lng: valid.reduce((a, p) => a + p.longitude, 0) / valid.length } : { lat: -1.2864, lng: 36.8172 });
  const xy = (lat: number, lng: number) => { const sin = Math.sin(lat * Math.PI / 180); const n = 2 ** zoom; return { x: (lng + 180) / 360 * n * 256, y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * n * 256 }; };
  const c = xy(center.lat, center.lng); const tiles: React.ReactNode[] = [];
  for (let dx = -3; dx <= 3; dx++) for (let dy = -3; dy <= 3; dy++) {
    const tx = Math.floor(c.x / 256) + dx, ty = Math.floor(c.y / 256) + dy;
    if (tx < 0 || ty < 0 || tx >= 2 ** zoom || ty >= 2 ** zoom) continue;
    tiles.push(<img key={tx + "-" + ty} src={"https://tile.openstreetmap.org/" + zoom + "/" + tx + "/" + ty + ".png"} alt="" loading="lazy" draggable={false}
      style={{ left: "calc(50% + " + (tx * 256 - c.x) + "px)", top: "calc(50% + " + (ty * 256 - c.y) + "px)" }}/>);
  }
  return <div className="ar-map" style={{ height }} role="group" aria-label="Reported delivery and rider locations">
    <div className="ar-map-tiles" aria-hidden="true">{tiles}</div>
    {!valid.length && <div className="ar-map-empty">No location coordinates have been reported for this view.</div>}
    {valid.map(p => { const loc = xy(p.latitude, p.longitude); const marker = p.kind === "rider" ? <Bike size={14}/> : p.kind === "pickup" ? <Store size={14}/> : p.kind === "alert" ? <AlertTriangle size={14}/> : <MapPin size={14}/>; return <button key={p.key} className={"ar-marker ar-marker-" + p.kind} title={p.title} aria-label={p.title} style={{ left: "calc(50% + " + (loc.x - c.x) + "px)", top: "calc(50% + " + (loc.y - c.y) + "px)" }} onClick={p.onClick || (() => setFocus({ lat: p.latitude, lng: p.longitude }))}>{marker}</button>; })}
    <div className="ar-map-tools"><button aria-label="Zoom in" onClick={() => setZoom(Math.min(16, zoom + 1))}>+</button><button aria-label="Zoom out" onClick={() => setZoom(Math.max(7, zoom - 1))}>−</button><button aria-label="Reset map" onClick={() => { setFocus(null); setZoom(11); }}><Maximize2 size={15}/></button></div>
    <div className="ar-map-legend"><span>● Rider</span><span>● Merchant</span><span>● Drop-off</span></div>
    <div className="ar-map-attribution">© OpenStreetMap contributors · coordinates, not route guidance</div>
    {onNavigate && <button className="ar-map-expand" onClick={onNavigate}>Open dispatch <ArrowRight size={14}/></button>}
  </div>;
}
function deliveryPoints(rows: Row[], click?: (r: Row) => void): Point[] {
  return rows.flatMap(r => {
    const arr: Point[] = [];
    for (const [key, position, kind] of [["pickup", r.pickup_location, "pickup"], ["dropoff", r.dropoff_location, "dropoff"], ["rider", r.last_location, "rider"]] as const) {
      const p = coord(position);
      if (p) arr.push({ key: safe(r.id) + key, title: safe(key === "rider" ? r.assigned_rider_name : key === "pickup" ? r.branch_name : r.dropoff_address_text, key), kind, latitude: p.lat, longitude: p.lng, onClick: click ? () => click(r) : undefined });
    }
    return arr;
  });
}
function CommandScreen({ onNavigate }: { onNavigate: (id: string) => void }) {
  const tower = useResource<Row>("/admin/operations/control-tower", 10000);
  const operations = useResource<Row>("/admin/operations/overview", 15000);
  const deliveries = useResource<Row[]>("/admin/dispatch/deliveries?limit=100", 10000);
  const incidents = useResource<Row>("/admin/operations/incidents?limit=6", 15000);
  const rows = asList(deliveries.data);
  const t = tower.data || {};
  const ops = operations.data || {};
  const delayed = rows.filter(r => Boolean(r.dispatch_attention_required) || /FAILED|DELAY/.test(safe(r.status)));
  const active = rows.filter(r => !/DELIVERED|CANCELLED|FAILED/.test(safe(r.status)));
  const bars = ["UNASSIGNED", "OFFERED", "ASSIGNED", "PICKED_UP", "EN_ROUTE", "DELIVERED"].map(x => ({ label: x.replace("_", " ").slice(0, 9), value: rows.filter(r => r.status === x).length }));
  return <div className="ar-screen">
    <div className="ar-welcome"><div><h1>Operations Command Center <span>👋</span></h1><p>Here's what's happening across DeeToo Rush right now.</p></div><div className="ar-period"><span><strong>{new Date().toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" })}</strong><small>{new Date().toLocaleDateString("en-KE", { dateStyle: "full" })}</small></span><button onClick={() => { tower.refresh(); deliveries.refresh(); operations.refresh(); incidents.refresh(); }}><RefreshCw size={15}/> Refresh</button></div></div>
    <Loading loading={tower.loading} error={tower.error} hasData={Boolean(tower.data)} refresh={tower.refresh}/>
    <div className="ar-metrics ar-metrics-8">
      <Metric icon={<ShoppingCart/>} label="Active orders" value={fmt(t.orders?.active)} detail="Current orders"/>
      <Metric icon={<CheckCircle2/>} label="Completed today" value={fmt(t.orders?.completed_today)} detail="Orders completed"/>
      <Metric icon={<Clock3/>} label="On-time rate" value="—" detail="SLA series not available" tone="blue"/>
      <Metric icon={<Users/>} label="Online riders" value={fmt(t.riders?.online)} detail="Reporting online" tone="blue"/>
      <Metric icon={<Bike/>} label="Available riders" value={fmt(t.riders?.available)} detail="Dispatch eligible"/>
      <Metric icon={<AlertTriangle/>} label="Delayed deliveries" value={fmt(t.deliveries?.delayed)} detail="Need attention" tone="red"/>
      <Metric icon={<Shield/>} label="Critical incidents" value={fmt(ops.incidents?.critical ?? t.operational?.critical_incidents)} detail="Investigate" tone="red"/>
      <Metric icon={<LifeBuoy/>} label="Urgent support" value={fmt(ops.supportCases?.urgent)} detail="Open urgent cases" tone="blue"/>
    </div>
    <div className="ar-dashboard-middle">
      <Panel title="Live Operations Map" caption="Reported rider, pickup and drop-off positions" action={<button className="ar-link" onClick={() => onNavigate("dispatch")}>Full dispatch <ArrowRight size={14}/></button>}>
        <Loading error={deliveries.error} loading={deliveries.loading} hasData={Boolean(deliveries.data)} refresh={deliveries.refresh}/>
        <GeoMap points={deliveryPoints(active)} height={370} onNavigate={() => onNavigate("dispatch")}/>
      </Panel>
      <div className="ar-stack">
        <Panel title="Delivery Status" caption="Breakdown of the most recent 100 delivery records"><BarChart rows={bars} label="Distribution of recently loaded delivery statuses"/><Callout>Based on available delivery records, not a historical time series.</Callout></Panel>
        <Panel title="Order & Marketplace Overview" caption="Today's authoritative snapshot"><div className="ar-stat-list"><div><span>Orders placed today</span><strong>{fmt(t.orders?.today)}</strong></div><div><span>Gross order value</span><strong>{money(t.orders?.gmv_today_minor)}</strong></div><div><span>Open merchant branches</span><strong>{fmt(t.merchants?.open_branches)}</strong></div><div><span>Unassigned deliveries</span><strong>{fmt(t.deliveries?.unassigned)}</strong></div></div></Panel>
      </div>
      <div className="ar-stack"><Panel title="Platform Status" caption="Latest health details" action={<button className="ar-link" onClick={() => onNavigate("overview")}>View health →</button>}><div className="ar-stat-list">{["Order processing", "Dispatch", "Payments", "Notifications", "Background jobs"].map(label => <div key={label}><span>{label}</span><small className="ar-muted">Open System Health for verified status</small></div>)}</div></Panel>
      <Panel title="Supply & Demand" caption="Current rider availability"><div className="ar-stat-list"><div><span>Approved riders</span><strong>{fmt(t.riders?.approved)}</strong></div><div><span>Available riders</span><strong>{fmt(t.riders?.available)}</strong></div><div><span>Busy riders</span><strong>{fmt(t.riders?.busy)}</strong></div></div></Panel></div>
    </div>
    <div className="ar-three">
      <Panel title={"Delayed & Attention Required (" + (t.deliveries?.delayed ?? delayed.length) + ")"} action={<button className="ar-link" onClick={() => onNavigate("dispatch")}>View all →</button>}>
        {delayed.length ? <div className="ar-small-rows">{delayed.slice(0, 5).map(r => <button key={r.id} onClick={() => onNavigate("dispatch")}><b>{safe(r.order_number, String(r.id).slice(0, 8))}</b><span>{safe(r.branch_name)}</span><Status value={r.status}/></button>)}</div> : <Empty label="No attention flags in loaded deliveries"/>}
      </Panel>
      <Panel title="Recent Incidents" action={<button className="ar-link" onClick={() => onNavigate("incidents")}>View all →</button>}>
        <Loading error={incidents.error} refresh={incidents.refresh}/>
        {asList(incidents.data?.incidents).length ? <div className="ar-small-rows">{asList(incidents.data?.incidents).slice(0,5).map(r => <button key={r.id} onClick={() => onNavigate("incidents")}><b>{safe(r.title, r.incident_type)}</b><Status value={r.severity}/><Status value={r.status}/></button>)}</div> : <Empty label="No recent incidents"/>}
      </Panel>
      <Panel title="Priority Actions" caption="Navigate to unresolved operational work"><div className="ar-quick-list">{[["Dispatch unassigned orders", "dispatch"], ["Review support conversations", "support"], ["Investigate financial exceptions", "payments"]].map(([name, target]) => <button key={target} onClick={() => onNavigate(target)}>{name}<ArrowRight size={16}/></button>)}</div></Panel>
    </div>
  </div>;
}

function Decision({ title, children, confirm, close, pending, tone = "danger", canConfirm = true }: { title: string; children: React.ReactNode; confirm: () => void; close: () => void; pending?: boolean; tone?: string; canConfirm?: boolean }) {
  return <div className="ar-modal-backdrop" role="presentation" onMouseDown={close}><div className="ar-modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={e => e.stopPropagation()}><div className="ar-modal-header"><h2>{title}</h2><button onClick={close} aria-label="Close"><X size={18}/></button></div>{children}<div className="ar-modal-actions"><button className="ar-button ar-outline" disabled={pending} onClick={close}>Cancel</button><button className={"ar-button " + (tone === "danger" ? "ar-danger-btn" : "ar-primary")} onClick={confirm} disabled={pending || !canConfirm}>{pending ? "Processing…" : "Confirm action"}</button></div></div></div>;
}
function DispatchScreen({ onNavigate }: { onNavigate: (id: string) => void }) {
  const { apiClient, hasRole } = useAuth();
  const canManage = isAllowed(["super_admin", "admin", "ops"].filter(x => hasRole(x as any)), ["super_admin", "admin", "ops"]);
  const [filter, setFilter] = useState("active"); const [search, setSearch] = useState(""); const [selected, setSelected] = useState<string | null>(null);
  const [action, setAction] = useState<"assign"|"release"|"retry"|null>(null);
  const [rider, setRider] = useState(""); const [reason, setReason] = useState(""); const [pending, setPending] = useState(false); const [message, setMessage] = useState("");
  const list = useResource<Row[]>("/admin/dispatch/deliveries?limit=100&search=" + encodeURIComponent(search), 5000);
  const fleet = useResource<Row[]>("/admin/riders?limit=50", 15000);
  const summary = useResource<Row>("/admin/operations/control-tower", 10000);
  const rows = asList(list.data);
  useEffect(() => { if (selected && !rows.some(r => r.id === selected)) setSelected(null); }, [list.data, selected]);
  const shown = rows.filter(r => filter === "all" || (filter === "unassigned" ? ["UNASSIGNED","OFFERED"].includes(r.status) : filter === "delayed" ? Boolean(r.dispatch_attention_required) : !["DELIVERED","CANCELLED","FAILED"].includes(r.status)));
  const focused = rows.find(r => r.id === selected) || shown[0];
  const detail = useResource<Row>(focused?.id ? "/admin/dispatch/deliveries/" + id(focused) : null);
  const eligible = useResource<Row[]>(action === "assign" && focused ? "/admin/dispatch/deliveries/" + id(focused) + "/eligible-riders" : null);
  const canAssign = focused && ["UNASSIGNED","OFFERED"].includes(focused.status) && (focused.dispatch_attention_required === true || Number(focused.dispatch_cycle_count || 0) >= 3);
  const canRetry = focused && ["UNASSIGNED","OFFERED"].includes(focused.status) && (focused.dispatch_attention_required === true || Number(focused.dispatch_cycle_count || 0) >= 2);
  const canRelease = focused && ["ASSIGNED","ARRIVED_PICKUP"].includes(focused.status);
  const run = async () => {
    if (!focused || !action || !canManage) return;
    setPending(true); setMessage("");
    try {
      const path = "/admin/dispatch/deliveries/" + id(focused) + "/" + (action === "assign" ? "assign" : action === "release" ? "unassign" : "trigger");
      const body = action === "assign" ? { rider_id: rider, note: reason } : action === "release" ? { reason_code: "ADMIN_REASSIGNMENT", note: reason, retrigger_dispatch: true } : undefined;
      await apiClient.request(path, { method: "POST", ...(body ? { body: JSON.stringify(body) } : {}) });
      setAction(null); setReason(""); setRider(""); setMessage("Dispatch action completed. Latest records are being refreshed."); await list.refresh(); await detail.refresh(); await summary.refresh();
    } catch(e) { setMessage(errorMessage(e)); } finally { setPending(false); }
  };
  return <div className="ar-screen">
    <div className="ar-page-header"><div><h1>Live Dispatch & Tracking</h1><p>Follow rider locations, assignments and deliveries as they update.</p></div><div className="ar-mini-metrics"><Metric icon={<Bike/>} label="Available riders" value={fmt(summary.data?.riders?.available)} /><Metric icon={<Package/>} label="Active deliveries" value={fmt(summary.data?.deliveries?.active)} tone="blue"/><Metric icon={<AlertTriangle/>} label="Delayed" value={fmt(summary.data?.deliveries?.delayed)} tone="red"/></div></div>
    {message && <Callout>{message}</Callout>}
    <Loading error={list.error} loading={list.loading} hasData={Boolean(list.data)} refresh={list.refresh}/>
    <div className="ar-dispatch-grid">
      <Panel title="Delivery Queue" className="ar-queue"><Tabs active={filter} set={setFilter} items={[{key:"active",text:"Active"},{key:"unassigned",text:"Unassigned"},{key:"delayed",text:"Attention"},{key:"all",text:"All"}]}/><div className="ar-search-row"><Search size={15}/><input placeholder="Search order or merchant" value={search} onChange={e => setSearch(e.target.value)}/></div><div className="ar-queue-list">{shown.length ? shown.map(r => <button key={r.id} className={"ar-queue-row" + (focused?.id === r.id ? " selected" : "")} onClick={() => setSelected(r.id)}><div><strong>{safe(r.order_number, String(r.id).slice(0,8))}</strong><Status value={r.status}/></div><span>{safe(r.branch_name)} · {safe(r.dropoff_address_text)}</span><small>{safe(r.assigned_rider_name, "No rider assigned")}</small></button>) : <Empty/>}</div></Panel>
      <Panel title="Live Operations Map" caption="Actual last-reported positions · no simulated routes" className="ar-map-panel"><GeoMap points={deliveryPoints(shown, r => setSelected(r.id))} height={530}/></Panel>
      <Panel title={focused ? safe(focused.order_number, "Delivery details") : "Delivery Details"} className="ar-dispatch-detail">
        {focused ? <><div className="ar-detail-status"><Status value={focused.status}/><small>Last location: {since(focused.last_location?.recordedAt ?? focused.last_location?.receivedAt)}</small></div><Loading error={detail.error} loading={detail.loading} hasData={Boolean(detail.data)} refresh={detail.refresh}/>
        <div className="ar-stat-list"><div><span>Merchant / pickup</span><strong>{safe(focused.branch_name)}</strong></div><div><span>Destination</span><strong>{safe(focused.dropoff_address_text)}</strong></div><div><span>Assigned rider</span><strong>{safe(focused.assigned_rider_name, "Unassigned")}</strong></div><div><span>Dispatch cycles</span><strong>{fmt(Number(focused.dispatch_cycle_count || 0))}</strong></div></div>
        <h3 className="ar-subheading">Delivery timeline</h3><div className="ar-timeline">{asList(detail.data?.timeline).length ? asList(detail.data?.timeline).map((event,i) => <div key={safe(event.id, String(i))}><span>●</span><div><strong>{normal(event.event_type ?? event.status)}</strong><small>{since(event.created_at ?? event.createdAt)}</small></div></div>) : <Callout>No recorded timeline events are available.</Callout>}</div>
        <div className="ar-actions">{canManage && canAssign && <button className="ar-button ar-primary" onClick={() => setAction("assign")}>Assign rider</button>}{canManage && canRetry && <button className="ar-button ar-outline" onClick={() => setAction("retry")}>Retry dispatch</button>}{canManage && canRelease && <button className="ar-button ar-outline" onClick={() => setAction("release")}>Release rider</button>}<button className="ar-button ar-outline" onClick={() => onNavigate("orders")}>View orders</button></div>
        </> : <Empty label="Choose a delivery to inspect"/>}
      </Panel>
    </div>
    <Panel title="Rider Availability" caption="Recent registered riders — assignment requires eligibility checks" action={<button className="ar-link" onClick={() => onNavigate("riders")}>Rider Management →</button>}><Loading error={fleet.error} refresh={fleet.refresh}/><div className="ar-table-scroll"><table className="ar-table"><thead><tr><th>Rider</th><th>Onboarding</th><th>Operational</th><th>Availability</th><th>Vehicle</th><th>Location freshness</th></tr></thead><tbody>{asList(fleet.data).slice(0,8).map(r => <tr key={r.id}><td>{safe(r.firstName) + " " + safe(r.lastName, "")}</td><td><Status value={r.onboardingStatus}/></td><td><Status value={r.operationalStatus}/></td><td><Status value={r.workStatus}/></td><td>{safe(r.vehicle?.vehicleType)}</td><td>{r.locationFreshness?.isStale ? "Stale or unavailable" : "Recently reported"}</td></tr>)}</tbody></table></div></Panel>
    {action && <Decision title={action === "assign" ? "Assign eligible rider" : action === "retry" ? "Retry dispatch matching" : "Release assigned rider"} confirm={run} close={() => setAction(null)} pending={pending} tone="primary" canConfirm={action === "retry" || (action === "assign" ? Boolean(rider) : Boolean(reason.trim()))}><p className="ar-modal-desc">This action changes live dispatch state and will be recorded by the server.</p>{action === "assign" && <label className="ar-field">Eligible riders<select required value={rider} onChange={e => setRider(e.target.value)}><option value="">Select a verified eligible rider</option>{asList(eligible.data).map(r => <option key={r.value} value={r.value}>{r.label}</option>)}</select><small>{eligible.error || "Only riders returned by the eligibility endpoint may be assigned."}</small></label>}{action !== "retry" && <label className="ar-field">Operational note<textarea required value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason and supporting context"/></label>}{action === "assign" && !rider && <Callout>Select a rider before confirming.</Callout>}</Decision>}
  </div>;
}

function OrdersScreen({ onNavigate, globalSearch }: { onNavigate: (id: string) => void; globalSearch: string }) {
  const { apiClient, hasRole } = useAuth();
  const canManage = ["super_admin","admin","ops"].some(role => hasRole(role as any));
  const [search, setSearch] = useState(""); const [tab, setTab] = useState("all"); const [selected, setSelected] = useState<string|null>(null); const [detailTab, setDetailTab] = useState("overview");
  const [cancel, setCancel] = useState(false); const [note, setNote] = useState(""); const [pending, setPending] = useState(false); const [actionError, setActionError] = useState("");
  useEffect(() => { setSearch(globalSearch); }, [globalSearch]);
  const endpoint = "/admin/orders?limit=50&search=" + encodeURIComponent(search) + (tab === "all" ? "" : "&status=" + encodeURIComponent(tab));
  const list = useResource<Row[]>(endpoint); const rows = asList(list.data);
  const active = rows.find(r => r.id === selected) || rows[0];
  const detail = useResource<Row>(active?.id ? "/admin/orders/" + id(active) : null);
  const record = detail.data || active;
  const canCancel = active && !["COMPLETED","CANCELLED","REJECTED"].includes(active.status);
  const cancelOrder = async () => {
    if (!active || !canManage || !note.trim()) return;
    setPending(true); setActionError("");
    try { await apiClient.request("/admin/orders/" + id(active) + "/cancel", { method: "POST", body: JSON.stringify({ reason_code: "ADMIN_INTERVENTION", note: note.trim() }) }); setCancel(false); setNote(""); await list.refresh(); await detail.refresh(); }
    catch (e) { setActionError(errorMessage(e)); } finally { setPending(false); }
  };
  const total = list.meta?.total;
  return <div className="ar-screen">
    <div className="ar-page-header"><div><h1>Orders & Deliveries</h1><p>Manage and investigate every order from placement to delivery.</p></div><div className="ar-mini-metrics"><Metric icon={<ShoppingCart/>} label="Matching orders" value={fmt(Number(total ?? rows.length))}/><Metric icon={<CheckCircle2/>} label="Completed (loaded)" value={fmt(rows.filter(r => r.status === "COMPLETED").length)}/><Metric icon={<AlertTriangle/>} label="Cancelled (loaded)" value={fmt(rows.filter(r => r.status === "CANCELLED").length)} tone="red"/></div></div>
    <Loading loading={list.loading} hasData={Boolean(list.data)} error={list.error} refresh={list.refresh}/>
    {actionError && <div className="ar-notice ar-error">{actionError}</div>}
    <div className="ar-orders-grid">
      <Panel title="Orders" className="ar-order-list"><Tabs active={tab} set={setTab} items={[{key:"all",text:"All"},{key:"PLACED",text:"Placed"},{key:"PREPARING",text:"Preparing"},{key:"COMPLETED",text:"Completed"},{key:"CANCELLED",text:"Cancelled"}]}/><div className="ar-search-row"><Search size={15}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search orders, customers, branches…"/></div><div className="ar-queue-list">{rows.length ? rows.map(r => <button key={r.id} onClick={() => { setSelected(r.id); setDetailTab("overview"); }} className={"ar-queue-row" + (active?.id === r.id ? " selected" : "")}><div><strong>{safe(r.order_number, String(r.id).slice(0, 8))}</strong><Status value={r.status}/></div><span>{safe(r.branch_name)} · {safe(r.customer_name)}</span><small>{money(r.total_minor)}</small></button>) : !list.loading && <Empty/>}</div><div className="ar-list-foot">Showing {rows.length} of {fmt(Number(total ?? rows.length))} matches · first 50 records</div></Panel>
      <Panel title={active ? safe(active.order_number, "Order Details") : "Order Details"} caption={active ? "Detailed order history and intervention controls" : "Select an order"} className="ar-order-detail">
        {active && <><div className="ar-detail-toolbar"><Status value={record.status}/><div className="ar-actions">{canManage && canCancel && <button className="ar-button ar-danger-btn" onClick={() => setCancel(true)}>Cancel order</button>}<button className="ar-button ar-outline" onClick={() => onNavigate("dispatch")}>Open dispatch <ArrowRight size={14}/></button></div></div><Tabs active={detailTab} set={setDetailTab} items={[{key:"overview",text:"Overview"},{key:"items",text:"Items"},{key:"timeline",text:"Timeline"},{key:"payment",text:"Payment"}]}/><Loading loading={detail.loading} hasData={Boolean(detail.data)} error={detail.error} refresh={detail.refresh}/>
          {detailTab === "overview" && <div className="ar-order-overview"><div><h3>Order information</h3><div className="ar-stat-list"><div><span>Order</span><strong>{safe(record.order_number)}</strong></div><div><span>Customer</span><strong>{safe(record.customer_name)}</strong></div><div><span>Merchant</span><strong>{safe(record.branch_name)}</strong></div><div><span>Placed</span><strong>{since(record.created_at ?? record.createdAt)}</strong></div><div><span>Order total</span><strong>{money(record.total_minor)}</strong></div></div><h3>Fulfilment stages</h3><div className="ar-stages">{["PLACED","ACCEPTED","PREPARING","READY","COMPLETED"].map(step => <span key={step} className={step === record.status ? "current" : ""}>{normal(step)}</span>)}</div></div><div><h3>Recorded order locations</h3><GeoMap height={360} points={deliveryPoints([record])}/><Callout>Routes and delivery ETAs are not inferred from coordinates.</Callout></div></div>}
          {detailTab === "items" && <div className="ar-facts">{asList(record.items).length ? asList(record.items).map((r, i) => <div key={safe(r.id, String(i))}><b>{safe(r.name ?? r.item_name)}</b><span>× {safe(r.quantity, "1")} · {money(r.total_minor ?? r.price_minor)}</span></div>) : <Empty label="Item details not included in this order response"/>}</div>}
          {detailTab === "timeline" && <div className="ar-timeline">{asList(record.timeline ?? record.events).length ? asList(record.timeline ?? record.events).map((r, i) => <div key={safe(r.id, String(i))}><span>●</span><div><strong>{normal(r.status ?? r.type)}</strong><small>{since(r.created_at)}</small></div></div>) : <Callout>The order endpoint has not supplied a full event history. Current authoritative status: {normal(record.status)}.</Callout>}</div>}
          {detailTab === "payment" && <div className="ar-stat-list"><div><span>Order total</span><strong>{money(record.total_minor)}</strong></div><div><span>Payment status</span><Status value={record.payment_status}/></div><div><span>Payment reference</span><strong>{safe(record.payment_reference)}</strong></div><button className="ar-button ar-outline" onClick={() => onNavigate("payments")}>Inspect payments →</button></div>}
        </>}
        {!active && <Empty label="No order selected"/>}
      </Panel>
    </div>
    {cancel && active && <Decision title="Cancel order" close={() => setCancel(false)} confirm={cancelOrder} pending={pending} canConfirm={note.trim().length >= 5}><p className="ar-modal-desc">Cancelling an order is a consequential action and will be audited by the backend.</p><label className="ar-field">Required audit note<textarea value={note} required minLength={5} onChange={e => setNote(e.target.value)} placeholder="Explain why this order must be cancelled"/></label>{!note.trim() && <Callout>A reason is required before confirmation.</Callout>}</Decision>}
  </div>;
}

function RidersScreen({ onNavigate, canProvision }: { onNavigate: (id: string) => void; canProvision: boolean }) {
  const { apiClient, hasRole } = useAuth();
  const canManage = ["super_admin","admin","ops"].some(role => hasRole(role as any));
  const [search, setSearch] = useState(""); const [tab, setTab] = useState("all"); const [chosen, setChosen] = useState<string|null>(null);
  const [action, setAction] = useState<"approve"|"reject"|"suspend"|"reactivate"|null>(null); const [note, setNote] = useState(""); const [pending, setPending] = useState(false); const [actionError, setActionError] = useState("");
  const filter = tab === "all" ? "" : tab === "pending" ? "&onboardingStatus=PENDING_REVIEW" : tab === "suspended" ? "&operationalStatus=SUSPENDED" : tab === "available" ? "&workStatus=ONLINE_AVAILABLE" : "";
  const fleet = useResource<Row[]>("/admin/riders?limit=50&search=" + encodeURIComponent(search) + filter, 15000);
  const summary = useResource<Row>("/admin/riders/availability/summary", 15000);
  const riders = asList(fleet.data); const selected = riders.find(r => r.id === chosen) || riders[0];
  const detail = useResource<Row>(selected?.id ? "/admin/riders/" + id(selected) : null);
  const profile = detail.data?.profile || selected || {};
  const vehicle = detail.data?.vehicle || selected?.vehicle || {};
  const places: Point[] = riders.flatMap(r => { const p = coord({latitude:r.lastKnownLatitude,longitude:r.lastKnownLongitude}); return p && !r.locationFreshness?.isStale ? [{key:r.id,title:safe(r.firstName) + " " + safe(r.lastName),kind:"rider" as const,latitude:p.lat,longitude:p.lng,onClick:() => setChosen(r.id)}] : []; });
  const mutate = async () => {
    if (!selected || !action || !canManage) return;
    setActionError(""); setPending(true);
    try { await apiClient.request("/admin/riders/" + id(selected) + "/" + action, { method: "POST", body: JSON.stringify({reason: note, note: note}) }); setAction(null); setNote(""); await fleet.refresh(); await summary.refresh(); await detail.refresh(); }
    catch(e) { setActionError(errorMessage(e)); } finally { setPending(false); }
  };
  return <div className="ar-screen">
    <div className="ar-page-header"><div><h1>Riders & Fleet</h1><p>Review onboarding, eligibility, availability and fleet activity.</p></div><div className="ar-header-actions"><CSV name="deetoo-riders-visible.csv" rows={riders} columns={["id","firstName","lastName","onboardingStatus","operationalStatus","workStatus"]}/><button className="ar-button ar-primary" disabled={!canProvision} title={canProvision ? "Open identity governance to provision a rider" : "Only Super Admins can provision rider accounts"} onClick={() => onNavigate("governance")}>Add Rider</button></div></div>
    <div className="ar-metrics ar-metrics-6"><Metric icon={<Users/>} label="Registered" value={fmt(summary.data?.totalRiders)}/><Metric icon={<CheckCircle2/>} label="Available now" value={fmt(summary.data?.onlineAvailable)}/><Metric icon={<Bike/>} label="Operationally active" value={fmt(summary.data?.activeOperational)} tone="blue"/><Metric icon={<UserRound/>} label="Shown in directory" value={fmt(riders.length)}/><Metric icon={<Clock3/>} label="Pending in list" value={fmt(riders.filter(r => r.onboardingStatus === "PENDING_REVIEW").length)} tone="amber"/><Metric icon={<AlertTriangle/>} label="Suspended in list" value={fmt(riders.filter(r => r.operationalStatus === "SUSPENDED").length)} tone="red"/></div>
    {actionError && <div className="ar-notice ar-error">{actionError}</div>}
    <Loading loading={fleet.loading} hasData={Boolean(fleet.data)} error={fleet.error} refresh={fleet.refresh}/>
    <Tabs active={tab} set={setTab} items={[{key:"all",text:"Riders overview"},{key:"pending",text:"Applications"},{key:"available",text:"Available"},{key:"suspended",text:"Suspended"}]}/>
    <div className="ar-riders-grid">
      <Panel title="Rider Directory" className="ar-rider-list"><div className="ar-search-row"><Search size={15}/><input placeholder="Search riders" value={search} onChange={e => setSearch(e.target.value)}/><button aria-label="Refresh riders" onClick={fleet.refresh}><RefreshCw size={15}/></button></div><div className="ar-table-scroll"><table className="ar-table"><thead><tr><th>Rider</th><th>Availability</th><th>Onboarding</th><th>Location</th></tr></thead><tbody>{riders.map(r => <tr key={r.id} className={selected?.id === r.id ? "ar-row-selected" : ""} onClick={() => setChosen(r.id)} tabIndex={0} onKeyDown={e => { if (e.key === "Enter") setChosen(r.id); }}><td><strong>{safe(r.firstName) + " " + safe(r.lastName, "")}</strong><small>{String(r.id).slice(0,8)}</small></td><td><Status value={r.workStatus}/></td><td><Status value={r.onboardingStatus}/></td><td>{r.locationFreshness?.isStale ? "Stale" : "Recently reported"}</td></tr>)}</tbody></table>{!riders.length && !fleet.loading && <Empty/>}</div></Panel>
      <Panel title="Riders Live on Map" caption="Recent positions only · stale location markers hidden" className="ar-rider-map"><GeoMap points={places} height={480}/></Panel>
      <Panel title={selected ? safe(selected.firstName) + " " + safe(selected.lastName, "") : "Rider profile"} className="ar-rider-detail">
        {selected ? <><Status value={profile.workStatus}/><Loading error={detail.error} refresh={detail.refresh} loading={detail.loading} hasData={Boolean(detail.data)}/><div className="ar-stat-list"><div><span>Onboarding</span><Status value={profile.onboardingStatus}/></div><div><span>Operational status</span><Status value={profile.operationalStatus}/></div><div><span>Vehicle</span><strong>{safe(vehicle.vehicleType)}</strong></div><div><span>Plate</span><strong>{safe(vehicle.registrationNumber)}</strong></div><div><span>Last location</span><strong>{since(profile.lastLocationAt)}</strong></div><div><span>Eligibility</span><strong>{detail.data?.eligibility?.eligible === true ? "Eligible" : detail.data?.eligibility?.eligible === false ? "Not eligible" : "Not checked"}</strong></div></div>{detail.data?.eligibility?.reasons?.length > 0 && <Callout>{detail.data.eligibility.reasons.join("; ")}</Callout>}<div className="ar-actions">{canManage && profile.onboardingStatus === "PENDING_REVIEW" && <><button className="ar-button ar-primary" onClick={() => setAction("approve")}>Approve</button><button className="ar-button ar-danger-btn" onClick={() => setAction("reject")}>Reject</button></>}{canManage && profile.operationalStatus === "ACTIVE" && <button className="ar-button ar-danger-btn" onClick={() => setAction("suspend")}>Suspend</button>}{canManage && profile.operationalStatus === "SUSPENDED" && <button className="ar-button ar-primary" onClick={() => setAction("reactivate")}>Reactivate</button>}</div></> : <Empty/>}
      </Panel>
    </div>
    <div className="ar-two"><Panel title="Fleet Status" caption="From the current rider directory"><BarChart label="Rider work state counts" rows={["ONLINE_AVAILABLE","BUSY","OFFLINE","ONLINE_UNAVAILABLE"].map(s => ({label:normal(s).slice(0,10), value:riders.filter(r => r.workStatus === s).length}))}/></Panel><Panel title="Onboarding & Safety" caption="Important administrative guardrails"><div className="ar-quick-list"><button onClick={() => onNavigate("incidents")}>Review fleet incidents <ArrowRight size={16}/></button><button onClick={() => onNavigate("dispatch")}>Monitor active dispatch <ArrowRight size={16}/></button></div><Callout>Rider approval, suspension and reactivation use existing audited backend endpoints. Fleet analytics require verified operational records.</Callout></Panel></div>
    {action && <Decision title={action.charAt(0).toUpperCase() + action.slice(1) + " rider"} close={() => setAction(null)} confirm={mutate} pending={pending} tone={action === "approve" || action === "reactivate" ? "primary" : "danger"} canConfirm={["approve", "reactivate"].includes(action) || note.trim().length >= 3}><p className="ar-modal-desc">This operation changes rider eligibility and is recorded by the server.</p><label className="ar-field">Reason / review note<textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Enter a clear reason for this action"/></label></Decision>}
  </div>;
}
