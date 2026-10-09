import React, { useEffect, useState } from "react";
import {
  UpdateMerchantSchema,
  InviteStaffSchema,
  UpdateMembershipSchema,
} from "@deetoo/validation";
import { useAuth } from "../../../../packages/auth/src/react";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  FormField,
  Input,
  Modal,
  Select,
} from "../../../../packages/ui/src/index";
import {
  errorMessage,
  PageHeading,
  MetricCard,
  ResourceState,
  StatusBadge,
  useResource,
} from "../../../../packages/ui/src/workflows";

export function MerchantAccount({
  merchantId,
  branches,
  canManage,
}: {
  merchantId: string;
  branches: Array<{ id: string; name: string }>;
  canManage: boolean;
}) {
  const { apiClient } = useAuth();
  const scope = `?merchant_id=${encodeURIComponent(merchantId)}`;
  const profile = useResource<any>("/merchant/profile" + scope);
  const team = useResource<any>("/merchant/team" + scope);
  const [fields, setFields] = useState({
    legal_name: "",
    display_name: "",
    description: "",
  });
  const [email, setEmail] = useState("");
  const [teamQuery, setTeamQuery] = useState("");
  const [teamFilter, setTeamFilter] = useState("ALL");
  const [role, setRole] = useState("merchant_staff");
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [target, setTarget] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState("");
  useEffect(() => {
    if (profile.data)
      setFields({
        legal_name: profile.data.legal_name,
        display_name: profile.data.display_name,
        description: profile.data.description || "",
      });
  }, [profile.data]);
  async function save(
    path: string,
    method: string,
    payload: unknown,
    schema: any,
  ) {
    setError(null);
    setSaved("");
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues.map((i: any) => i.message).join(" "));
      return;
    }
    setBusy(true);
    try {
      await apiClient.request(path + scope, {
        method,
        body: JSON.stringify(parsed.data),
      });
      setSaved("Changes saved.");
      setTarget(null);
      await Promise.all([profile.refresh(), team.refresh()]);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      <PageHeading eyebrow="Business" title="Business & team" subtitle="Manage your business profile and give your team the right access to run your restaurant." />
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <MetricCard label="Team members" value={team.data?.members?.length ?? "—"} detail="Members in this merchant" />
        <MetricCard label="Roles in use" value={team.data?.members ? new Set(team.data.members.map((member: any) => member.role_code)).size : "—"} detail="Actual assigned roles" />
        <MetricCard label="Branches" value={branches.length} detail="Managed restaurant locations" />
        <MetricCard label="Pending invites" value={team.data?.members ? team.data.members.filter((member: any) => member.status === "PENDING").length : "—"} detail="Awaiting activation" />
      </div>
      <div className="merchant-v2-account-layout">
      {error && <ErrorState message={error} />}
      <p role="status">{saved}</p>
      <div className="merchant-v2-profile-panel"><ResourceState resource={profile}>
        {profile.data && (
          <Card>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void save(
                  "/merchant/profile",
                  "PATCH",
                  fields,
                  UpdateMerchantSchema,
                );
              }}
            >
              <StatusBadge status={profile.data.approval_status} />
              {Object.entries(fields).map(([key, value]) => (
                <FormField
                  key={key}
                  label={key.replaceAll("_", " ")}
                  required={key !== "description"}
                >
                  <Input
                    value={value}
                    disabled={!canManage}
                    onChange={(e) =>
                      setFields({ ...fields, [key]: e.target.value })
                    }
                  />
                </FormField>
              ))}
              {canManage && (
                <Button type="submit" isLoading={busy}>
                  Save business profile
                </Button>
              )}
            </form>
          </Card>
        )}
      </ResourceState></div>

      <div className="merchant-v2-team-panel">
        <div className="merchant-v2-team-heading">
          <div><h2>Team members</h2><p>Invite staff and manage access across your branches.</p></div>
          {canManage && <Button onClick={() => { setTarget({}); setEmail(""); setRole("merchant_staff"); setBranchIds([]); }}>+ Invite team member</Button>}
        </div>
        <div className="merchant-v2-tabs" aria-label="Filter team members">
          {["ALL","ACTIVE","PENDING","REVOKED"].map(status => (
            <button type="button" key={status} aria-pressed={teamFilter === status} onClick={() => setTeamFilter(status)}>
              {status === "ALL" ? "All members" : status.charAt(0) + status.slice(1).toLowerCase()}
              {team.data?.members ? ` (${status === "ALL" ? team.data.members.length : team.data.members.filter((m: any) => m.status === status).length})` : ""}
            </button>
          ))}
        </div>
        <div className="merchant-v2-team-search"><input type="search" aria-label="Search team members" placeholder="Search team members..." value={teamQuery} onChange={event => setTeamQuery(event.target.value)} /></div>
        <ResourceState resource={team}>
          {team.data?.members?.length ? (
            <div className="merchant-v2-team-table" role="table" aria-label="Merchant team">
              <div role="row"><span>Name / email</span><span>Role</span><span>Branch access</span><span>Status</span><span>Actions</span></div>
              {team.data.members
                .filter((member: any) => (teamFilter === "ALL" || member.status === teamFilter) && (!teamQuery || [member.email || "",member.user_id || "",member.role_code || ""].some((str: string) => str.toLowerCase().includes(teamQuery.toLowerCase()))))
                .map((member: any) => (
                  <div role="row" key={member.id}>
                    <strong title={member.email || member.user_id}>{member.email || member.user_id}</strong>
                    <span>{member.role_code?.replaceAll("_", " ")}</span>
                    <span>{member.branch_ids?.length ? member.branch_ids.map((id: string) => branches.find(b => b.id === id)?.name || "Assigned branch").join(", ") : "All assigned branches"}</span>
                    <StatusBadge status={member.status} />
                    {canManage ? <Button variant="outline" size="sm" onClick={() => {setTarget(member);setRole(member.role_code);setBranchIds(member.branch_ids || []);}}>Edit access</Button> : <span>—</span>}
                  </div>
                ))}
            </div>
          ) : <EmptyState title="No team members" description="Invite team members to collaborate on orders, menu and branch settings." />}
        </ResourceState>
      </div>
      </div>
      <Modal
        isOpen={Boolean(target)}
        onClose={() => !busy && setTarget(null)}
        title={target?.id ? "Edit team access" : "Invite team member"}
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save(
              target.id
                ? `/merchant/team/memberships/${encodeURIComponent(target.id)}`
                : "/merchant/team/invitations",
              target.id ? "PATCH" : "POST",
              {
                ...(target.id ? {} : { email }),
                role_code: role,
                branch_ids: branchIds,
              },
              target.id ? UpdateMembershipSchema : InviteStaffSchema,
            );
          }}
        >
          {!target?.id && (
            <FormField label="Email" required>
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </FormField>
          )}
          <FormField label="Role">
            <Select value={role} onChange={(e) => setRole(e.target.value)}>
              {["merchant_staff", "merchant_manager", "merchant_owner"].map(
                (r) => (
                  <option key={r} value={r}>
                    {r.replaceAll("_", " ")}
                  </option>
                ),
              )}
            </Select>
          </FormField>
          <fieldset>
            <legend className="font-bold mb-2">Branch access</legend>
            <p className="text-sm mb-3">
              Select branches, or leave all unchecked for merchant-wide access.
            </p>
            {branches.map((b) => (
              <label key={b.id} className="flex gap-3 items-center min-h-11">
                <input
                  type="checkbox"
                  checked={branchIds.includes(b.id)}
                  onChange={(e) =>
                    setBranchIds(
                      e.target.checked
                        ? [...branchIds, b.id]
                        : branchIds.filter((id) => id !== b.id),
                    )
                  }
                />
                {b.name}
              </label>
            ))}
          </fieldset>
          {error && <ErrorState message={error} />}
          <Button type="submit" isLoading={busy}>
            {target?.id ? "Save access" : "Send invitation"}
          </Button>
          {target?.id && (
            <Button
              variant="danger"
              disabled={busy}
              onClick={() =>
                save(
                  `/merchant/team/memberships/${encodeURIComponent(target.id)}`,
                  "PATCH",
                  { status: "REVOKED" },
                  UpdateMembershipSchema,
                )
              }
            >
              Revoke access
            </Button>
          )}
        </form>
      </Modal>
    </div>
  );
}
