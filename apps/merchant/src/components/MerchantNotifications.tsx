import React, { useMemo, useState } from "react";
import { Bell, Check, CircleDollarSign, Clock3, CreditCard, Filter, LifeBuoy, Search, Store, Utensils, WalletCards } from "lucide-react";
import { Button, EmptyState, InlineBanner } from "../../../../packages/ui/src/index";
import { PageHeading, ResourceState, errorMessage, useResource } from "../../../../packages/ui/src/workflows";
import { useAuth } from "../../../../packages/auth/src/react";

type Notice = { id: string; subject?: string; template_code?: string; created_at?: string; read_at?: string | null; payload?: Record<string, any>; };
const categories = ["All notifications","Orders","Payments","Payouts & settlements","Menu & availability","Business updates","System notifications","Support messages"] as const;
function classify(item: Notice) {
  const text = [item.subject,item.template_code,item.payload?.message,item.payload?.description].filter(Boolean).join(" ").toLowerCase();
  if (/support|case|dispute|ticket|reply/.test(text)) return "Support messages";
  if (/payout|settlement/.test(text)) return "Payouts & settlements";
  if (/payment|card|mpesa|m-pesa/.test(text)) return "Payments";
  if (/menu|stock|availability|sold out|item/.test(text)) return "Menu & availability";
  if (/business|branch|team|invitation|verification/.test(text)) return "Business updates";
  if (/order|pickup|rider|delivery/.test(text)) return "Orders";
  return "System notifications";
}
function messageOf(item: Notice) {
  return item.payload?.message || item.payload?.description || item.template_code || "DeeToo notification";
}
export function MerchantNotifications({ onNavigate }: {onNavigate: (tab:string) => void}) {
  const {apiClient} = useAuth();
  const resource = useResource<{ notifications: Notice[] }>("/support/notifications", 20000);
  const notices = resource.data?.notifications || [];
  const [category,setCategory] = useState<string>("All notifications");
  const [status,setStatus] = useState<"all"|"unread"|"read">("all");
  const [period,setPeriod] = useState<"all"|"today"|"week">("all");
  const [query,setQuery] = useState("");
  const [selected,setSelected] = useState<string | null>(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState<string | null>(null);
  const rows = useMemo(() => notices.filter(item => {
    if (category !== "All notifications" && classify(item) !== category) return false;
    if (status === "unread" && item.read_at) return false;
    if (status === "read" && !item.read_at) return false;
    if (query && ![item.subject || "",messageOf(item)].some(text => text.toLowerCase().includes(query.toLowerCase()))) return false;
    if (period !== "all") {
      const date = new Date(item.created_at || 0).getTime();
      if (!date || date < Date.now() - (period === "today" ? 86400000 : 7*86400000)) return false;
    }
    return true;
  }).sort((a,b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()),[notices,category,status,query,period]);
  const active = rows.find(item=>item.id===selected) || rows[0];
  const unread = notices.filter(item=>!item.read_at);
  async function markRead(ids:string[]) {
    setBusy(true);setError(null);
    try {
      for(const id of ids) await apiClient.request(`/support/notifications/${encodeURIComponent(id)}/read`,{method:"POST"});
      await resource.refresh();
    }catch(cause){setError(errorMessage(cause));}
    finally{setBusy(false);}
  }
  return (
    <>
      <PageHeading eyebrow="Account" title="Notifications" subtitle="Stay updated with orders, payments, support messages and important updates."
        action={<div className="flex flex-wrap gap-2"><Button variant="outline" disabled={!unread.length || busy} onClick={()=>void markRead(unread.map(item=>item.id))}><Check size={16}/> Mark all as read</Button>
          <Button variant="outline" onClick={()=>void resource.refresh()}>Refresh</Button></div>}/>
      {error && <InlineBanner kind="danger">{error}</InlineBanner>}
      <ResourceState resource={resource}>
        <div className="merchant-v2-notify-grid">
          <section>
            <h2>Filters</h2>
            {categories.map(name=><button type="button" key={name} className="merchant-v2-notify-filter" aria-pressed={category===name} onClick={()=>setCategory(name)}><span>{name}</span><b>{name==="All notifications" ? notices.length : notices.filter(item=>classify(item)===name).length}</b></button>)}
            <h2 className="mt-8">Status</h2>
            {(["all","unread","read"] as const).map(name=><button type="button" key={name} className="merchant-v2-notify-filter" aria-pressed={status===name} onClick={()=>setStatus(name)}><span>{name==="all"?"All":name==="unread"?"Unread":"Read"}</span><b>{name==="all"?notices.length:name==="unread"?unread.length:notices.length-unread.length}</b></button>)}
            <h2 className="mt-8">Time</h2>
            {(["all","today","week"] as const).map(name=><button type="button" key={name} className="merchant-v2-notify-filter" aria-pressed={period===name} onClick={()=>setPeriod(name)}><span>{name==="all"?"All time":name==="today"?"Last 24 hours":"Last 7 days"}</span></button>)}
          </section>
          <section>
            <div className="merchant-v2-card-heading"><h2>Notifications ({rows.length})</h2></div>
            <label className="merchant-v2-notify-search"><Search size={17}/><input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search notifications..." aria-label="Search notifications"/></label>
            {rows.length?rows.map(item=><button key={item.id} type="button" className={`merchant-v2-notify-row ${active?.id===item.id?"is-selected":""}`} onClick={()=>setSelected(item.id)}>
              <span className="merchant-v2-notification-icon">{classify(item)==="Orders"?<Utensils size={19}/>:classify(item)==="Payments"?<CreditCard size={19}/>:classify(item)==="Payouts & settlements"?<WalletCards size={19}/>:classify(item)==="Support messages"?<LifeBuoy size={19}/>:<Bell size={19}/>}</span>
              <span className="min-w-0 flex-1"><strong>{item.subject||"DeeToo update"}</strong><small className="truncate">{messageOf(item)}</small></span>
              <small className="merchant-v2-notice-time">{item.created_at ? new Date(item.created_at).toLocaleDateString(): ""}</small>
              {!item.read_at&&<i aria-label="Unread"/>}
            </button>):<EmptyState title="No notifications" description="Try changing the filters or check back later."/>}
          </section>
          <section className="merchant-v2-notify-detail">
            {active ? <>
              <div className="flex items-center justify-between"><span className="merchant-v2-notification-icon"><Bell size={23}/></span><span className="merchant-v2-state">{active.read_at?"Read":"Unread"}</span></div>
              <h3>{active.subject || "DeeToo update"}</h3>
              <p>{active.created_at ? new Date(active.created_at).toLocaleString() : "Date unavailable"}</p>
              <div className="merchant-v2-notice-message">{messageOf(active)}</div>
              <h2 className="mt-6">Notification details</h2>
              <div className="merchant-v2-notify-detail-row"><span>Category</span><strong>{classify(active)}</strong></div>
              {active.payload?.order_id && <div className="merchant-v2-notify-detail-row"><span>Order ID</span><strong>{String(active.payload.order_id)}</strong></div>}
              {active.payload?.case_id && <div className="merchant-v2-notify-detail-row"><span>Case ID</span><strong>{String(active.payload.case_id)}</strong></div>}
              <div className="flex flex-wrap gap-2 mt-6">
                {!active.read_at && <Button disabled={busy} onClick={()=>void markRead([active.id])}><Check size={16}/> Mark as read</Button>}
                {active.payload?.order_id && <Button variant="outline" onClick={()=>onNavigate("orders")}>View kitchen orders</Button>}
                {active.payload?.case_id && <Button variant="outline" onClick={()=>onNavigate("support")}>Open support center</Button>}
              </div>
            </>:<EmptyState title="Select a notification" description="Details appear here when a notification is selected."/>}
          </section>
        </div>
      </ResourceState>
    </>
  );
}
