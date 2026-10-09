import React, { useState } from "react";
import { AlertTriangle, Clock3, Laptop, LogOut, Monitor, RefreshCw, ShieldCheck, Smartphone, LockKeyhole } from "lucide-react";
import { Button, Card, InlineBanner } from "../../../../packages/ui/src/index";
import { PageHeading, errorMessage } from "../../../../packages/ui/src/workflows";
import { useAuth } from "../../../../packages/auth/src/react";

type Session = { id: string; current?: boolean; device_info?: string | null; ip_address?: string | null; created_at?: string | null; last_seen_at?: string | null; };
export function MerchantSecurity({ sessions, loading, onRefresh }: { sessions: Session[]; loading: boolean; onRefresh: () => Promise<void> | void; }) {
  const { apiClient } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const browserName = (s?: string | null) => {
    const value = s || "";
    const device = /Android|iPhone|Mobile/i.test(value) ? "Mobile" : /Windows|Macintosh|Linux|Desktop/i.test(value) ? "Desktop" : "Device";
    const browser = /Edg\//i.test(value) ? "Edge" : /Firefox\//i.test(value) ? "Firefox" : /Chrome\//i.test(value) ? "Chrome" : /Safari\//i.test(value) ? "Safari" : "Browser";
    return `${device} · ${browser}`;
  };
  const revoke = async (id: string) => {
    if (!window.confirm("Sign out this device? Its session will be revoked.")) return;
    setBusy(id);setError(null);setMessage(null);
    try { await apiClient.revokeSession(id);await onRefresh();setMessage("Device session revoked."); }
    catch(e) {setError(errorMessage(e));}
    finally {setBusy(null);}
  };
  const revokeAll = async () => {
    if (!window.confirm("Sign out every session, including this device? You may need to sign in again.")) return;
    setBusy("all");setError(null);setMessage(null);
    try {await apiClient.revokeAllSessions();await onRefresh();setMessage("All sessions revoked. Sign in again if prompted.");}
    catch(e) {setError(errorMessage(e));}
    finally {setBusy(null);}
  };
  return (
    <>
      <PageHeading eyebrow="Account" title="Security & sessions" subtitle="Keep your account secure and manage where it is being accessed." action={<Button variant="outline" onClick={() => void onRefresh()} disabled={loading}><RefreshCw size={15}/> Refresh sessions</Button>}/>
      {error && <InlineBanner kind="danger">{error}</InlineBanner>}
      {message && <InlineBanner kind="success">{message}</InlineBanner>}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
        <Card><div className="merchant-v2-security-stat"><ShieldCheck/><div><small>Active sessions</small><strong>{loading ? "…" : sessions.length}</strong><span>Devices signed in</span></div></div></Card>
        <Card><div className="merchant-v2-security-stat"><Monitor/><div><small>Current device</small><strong>{browserName(sessions.find(s => s.current)?.device_info)}</strong><span>Active browser session</span></div></div></Card>
        <Card><div className="merchant-v2-security-stat"><Clock3/><div><small>Most recent activity</small><strong>{sessions.length ? "Available" : "—"}</strong><span>See session list</span></div></div></Card>
        <Card><div className="merchant-v2-security-stat"><LockKeyhole/><div><small>Security actions</small><strong>Session control</strong><span>Revoke unauthorized access</span></div></div></Card>
      </div>
      <div className="merchant-v2-session-grid">
        <Card>
          <div className="merchant-v2-card-heading">
            <div><h2>Active sessions</h2><p>Devices currently signed in to your account.</p></div>
          </div>
          {sessions.length ? sessions.map(session => <div key={session.id} className="merchant-v2-session-row">
            {/Android|iPhone|Mobile/i.test(session.device_info || "") ? <Smartphone size={24}/> : <Laptop size={24}/>}
            <div className="flex-1 min-w-0"><strong>{browserName(session.device_info)}</strong>
              {session.current && <span className="is-current ml-2">Current session</span>}
              <small>{session.ip_address ? `IP: ${session.ip_address}` : "IP not available"} · {session.last_seen_at || session.created_at ? new Date(session.last_seen_at || session.created_at!).toLocaleString() : "Activity time unavailable"}</small>
            </div>
            {!session.current && <Button size="sm" variant="outline" isLoading={busy === session.id} onClick={() => void revoke(session.id)}>Sign out</Button>}
          </div>) : <p className="text-sm text-slate-500 py-6">No active sessions returned. Refresh to try again.</p>}
        </Card>
        <Card>
          <div className="merchant-v2-card-heading"><div><h2>Login history</h2><p>Security activity and failed sign-in attempts.</p></div></div>
          <div className="merchant-v2-unavailable">
            <Clock3 size={30}/><strong>Login history not connected</strong>
            <p>The session endpoint lists active sessions only. A login audit endpoint is required to show successful and failed login events.</p>
          </div>
        </Card>
        <Card>
          <div className="merchant-v2-card-heading"><div><h2>Security settings</h2><p>Account protection and trusted devices.</p></div></div>
          <div className="merchant-v2-setting-list">
            <div><LockKeyhole/><span><strong>Password & authentication</strong><small>Use the existing DeeToo sign-in flow to manage your account.</small></span></div>
            <div><ShieldCheck/><span><strong>Two-factor authentication</strong><small>Configuration requires an authentication backend workflow.</small></span></div>
            <div><Laptop/><span><strong>Trusted devices</strong><small>Trust and untrust controls are not yet supported by the API.</small></span></div>
          </div>
        </Card>
        <Card>
          <div className="merchant-v2-card-heading"><div><h2 className="text-rose-600">Danger zone</h2><p>High-impact security actions.</p></div></div>
          <div className="merchant-v2-danger-action">
            <AlertTriangle size={22}/>
            <div><strong>Sign out of all devices</strong><small>Invalidate all sessions and active tokens, including this one.</small></div>
            <Button variant="danger" isLoading={busy === "all"} onClick={() => void revokeAll()}><LogOut size={15}/> Sign out all</Button>
          </div>
          <p className="text-xs text-slate-500 mt-6">Account deactivation is not available from this interface. Contact support for account closure or suspension.</p>
        </Card>
      </div>
    </>
  );
}
