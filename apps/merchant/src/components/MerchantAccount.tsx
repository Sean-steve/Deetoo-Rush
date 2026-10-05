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
      <PageHeading title="Business & team" />
      {error && <ErrorState message={error} />}
      <p role="status">{saved}</p>
      <ResourceState resource={profile}>
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
      </ResourceState>
      <ResourceState resource={team}>
        <h2 className="text-xl font-bold">Team access</h2>
        {team.data?.members?.map((member: any) => (
          <Card key={member.id} className="mt-3 flex justify-between gap-4">
            <div>
              <p>{member.email || member.user_id}</p>
              <p>{member.role_code}</p>
              <StatusBadge status={member.status} />
              <p className="text-sm">
                Branches:{" "}
                {member.branch_ids?.length
                  ? member.branch_ids
                      .map(
                        (id: string) =>
                          branches.find((b) => b.id === id)?.name || id,
                      )
                      .join(", ")
                  : "All assigned merchant branches"}
              </p>
            </div>
            {canManage && (
              <Button
                variant="outline"
                onClick={() => {
                  setTarget(member);
                  setRole(member.role_code);
                  setBranchIds(member.branch_ids || []);
                }}
              >
                Edit access
              </Button>
            )}
          </Card>
        ))}
        {team.data && !team.data.members?.length && (
          <EmptyState
            title="No team members"
            description="Team members will appear here."
          />
        )}
      </ResourceState>
      {canManage && (
        <Button
          onClick={() => {
            setTarget({});
            setEmail("");
            setRole("merchant_staff");
            setBranchIds([]);
          }}
        >
          Invite team member
        </Button>
      )}
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
