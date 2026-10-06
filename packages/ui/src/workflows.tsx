import React, { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../auth/src/react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  DeetooLogo,
  Price,
  Skeleton,
} from "./index";

export const errorMessage = (error: any) =>
  error?.error?.message ||
  error?.message ||
  "Unable to complete this request. Please retry.";

/** Authenticated authoritative refresh. Never replace failed requests with fabricated records. */
export function useResource<T>(
  path: string | null,
  interval = 0,
  channel?: string,
) {
  const { apiClient, user } = useAuth();
  const [data, setData] = useState<T | null>(null);
  const [meta, setMeta] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const generation = useRef(0);
  const serial = useRef(0);
  const refresh = useCallback(async () => {
    if (!path) return;
    const current = generation.current;
    const request = ++serial.current;
    setLoading(true);
    try {
      const result = await apiClient.request<T>(path);
      if (current !== generation.current || request !== serial.current) return;
      setData(result.data);
      setMeta(result.meta ? { ...result.meta } : null);
      setError(null);
      setUpdatedAt(new Date());
    } catch (e) {
      if (current === generation.current && request === serial.current)
        setError(errorMessage(e));
    } finally {
      if (current === generation.current && request === serial.current)
        setLoading(false);
    }
  }, [apiClient, path, user?.id]);
  useEffect(() => {
    generation.current++;
    setData(null);
    setMeta(null);
    setError(null);
    setUpdatedAt(null);
    setLoading(Boolean(path));
    void refresh();
    const controller = new AbortController();
    let connected = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let lastRefresh = Date.now();
    const connect = async () => {
      if (!channel || !path || controller.signal.aborted) return;
      try {
        await apiClient.subscribeRealtime(
          [channel],
          controller.signal,
          () => {
            lastRefresh = Date.now();
            void refresh();
          },
          () => {
            connected = true;
            void refresh();
          },
        );
      } catch {
        /* REST polling remains available while reconnecting. */
      } finally {
        connected = false;
        if (!controller.signal.aborted) retry = setTimeout(connect, 5000);
      }
    };
    void connect();
    const timer = interval
      ? window.setInterval(() => {
          if (
            document.visibilityState === "visible" &&
            (!connected || Date.now() - lastRefresh >= 60000)
          ) {
            lastRefresh = Date.now();
            void refresh();
          }
        }, interval)
      : null;
    const resume = () => void refresh();
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      generation.current++;
      controller.abort();
      if (retry) clearTimeout(retry);
      if (timer) clearInterval(timer);
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [refresh, interval, channel, apiClient]);
  return { data, meta, loading, error, refresh, updatedAt };
}

export function ResourceState({
  resource,
  children,
}: {
  resource: ReturnType<typeof useResource<any>>;
  children: React.ReactNode;
}) {
  if (!resource.data && resource.loading) return <Skeleton className="h-36" />;
  return (
    <>
      {resource.error && (
        <ErrorState
          title={
            resource.data
              ? "Updates interrupted — showing previous data"
              : "Unable to load"
          }
          message={resource.error}
          onRetry={resource.refresh}
        />
      )}
      {children}
    </>
  );
}
export function StatusBadge({ status }: { status?: string | null }) {
  const value = status || "UNKNOWN";
  const variant = /FAIL|REJECT|CANCEL|SUSPEND|EXPIRE/.test(value)
    ? "danger"
    : /PAID|SUCCESS|DELIVERED|COMPLETED|READY|OPEN|ONLINE|APPROVED/.test(value)
      ? "success"
      : /PENDING|PREPAR|PLACED|OFFER|BUSY/.test(value)
        ? "warning"
        : "default";
  return (
    <Badge variant={variant}>{value.toLowerCase().replaceAll("_", " ")}</Badge>
  );
}
export function PageHeading({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-heading deetoo-page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500 max-w-3xl">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
export function NotificationInbox() {
  const { apiClient } = useAuth();
  const resource = useResource<any>("/support/notifications");
  const notifications: any[] = resource.data?.notifications || [];

  async function markRead(id: string) {
    await apiClient.request(`/support/notifications/${encodeURIComponent(id)}/read`, {
      method: "POST",
    });
    await resource.refresh();
  }

  return (
    <div className="space-y-4">
      <PageHeading
        title="Notifications"
        subtitle="Persistent updates stay here until you have seen them. Urgent background events may also arrive by push."
        action={
          <Button variant="outline" onClick={resource.refresh} isLoading={resource.loading}>
            Refresh
          </Button>
        }
      />
      <ResourceState resource={resource}>
        {notifications.length ? (
          <div className="space-y-3">
            {notifications.map((notification) => (
              <Card
                key={notification.id}
                className={notification.read_at ? "opacity-70" : "border-emerald-200"}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold text-slate-900">
                        {notification.subject || "DeeToo update"}
                      </h3>
                      {!notification.read_at && <Badge variant="success">New</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      {notification.payload?.message ||
                        notification.payload?.description ||
                        notification.template_code}
                    </p>
                    <p className="mt-2 text-xs text-slate-400">
                      {notification.created_at
                        ? new Date(notification.created_at).toLocaleString()
                        : ""}
                    </p>
                  </div>
                  {!notification.read_at && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void markRead(notification.id)}
                    >
                      Mark read
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No notifications"
            description="Persistent order, payment, payout and support updates will appear here."
          />
        )}
      </ResourceState>
    </div>
  );
}

export function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: React.ReactNode;
  detail?: string;
}) {
  return (
    <Card className="dashboard-metric-card">
      <p className="eyebrow">{label}</p>
      <div className="metric-value">{value}</div>
      {detail && <p className="dashboard-metric-detail text-sm text-slate-500">{detail}</p>}
    </Card>
  );
}
export function Timeline({
  entries,
}: {
  entries: Array<{
    id?: string;
    to_status?: string;
    status?: string;
    event_type?: string;
    created_at?: string;
    note?: string | null;
  }>;
}) {
  return entries.length ? (
    <ol className="deetoo-timeline">
      {entries.map((entry, i) => (
        <li key={entry.id || i}>
          <StatusBadge
            status={entry.to_status || entry.status || entry.event_type}
          />
          {entry.created_at && (
            <time className="block text-xs mt-2">
              {new Date(entry.created_at).toLocaleString()}
            </time>
          )}
          {entry.note && <p className="text-sm">{entry.note}</p>}
        </li>
      ))}
    </ol>
  ) : (
    <p className="text-sm">No timeline events yet.</p>
  );
}
export function PriceBreakdown({ rows }: { rows: Array<[string, number]> }) {
  return (
    <dl className="price-breakdown">
      {rows.map(([label, minor]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>
            <Price minor={minor} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
export function Navigation({
  items,
  active,
  onChange,
  mobile = false,
}: {
  items: Array<{ id: string; label: string; icon?: React.ReactNode; group?: string }>;
  active: string;
  onChange: (id: string) => void;
  mobile?: boolean;
}) {
  return (
    <nav
      aria-label="Application navigation"
      className={mobile ? "bottom-navigation deetoo-navigation" : "app-navigation deetoo-navigation"}
    >
      {items.map((item,index) => (
        <React.Fragment key={item.id}>
          {!mobile&&item.group&&item.group!==items[index-1]?.group&&<span className="app-nav-group">{item.group}</span>}
          <button
            type="button"
            aria-current={active === item.id ? "page" : undefined}
            onClick={() => onChange(item.id)}
          >
            {item.icon}
            {item.label}
          </button>
        </React.Fragment>
      ))}
    </nav>
  );
}
export function OnlineNotice() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online ? null : (
    <div role="status" className="offline-notice">
      You are offline. Reconnect to refresh data and submit changes.
    </div>
  );
}

export function OperationsLayout({
  title,
  userName,
  navigation,
  children,
  onLogout,
}: {
  title: string;
  userName?: string;
  navigation: React.ReactNode;
  children: React.ReactNode;
  onLogout: () => void;
}) {
  const initials=(userName||"DeeToo").split(/[\s@._-]+/).filter(Boolean).slice(0,2).map(part=>part[0]?.toUpperCase()).join("");
  return (
    <div className="operations-layout dashboard-workspace">
      <aside className="operations-sidebar">
        <div className="ops-brand">
          <DeetooLogo className="h-10 w-auto" />
          <div>
            <p>Workspace</p>
            <strong>{title}</strong>
          </div>
        </div>
        <div className="ops-nav-scroll">{navigation}</div>
        <div className="ops-sidebar-foot">
          <div className="ops-avatar">{initials}</div>
          <div className="min-w-0">
            <strong>{userName||"Signed in"}</strong>
            <span>Secure DeeToo workspace</span>
          </div>
        </div>
      </aside>
      <div className="operations-content">
        <header className="operations-header">
          <div>
            <span className="ops-header-kicker">DeeToo workspace</span>
            <h1>{title}</h1>
          </div>
          <div className="operations-header-actions">
            <span className="ops-live-dot"><i/>Live</span>
            <Button variant="outline" onClick={onLogout}>Sign out</Button>
          </div>
        </header>
        <main className="operations-main dashboard-content">{children}</main>
      </div>
    </div>
  );
}
