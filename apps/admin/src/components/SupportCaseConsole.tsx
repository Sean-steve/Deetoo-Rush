import React, { useMemo, useState } from "react";
import { UserRole } from "@deetoo/types";
import { useAuth } from "../../../../packages/auth/src/react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  FormField,
  Select,
  Textarea,
} from "../../../../packages/ui/src/index";
import {
  errorMessage,
  PageHeading,
  ResourceState,
  StatusBadge,
  useResource,
} from "../../../../packages/ui/src/workflows";

export function SupportCaseConsole() {
  const { apiClient, user, hasRole } = useAuth();
  const cases = useResource<any>("/admin/operations/support/cases?limit=100", 15000);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const detail = useResource<any>(
    selectedId
      ? `/admin/operations/support/cases/${encodeURIComponent(selectedId)}`
      : null,
  );
  const [message, setMessage] = useState("");
  const [visibility, setVisibility] = useState("ALL_PARTICIPANTS");
  const [resolution, setResolution] = useState("");
  const [resolutionCode, setResolutionCode] = useState("AGREED_RESOLUTION");
  const [overrideReason, setOverrideReason] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const list = useMemo(() => cases.data?.cases || [], [cases.data]);
  const selected = detail.data?.case;

  async function uploadEvidence(targetCaseId: string): Promise<string[]> {
    const mediaIds: string[] = [];
    for (const file of files) {
      const prepared = await apiClient.request<any>("/media/uploads", {
        method: "POST",
        body: JSON.stringify({
          purpose: "SUPPORT_ATTACHMENT",
          content_type: file.type || "application/octet-stream",
          reference_type: "SUPPORT_CASE",
          reference_id: targetCaseId,
        }),
      });
      const media = prepared.data;
      if (!media?.upload_url || !media?.media_id) {
        throw new Error("Evidence upload could not be prepared.");
      }
      const upload = await fetch(media.upload_url, {
        method: "PUT",
        headers: media.upload_headers || { "content-type": file.type },
        body: file,
      });
      if (!upload.ok) throw new Error(`Evidence upload failed (HTTP ${upload.status}).`);
      await apiClient.request(
        `/media/uploads/${encodeURIComponent(media.media_id)}/complete`,
        { method: "POST" },
      );
      mediaIds.push(media.media_id);
    }
    return mediaIds;
  }

  async function mutate(work: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await work();
      setFiles([]);
      await detail.refresh();
      await cases.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeading
        title="Support conversations"
        subtitle="Work cases as conversations. Resolution is proposed first; linked parties confirm satisfaction before closure."
      />
      {error && <ErrorState message={error} />}

      <div className="grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] gap-5">
        <Card className="h-fit">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold">Case inbox</h2>
            <Button variant="outline" size="sm" onClick={cases.refresh}>
              Refresh
            </Button>
          </div>
          <ResourceState resource={cases}>
            <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
              {list.map((item: any) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className={
                    "w-full text-left rounded-xl border p-3 transition " +
                    (selectedId === item.id
                      ? "border-emerald-300 bg-emerald-50"
                      : "border-slate-200 hover:border-emerald-200 hover:bg-slate-50")
                  }
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-mono text-slate-500">
                      {item.case_number}
                    </span>
                    <StatusBadge status={item.status} />
                  </div>
                  <p className="font-semibold text-sm mt-2">{item.subject}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {item.priority} · {item.category}
                  </p>
                </button>
              ))}
              {!list.length && (
                <EmptyState
                  title="No support cases"
                  description="New customer, merchant and Rider conversations will appear here."
                />
              )}
            </div>
          </ResourceState>
        </Card>

        <Card className="min-h-[560px]">
          {!selectedId ? (
            <EmptyState
              title="Choose a conversation"
              description="Select a case from the inbox to review evidence and reply."
            />
          ) : (
            <ResourceState resource={detail}>
              {selected && (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-100">
                    <div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={selected.status} />
                        <Badge>{selected.priority}</Badge>
                      </div>
                      <h2 className="text-xl font-extrabold mt-2">{selected.subject}</h2>
                      <p className="text-xs text-slate-500 mt-1">
                        {selected.case_number}
                        {selected.order_id ? ` · Order ${selected.order_id}` : ""}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        mutate(async () => {
                          await apiClient.request(
                            `/admin/operations/support/cases/${encodeURIComponent(selected.id)}/assign`,
                            {
                              method: "POST",
                              body: JSON.stringify({
                                agentId: user?.id,
                                agentName: user?.name || user?.email || "Support",
                              }),
                            },
                          );
                        })
                      }
                    >
                      Take case
                    </Button>
                  </div>

                  <div className="my-5 space-y-3 max-h-[46vh] overflow-y-auto pr-1">
                    {(detail.data?.notes || []).map((note: any) => (
                      <div
                        key={note.id}
                        className={
                          "rounded-xl border p-3 " +
                          (note.visibility === "INTERNAL"
                            ? "border-amber-200 bg-amber-50"
                            : note.message_type === "RESOLUTION"
                              ? "border-emerald-200 bg-emerald-50"
                              : "border-slate-200 bg-slate-50")
                        }
                      >
                        <div className="flex items-center justify-between gap-3 text-[11px] text-slate-500">
                          <span className="font-semibold">
                            {note.author_name || note.author_role || "System"}
                          </span>
                          <span>
                            {note.visibility === "INTERNAL"
                              ? "Internal only"
                              : note.target_party
                                ? `For ${note.target_party.toLowerCase()}`
                                : "Participants"}
                          </span>
                        </div>
                        <p className="text-sm mt-1 whitespace-pre-wrap">{note.body}</p>
                      </div>
                    ))}
                  </div>

                  {(detail.data?.attachments || []).length > 0 && (
                    <div className="mb-5">
                      <p className="text-xs font-bold text-slate-500 mb-2">Evidence</p>
                      <div className="flex flex-wrap gap-2">
                        {detail.data.attachments.map((attachment: any, index: number) => (
                          <Button
                            key={attachment.id}
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              try {
                                const result = await apiClient.request<any>(
                                  `/media/${encodeURIComponent(attachment.media_object_id)}/read-url`,
                                );
                                if (result.data?.url) {
                                  window.open(result.data.url, "_blank", "noopener,noreferrer");
                                }
                              } catch (e) {
                                setError(errorMessage(e));
                              }
                            }}
                          >
                            Evidence {index + 1}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}

                  {(detail.data?.confirmations || []).length > 0 && (
                    <div className="grid sm:grid-cols-3 gap-2 mb-5">
                      {detail.data.confirmations.map((confirmation: any) => (
                        <div key={confirmation.id} className="rounded-xl border border-slate-200 p-3">
                          <p className="text-[11px] font-bold text-slate-500">
                            {confirmation.party_type}
                          </p>
                          <StatusBadge status={confirmation.decision} />
                          {confirmation.comment && (
                            <p className="text-xs text-slate-600 mt-2">{confirmation.comment}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="border-t border-slate-100 pt-5 grid lg:grid-cols-2 gap-5">
                    <div className="space-y-3">
                      <h3 className="font-bold">Continue conversation</h3>
                      <FormField label="Visibility">
                        <Select
                          value={visibility}
                          onChange={(e) => setVisibility(e.target.value)}
                        >
                          <option value="ALL_PARTICIPANTS">All case participants</option>
                          <option value="CUSTOMER_ONLY">Customer only</option>
                          <option value="MERCHANT_ONLY">Merchant only</option>
                          <option value="RIDER_ONLY">Rider only</option>
                          <option value="INTERNAL">Internal support note</option>
                        </Select>
                      </FormField>
                      <FormField label="Message">
                        <Textarea value={message} onChange={(e) => setMessage(e.target.value)} />
                      </FormField>
                      <input
                        type="file"
                        multiple
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        onChange={(e) => setFiles(Array.from(e.target.files || []))}
                        className="block w-full text-xs text-slate-500"
                      />
                      <Button
                        disabled={busy || (!message.trim() && !files.length)}
                        onClick={() =>
                          mutate(async () => {
                            const mediaIds = files.length ? await uploadEvidence(selected.id) : [];
                            await apiClient.request(
                              `/admin/operations/support/cases/${encodeURIComponent(selected.id)}/notes`,
                              {
                                method: "POST",
                                body: JSON.stringify({
                                  visibility,
                                  body: message.trim() || "Evidence attached.",
                                  media_ids: mediaIds,
                                }),
                              },
                            );
                            setMessage("");
                          })
                        }
                      >
                        Send message
                      </Button>
                    </div>

                    <div className="space-y-3">
                      <h3 className="font-bold">Propose resolution</h3>
                      <FormField label="Internal resolution code">
                        <Select
                          value={resolutionCode}
                          onChange={(e) => setResolutionCode(e.target.value)}
                        >
                          <option value="AGREED_RESOLUTION">Agreed resolution</option>
                          <option value="REFUND_ISSUED">Refund issued</option>
                          <option value="DELIVERY_RECOVERED">Delivery recovered</option>
                          <option value="NO_ADJUSTMENT_REQUIRED">No adjustment required</option>
                          <option value="OTHER">Other</option>
                        </Select>
                      </FormField>
                      <FormField label="Customer-facing resolution">
                        <Textarea value={resolution} onChange={(e) => setResolution(e.target.value)} />
                      </FormField>
                      <Button
                        disabled={busy || !resolution.trim()}
                        onClick={() =>
                          mutate(async () => {
                            await apiClient.request(
                              `/admin/operations/support/cases/${encodeURIComponent(selected.id)}/resolve`,
                              {
                                method: "POST",
                                body: JSON.stringify({
                                  resolutionCode,
                                  resolutionNotes: resolution,
                                }),
                              },
                            );
                            setResolution("");
                          })
                        }
                      >
                        Propose resolution
                      </Button>

                      {hasRole(UserRole.SUPER_ADMIN) && selected.status !== "CLOSED" && (
                        <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4">
                          <p className="font-bold text-rose-900">Super Admin override</p>
                          <p className="text-xs text-rose-700 mt-1">
                            Use only when participant confirmation is impossible or legally/operationally inappropriate.
                          </p>
                          <Textarea
                            className="mt-3"
                            value={overrideReason}
                            onChange={(e) => setOverrideReason(e.target.value)}
                            placeholder="Mandatory closure reason"
                          />
                          <Button
                            variant="danger"
                            className="mt-3"
                            disabled={busy || overrideReason.trim().length < 3}
                            onClick={() =>
                              mutate(async () => {
                                await apiClient.request(
                                  `/admin/operations/support/cases/${encodeURIComponent(selected.id)}/force-close`,
                                  {
                                    method: "POST",
                                    body: JSON.stringify({ reason: overrideReason }),
                                  },
                                );
                                setOverrideReason("");
                              })
                            }
                          >
                            Override and close
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </ResourceState>
          )}
        </Card>
      </div>
    </>
  );
}
