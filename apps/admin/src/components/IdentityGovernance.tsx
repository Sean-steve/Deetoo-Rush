import React, { useEffect, useMemo, useState } from "react";
import { UserRole, UserStatus } from "@deetoo/types";
import { useAuth } from "../../../../packages/auth/src/react";
import {
  Badge,
  Button,
  Card,
  ErrorState,
  FormField,
  Input,
  Modal,
  Select,
} from "../../../../packages/ui/src/index";
import {
  errorMessage,
  PageHeading,
  ResourceState,
  useResource,
} from "../../../../packages/ui/src/workflows";

const ROLE_OPTIONS = [
  UserRole.CUSTOMER,
  UserRole.MERCHANT,
  UserRole.MERCHANT_OWNER,
  UserRole.MERCHANT_MANAGER,
  UserRole.MERCHANT_STAFF,
  UserRole.RIDER,
  UserRole.SUPPORT,
  UserRole.OPS,
  UserRole.FINANCE,
  UserRole.ADMIN,
  UserRole.SUPER_ADMIN,
];

export function IdentityGovernance() {
  const { apiClient } = useAuth();
  const users = useResource<any>("/admin/users?limit=100");
  const events = useResource<any>("/admin/governance/events?limit=50");
  const [selected, setSelected] = useState<any | null>(null);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [roles, setRoles] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [provisionOpen, setProvisionOpen] = useState(false);
  const [provision, setProvision] = useState({
    subject_type: "CUSTOMER",
    name: "",
    email: "",
    phone_e164: "",
    staff_role: "",
    vehicle_type: "MOTORBIKE",
    merchant_legal_name: "",
    merchant_display_name: "",
    reason: "",
  });

  const list = useMemo(
    () => (Array.isArray(users.data) ? users.data : users.data?.users || []),
    [users.data],
  );

  useEffect(() => {
    if (!selected) return;
    setEmail(selected.email || "");
    setPhone(selected.phone_e164 || "");
    setDisplayName(selected.name || "");
    setRoles(selected.roles || []);
    setReason("");
  }, [selected]);

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await work();
      await Promise.all([users.refresh(), events.refresh()]);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeading
        title="Identity governance"
        subtitle="Super Admin controls for provisioning, sensitive identity changes, role authority, and non-destructive deactivation."
        action={
          <Button onClick={() => setProvisionOpen(true)}>
            Provision account
          </Button>
        }
      />
      {error && <ErrorState message={error} />}

      <div className="grid xl:grid-cols-[minmax(0,1fr)_420px] gap-5">
        <Card>
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="font-bold">People & access</h2>
              <p className="text-xs text-slate-500 mt-1">
                Deactivation preserves orders, disputes, payouts and ledger history.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={users.refresh}>
              Refresh
            </Button>
          </div>
          <ResourceState resource={users}>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Identity</th>
                    <th>Roles</th>
                    <th>Status</th>
                    <th>Govern</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((item: any) => (
                    <tr key={item.id}>
                      <td>
                        <p className="font-semibold">{item.name || item.email || "Unnamed"}</p>
                        <p className="text-xs text-slate-500">{item.email || item.phone_e164 || item.id}</p>
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {(item.roles || []).map((role: string) => (
                            <Badge key={role}>{role}</Badge>
                          ))}
                        </div>
                      </td>
                      <td><Badge>{item.status}</Badge></td>
                      <td>
                        <Button variant="outline" size="sm" onClick={() => setSelected(item)}>
                          Review / edit
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ResourceState>
        </Card>

        <Card className="h-fit">
          <h2 className="font-bold">Recent governance events</h2>
          <p className="text-xs text-slate-500 mt-1 mb-4">
            Every sensitive mutation records actor, reason and before/after values.
          </p>
          <ResourceState resource={events}>
            <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-1">
              {(events.data?.events || []).map((event: any) => (
                <div key={event.id} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex justify-between gap-3">
                    <span className="font-semibold text-sm">{event.action}</span>
                    <Badge>{event.subject_type}</Badge>
                  </div>
                  <p className="text-xs text-slate-600 mt-2">{event.reason}</p>
                  <p className="text-[11px] text-slate-400 mt-2">
                    {event.actor_role} · {new Date(event.created_at).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          </ResourceState>
        </Card>
      </div>

      <Modal
        isOpen={Boolean(selected)}
        onClose={() => !busy && setSelected(null)}
        title="Govern identity"
        size="lg"
      >
        {selected && (
          <div className="space-y-4">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              High-authority change. A reason is mandatory and active sessions are revoked after identity/role changes.
            </div>
            <FormField label="Email">
              <Input value={email} onChange={(e) => setEmail(e.target.value)} />
            </FormField>
            <FormField label="Phone">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </FormField>
            <FormField label="Customer display name (when applicable)">
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </FormField>
            <FormField label="Roles">
              <div className="grid sm:grid-cols-2 gap-2 rounded-xl border border-slate-200 p-3">
                {ROLE_OPTIONS.map((role) => (
                  <label key={role} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={roles.includes(role)}
                      onChange={(e) =>
                        setRoles((current) =>
                          e.target.checked
                            ? [...new Set([...current, role])]
                            : current.filter((value) => value !== role),
                        )
                      }
                    />
                    {role}
                  </label>
                ))}
              </div>
            </FormField>
            <FormField label="Mandatory governance reason" required>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} required />
            </FormField>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={busy || reason.trim().length < 3}
                onClick={() =>
                  run(async () => {
                    await apiClient.request(
                      `/admin/governance/users/${encodeURIComponent(selected.id)}`,
                      {
                        method: "PATCH",
                        body: JSON.stringify({
                          email: email || null,
                          phone_e164: phone || null,
                          display_name: displayName || undefined,
                          reason,
                        }),
                      },
                    );
                    setSelected(null);
                  })
                }
              >
                Save identity
              </Button>
              <Button
                variant="outline"
                disabled={busy || reason.trim().length < 3 || !roles.length}
                onClick={() =>
                  run(async () => {
                    await apiClient.request(
                      `/admin/users/${encodeURIComponent(selected.id)}/roles`,
                      {
                        method: "POST",
                        body: JSON.stringify({ roles, reason }),
                      },
                    );
                    setSelected(null);
                  })
                }
              >
                Save roles
              </Button>
              {selected.status === UserStatus.DISABLED ? (
                <Button
                  variant="outline"
                  disabled={busy || reason.trim().length < 3}
                  onClick={() =>
                    run(async () => {
                      await apiClient.request(
                        `/admin/governance/users/${encodeURIComponent(selected.id)}/reactivate`,
                        { method: "POST", body: JSON.stringify({ reason }) },
                      );
                      setSelected(null);
                    })
                  }
                >
                  Reactivate
                </Button>
              ) : (
                <Button
                  variant="danger"
                  disabled={busy || reason.trim().length < 3}
                  onClick={() =>
                    run(async () => {
                      await apiClient.request(
                        `/admin/governance/users/${encodeURIComponent(selected.id)}/deactivate`,
                        { method: "POST", body: JSON.stringify({ reason }) },
                      );
                      setSelected(null);
                    })
                  }
                >
                  Deactivate account
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={provisionOpen}
        onClose={() => !busy && setProvisionOpen(false)}
        title="Provision account"
        size="lg"
      >
        <div className="space-y-4">
          <FormField label="Account type" required>
            <Select
              value={provision.subject_type}
              onChange={(e) => setProvision({ ...provision, subject_type: e.target.value })}
            >
              <option value="CUSTOMER">Customer</option>
              <option value="MERCHANT">Merchant owner</option>
              <option value="RIDER">Rider</option>
              <option value="STAFF">Platform staff</option>
            </Select>
          </FormField>
          <FormField label="Name" required>
            <Input value={provision.name} onChange={(e) => setProvision({ ...provision, name: e.target.value })} />
          </FormField>
          <FormField label="Email">
            <Input value={provision.email} onChange={(e) => setProvision({ ...provision, email: e.target.value })} />
          </FormField>
          <FormField label="Phone">
            <Input value={provision.phone_e164} onChange={(e) => setProvision({ ...provision, phone_e164: e.target.value })} />
          </FormField>
          {provision.subject_type === "STAFF" && (
            <FormField label="Staff role" required>
              <Select
                value={provision.staff_role}
                onChange={(e) => setProvision({ ...provision, staff_role: e.target.value })}
              >
                <option value="">Choose role</option>
                <option value="support">Support</option>
                <option value="ops">Operations</option>
                <option value="finance">Finance</option>
                <option value="admin">Admin</option>
                <option value="super_admin">Super Admin</option>
              </Select>
            </FormField>
          )}
          {provision.subject_type === "RIDER" && (
            <FormField label="Vehicle type">
              <Select
                value={provision.vehicle_type}
                onChange={(e) => setProvision({ ...provision, vehicle_type: e.target.value })}
              >
                <option value="BICYCLE">Bicycle</option>
                <option value="MOTORBIKE">Motorbike</option>
                <option value="CAR">Car</option>
              </Select>
            </FormField>
          )}
          {provision.subject_type === "MERCHANT" && (
            <>
              <FormField label="Legal name">
                <Input
                  value={provision.merchant_legal_name}
                  onChange={(e) => setProvision({ ...provision, merchant_legal_name: e.target.value })}
                />
              </FormField>
              <FormField label="Trading name">
                <Input
                  value={provision.merchant_display_name}
                  onChange={(e) => setProvision({ ...provision, merchant_display_name: e.target.value })}
                />
              </FormField>
            </>
          )}
          <FormField label="Governance reason" required>
            <Input value={provision.reason} onChange={(e) => setProvision({ ...provision, reason: e.target.value })} />
          </FormField>
          <Button
            isLoading={busy}
            disabled={!provision.name.trim() || provision.reason.trim().length < 3}
            onClick={() =>
              run(async () => {
                await apiClient.request("/admin/governance/provision", {
                  method: "POST",
                  body: JSON.stringify({
                    ...provision,
                    staff_role: provision.staff_role || undefined,
                    email: provision.email || undefined,
                    phone_e164: provision.phone_e164 || undefined,
                    merchant_legal_name: provision.merchant_legal_name || undefined,
                    merchant_display_name: provision.merchant_display_name || undefined,
                  }),
                });
                setProvisionOpen(false);
                setProvision({
                  subject_type: "CUSTOMER",
                  name: "",
                  email: "",
                  phone_e164: "",
                  staff_role: "",
                  vehicle_type: "MOTORBIKE",
                  merchant_legal_name: "",
                  merchant_display_name: "",
                  reason: "",
                });
              })
            }
          >
            Provision pending account
          </Button>
        </div>
      </Modal>
    </>
  );
}
