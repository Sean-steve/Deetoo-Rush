import React, { useMemo, useState } from "react";
import { useAuth } from "../../../../packages/auth/src/react";
import { Button, Card, EmptyState, ErrorState } from "../../../../packages/ui/src/index";
import { useResource } from "../../../../packages/ui/src/workflows";
import { Bell, Check, CreditCard, Gift, Package, ShieldCheck, LifeBuoy, RefreshCw } from "lucide-react";

type NotificationRecord = {
  id: string;
  subject?: string;
  template_code?: string;
  created_at?: string;
  read_at?: string | null;
  payload?: { message?: string; description?: string; order_id?: string };
};
type Kind = "all" | "orders" | "payments" | "offers" | "security" | "support" | "system";
const kinds: { id: Kind; label: string }[] = [
  { id: "all", label: "All updates" },
  { id: "orders", label: "Orders" },
  { id: "payments", label: "Payments" },
  { id: "offers", label: "Offers" },
  { id: "security", label: "Security" },
  { id: "support", label: "Support" },
  { id: "system", label: "System" },
];
function kindOf(n: NotificationRecord): Kind {
  const value = `${n.template_code || ""} ${n.subject || ""}`.toLowerCase();
  if (/pay|card|mpesa|refund|settle|transaction/.test(value)) return "payments";
  if (/promot|voucher|discount|campaign|offer|reward|loyal/.test(value)) return "offers";
  if (/device|login|password|auth|mfa|security|session/.test(value)) return "security";
  if (/case|support|dispute|resolution|incident/.test(value)) return "support";
  if (/order|rider|courier|deliver|kitchen|prepar|pickup|merchant/.test(value)) return "orders";
  return "system";
}
const icons = {
  all: Bell, orders: Package, payments: CreditCard, offers: Gift, security: ShieldCheck, support: LifeBuoy, system: Bell,
};
export function CustomerNotificationCenter({ onOpenOrders }: { onOpenOrders: () => void }) {
  const { apiClient } = useAuth();
  const resource = useResource<{ notifications: NotificationRecord[] }>("/support/notifications");
  const [kind, setKind] = useState<Kind>("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [marking, setMarking] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const records = useMemo(() => (resource.data?.notifications || [])
    .slice().sort((a,b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()), [resource.data]);
  const filtered = records.filter(n => (kind === "all" || kindOf(n) === kind) && (!unreadOnly || !n.read_at));
  const unread = records.filter(n => !n.read_at).length;
  async function markRead(id: string) {
    setMarking(id); setActionError(null);
    try {
      await apiClient.request(`/support/notifications/${encodeURIComponent(id)}/read`, { method:"POST" });
      await resource.refresh();
    } catch(e) {
      setActionError(e instanceof Error ? e.message : "Could not mark this update as read.");
    } finally { setMarking(null); }
  }
  return <section className="customer-notification-center">
    <header className="customer-section-intro customer-notification-head">
      <div><h1>Notifications Center</h1><p>Stay updated with your orders, payments and important account events.</p></div>
      <Button variant="outline" isLoading={resource.loading} onClick={() => void resource.refresh()}><RefreshCw size={16} className="mr-2"/> Refresh</Button>
    </header>
    <div className="customer-notification-tabs" aria-label="Notification categories">
      {kinds.map(tab => <button type="button" key={tab.id} aria-pressed={kind === tab.id} onClick={() => setKind(tab.id)}>{tab.label}<span>{tab.id === "all" ? records.length : records.filter(n => kindOf(n) === tab.id).length}</span></button>)}
    </div>
    <div className="customer-notification-layout">
      <div className="customer-notification-feed">
        <div className="customer-notification-feed-heading">
          <strong>{kind === "all" ? "Your updates" : kinds.find(tab => tab.id === kind)?.label}</strong>
          <label><input type="checkbox" checked={unreadOnly} onChange={e => setUnreadOnly(e.target.checked)} /> Unread only</label>
        </div>
        {resource.error && <ErrorState message={String(resource.error)} />}
        {actionError && <p role="alert" className="text-rose-700">{actionError}</p>}
        {resource.loading && !resource.data && <p role="status">Loading updates…</p>}
        {!resource.loading && !resource.error && filtered.length === 0 && <EmptyState title="You’re all caught up" description="Updates matching these filters will appear here." />}
        {filtered.map(n => {
          const type = kindOf(n), Icon = icons[type], message = n.payload?.message || n.payload?.description || n.template_code || "DeeToo update";
          return <Card key={n.id} className={`customer-notification-item ${!n.read_at ? "customer-notification-unread" : ""}`}>
            <div className={`customer-notification-icon customer-notification-${type}`}><Icon size={20} /></div>
            <div className="customer-notification-copy">
              <div className="customer-notification-title"><strong>{n.subject || "DeeToo update"}</strong>{!n.read_at && <span>New</span>}</div>
              <p>{message}</p>
              <time dateTime={n.created_at}>{n.created_at ? new Date(n.created_at).toLocaleString() : ""}</time>
            </div>
            <div className="customer-notification-actions">
              {type === "orders" && <Button variant="ghost" size="sm" onClick={onOpenOrders}>View orders</Button>}
              {!n.read_at && <Button variant="outline" size="sm" disabled={marking === n.id} onClick={() => void markRead(n.id)}><Check size={14} className="mr-1"/> Mark read</Button>}
            </div>
          </Card>;
        })}
      </div>
      <aside className="customer-notification-info">
        <div className="customer-notification-info-icon"><Bell size={26} /></div>
        <h2>Never miss an update</h2>
        <p><strong>{unread}</strong> unread {unread === 1 ? "notification" : "notifications"}. Your in-app updates are stored here until you read them.</p>
        <p>Push, SMS and email preferences are not yet configurable from this screen. We’ll only show those controls when settings are connected to the backend.</p>
      </aside>
    </div>
  </section>;
}
