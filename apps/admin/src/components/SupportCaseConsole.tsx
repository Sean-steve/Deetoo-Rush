import React, { useMemo, useState } from "react";
import { UserRole } from "@deetoo/types";
import { useAuth } from "../../../../packages/auth/src/react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  FileInput,
  FormField,
  InlineBanner,
  ProgressSteps,
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
import {
  FileText,
  Headphones,
  MessageSquareText,
  ShieldCheck,
  Store,
  UserRound,
  Bike,
  WalletCards,
} from "lucide-react";

const caseProgress = [
  { id: "opened", label: "Opened", description: "Case received" },
  { id: "conversation", label: "Conversation", description: "Evidence and replies" },
  { id: "resolution", label: "Resolution", description: "Support proposes outcome" },
  { id: "confirmation", label: "Confirmation", description: "Participants respond" },
  { id: "closed", label: "Closed", description: "Everyone satisfied or override" },
];

function supportProgressStage(status?: string): string {
  if (status === "CLOSED" || status === "RESOLVED") return "closed";
  if (status === "PARTY_CONFIRMATION" || status === "DISPUTED")
    return "confirmation";
  if (status === "RESOLUTION_PROPOSED") return "resolution";
  if (
    [
      "ASSIGNED",
      "IN_PROGRESS",
      "IN_CONVERSATION",
      "WAITING_CUSTOMER",
      "WAITING_MERCHANT",
      "WAITING_RIDER",
      "WAITING_INTERNAL",
    ].includes(status || "")
  )
    return "conversation";
  return "opened";
}

function priorityTone(
  priority?: string,
): "default" | "info" | "warning" | "danger" {
  if (priority === "URGENT") return "danger";
  if (priority === "HIGH") return "warning";
  if (priority === "MEDIUM") return "info";
  return "default";
}

function compactId(value?: string | null): string {
  if (!value) return "Not linked";
  return value.length > 12 ? `…${value.slice(-8)}` : value;
}

function ageLabel(value?: string | null): string {
  if (!value) return "Unknown";
  const delta = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function SupportCaseConsole() {
  const { apiClient, user, hasRole } = useAuth();
  const cases = useResource<any>(
    "/admin/operations/support/cases?limit=100",
    15000,
  );
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

  const list = useMemo(() => {
    const priorityRank: Record<string, number> = {
      URGENT: 4,
      HIGH: 3,
      MEDIUM: 2,
      LOW: 1,
    };
    return [...(cases.data?.cases || [])].sort(
      (a: any, b: any) =>
        (priorityRank[b.priority] || 0) - (priorityRank[a.priority] || 0) ||
        new Date(b.updated_at || b.created_at).getTime() -
          new Date(a.updated_at || a.created_at).getTime(),
    );
  }, [cases.data]);
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
      if (!upload.ok) {
        throw new Error(`Evidence upload failed (HTTP ${upload.status}).`);
      }
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
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  const participantCards = selected
    ? [
        {
          type: "Customer",
          id: selected.customer_id,
          icon: UserRound,
        },
        {
          type: "Merchant",
          id: selected.merchant_id,
          icon: Store,
        },
        {
          type: "Rider",
          id: selected.rider_id,
          icon: Bike,
        },
      ].filter((participant) => participant.id)
    : [];

  return (
    <>
      <PageHeading
        title="Support & case resolution"
        eyebrow="Case operations"
        subtitle="Read the case as a narrative, verify evidence, continue the conversation, then propose a resolution for participant confirmation."
        action={
          <Button variant="outline" size="sm" onClick={cases.refresh}>
            Refresh inbox
          </Button>
        }
      />

      {error && <ErrorState message={error} />}

      <div className="admin-case-workspace">
        <aside className="admin-case-inbox">
          <Card>
            <div className="admin-section-heading">
              <div>
                <p className="eyebrow">Queue</p>
                <h2>Case inbox</h2>
              </div>
              <strong>{list.length}</strong>
            </div>
            <ResourceState resource={cases} compact>
              <div className="admin-case-list">
                {list.map((item: any) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    aria-current={selectedId === item.id ? "true" : undefined}
                    className="admin-case-list-item"
                  >
                    <div>
                      <span className="admin-case-number">
                        {item.case_number}
                      </span>
                      <Badge variant={priorityTone(item.priority)}>
                        {item.priority}
                      </Badge>
                    </div>
                    <strong>{item.subject}</strong>
                    <p>{item.category.toLowerCase().replaceAll("_", " ")}</p>
                    <footer>
                      <StatusBadge status={item.status} />
                      <span>{ageLabel(item.updated_at || item.created_at)}</span>
                    </footer>
                  </button>
                ))}
                {!list.length && (
                  <EmptyState
                    title="No support cases"
                    description="New customer, merchant and Rider conversations will appear here."
                    icon={Headphones}
                  />
                )}
              </div>
            </ResourceState>
          </Card>
        </aside>

        <main className="admin-case-narrative">
          {!selectedId ? (
            <Card className="admin-case-empty">
              <EmptyState
                title="Choose a case"
                description="Select a case from the inbox to read the conversation, evidence and resolution state."
                icon={MessageSquareText}
              />
            </Card>
          ) : (
            <ResourceState resource={detail}>
              {selected && (
                <>
                  <Card className="admin-case-header">
                    <div className="admin-case-header-top">
                      <div>
                        <div className="flex flex-wrap gap-2">
                          <StatusBadge status={selected.status} />
                          <Badge variant={priorityTone(selected.priority)}>
                            {selected.priority}
                          </Badge>
                        </div>
                        <h2>{selected.subject}</h2>
                        <p>
                          {selected.case_number} ·{" "}
                          {selected.category
                            .toLowerCase()
                            .replaceAll("_", " ")}
                        </p>
                      </div>
                      <div className="admin-case-owner">
                        <span>Assigned to</span>
                        <strong>
                          {selected.assigned_agent_name || "Unassigned"}
                        </strong>
                        {!selected.assigned_agent_id && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={() =>
                              void mutate(async () => {
                                await apiClient.request(
                                  `/admin/operations/support/cases/${encodeURIComponent(
                                    selected.id,
                                  )}/assign`,
                                  {
                                    method: "POST",
                                    body: JSON.stringify({
                                      agentId: user?.id,
                                      agentName:
                                        user?.name || user?.email || "Support",
                                    }),
                                  },
                                );
                              })
                            }
                          >
                            Take case
                          </Button>
                        )}
                      </div>
                    </div>

                    <ProgressSteps
                      steps={caseProgress}
                      current={supportProgressStage(selected.status)}
                    />

                    <div className="admin-case-participants">
                      {participantCards.map((participant) => {
                        const Icon = participant.icon;
                        return (
                          <div key={participant.type}>
                            <span className="admin-case-participant-icon">
                              <Icon size={17} aria-hidden="true" />
                            </span>
                            <span>
                              <small>{participant.type}</small>
                              <strong>{compactId(participant.id)}</strong>
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {(selected.order_id ||
                      selected.delivery_id ||
                      selected.payment_id) && (
                      <div className="admin-case-links">
                        {selected.order_id && (
                          <span>
                            <FileText size={14} />
                            Order {compactId(selected.order_id)}
                          </span>
                        )}
                        {selected.delivery_id && (
                          <span>
                            <Bike size={14} />
                            Delivery {compactId(selected.delivery_id)}
                          </span>
                        )}
                        {selected.payment_id && (
                          <span>
                            <WalletCards size={14} />
                            Payment {compactId(selected.payment_id)}
                          </span>
                        )}
                      </div>
                    )}
                  </Card>

                  <div className="admin-case-story-grid">
                    <Card className="admin-case-conversation">
                      <div className="admin-section-heading">
                        <div>
                          <p className="eyebrow">Narrative</p>
                          <h2>Conversation & decisions</h2>
                        </div>
                        <MessageSquareText size={19} aria-hidden="true" />
                      </div>

                      <div className="admin-case-timeline">
                        <article data-type="system">
                          <span className="admin-case-timeline-dot" />
                          <div>
                            <header>
                              <strong>Case opened</strong>
                              <time>
                                {new Date(selected.created_at).toLocaleString()}
                              </time>
                            </header>
                            <p>{selected.description}</p>
                          </div>
                        </article>

                        {(detail.data?.notes || []).map((note: any) => (
                          <article
                            key={note.id}
                            data-type={
                              note.visibility === "INTERNAL"
                                ? "internal"
                                : note.message_type === "RESOLUTION"
                                  ? "resolution"
                                  : "message"
                            }
                          >
                            <span className="admin-case-timeline-dot" />
                            <div>
                              <header>
                                <strong>
                                  {note.author_name ||
                                    note.author_role ||
                                    "System"}
                                </strong>
                                <time>
                                  {new Date(note.created_at).toLocaleString()}
                                </time>
                              </header>
                              <small>
                                {note.visibility === "INTERNAL"
                                  ? "Internal support note"
                                  : note.target_party
                                    ? `For ${note.target_party.toLowerCase()}`
                                    : "All participants"}
                              </small>
                              <p>{note.body}</p>
                            </div>
                          </article>
                        ))}

                        {selected.resolution_notes && (
                          <article data-type="resolution">
                            <span className="admin-case-timeline-dot" />
                            <div>
                              <header>
                                <strong>Proposed resolution</strong>
                                <time>
                                  {selected.resolution_proposed_at
                                    ? new Date(
                                        selected.resolution_proposed_at,
                                      ).toLocaleString()
                                    : ""}
                                </time>
                              </header>
                              <p>{selected.resolution_notes}</p>
                            </div>
                          </article>
                        )}
                      </div>
                    </Card>

                    <aside className="admin-case-evidence">
                      <Card>
                        <div className="admin-section-heading">
                          <div>
                            <p className="eyebrow">Evidence</p>
                            <h2>Attachments</h2>
                          </div>
                          <FileText size={19} aria-hidden="true" />
                        </div>
                        {(detail.data?.attachments || []).length ? (
                          <div className="admin-evidence-list">
                            {detail.data.attachments.map(
                              (attachment: any, index: number) => (
                                <button
                                  type="button"
                                  key={attachment.id}
                                  onClick={async () => {
                                    try {
                                      const result =
                                        await apiClient.request<any>(
                                          `/media/${encodeURIComponent(
                                            attachment.media_object_id,
                                          )}/read-url`,
                                        );
                                      if (result.data?.url) {
                                        window.open(
                                          result.data.url,
                                          "_blank",
                                          "noopener,noreferrer",
                                        );
                                      }
                                    } catch (cause) {
                                      setError(errorMessage(cause));
                                    }
                                  }}
                                >
                                  <FileText size={16} />
                                  <span>
                                    <strong>Evidence {index + 1}</strong>
                                    <small>
                                      {ageLabel(attachment.created_at)}
                                    </small>
                                  </span>
                                </button>
                              ),
                            )}
                          </div>
                        ) : (
                          <p className="text-sm text-slate-500">
                            No evidence attached yet.
                          </p>
                        )}
                      </Card>

                      {(detail.data?.confirmations || []).length > 0 && (
                        <Card>
                          <div className="admin-section-heading">
                            <div>
                              <p className="eyebrow">Participant response</p>
                              <h2>Resolution confirmations</h2>
                            </div>
                            <ShieldCheck size={19} aria-hidden="true" />
                          </div>
                          <div className="admin-confirmation-list">
                            {detail.data.confirmations.map(
                              (confirmation: any) => (
                                <div key={confirmation.id}>
                                  <span>
                                    {confirmation.party_type
                                      .toLowerCase()
                                      .replace(/^./, (value: string) =>
                                        value.toUpperCase(),
                                      )}
                                  </span>
                                  <StatusBadge
                                    status={confirmation.decision}
                                  />
                                  {confirmation.comment && (
                                    <p>{confirmation.comment}</p>
                                  )}
                                </div>
                              ),
                            )}
                          </div>
                        </Card>
                      )}
                    </aside>
                  </div>
                </>
              )}
            </ResourceState>
          )}
        </main>

        <aside className="admin-case-actions">
          {selected ? (
            <div className="admin-case-actions-sticky">
              <Card>
                <div className="admin-section-heading">
                  <div>
                    <p className="eyebrow">Action</p>
                    <h2>Continue conversation</h2>
                  </div>
                </div>
                <div className="space-y-3">
                  <FormField label="Visibility">
                    <Select
                      value={visibility}
                      onChange={(event) => setVisibility(event.target.value)}
                    >
                      <option value="ALL_PARTICIPANTS">
                        All case participants
                      </option>
                      <option value="CUSTOMER_ONLY">Customer only</option>
                      <option value="MERCHANT_ONLY">Merchant only</option>
                      <option value="RIDER_ONLY">Rider only</option>
                      <option value="INTERNAL">Internal support note</option>
                    </Select>
                  </FormField>
                  <FormField label="Message">
                    <Textarea
                      value={message}
                      onChange={(event) => setMessage(event.target.value)}
                    />
                  </FormField>
                  <FileInput
                    multiple
                    files={files}
                    label="Attach evidence"
                    accept="image/jpeg,image/png,image/webp,application/pdf,video/mp4,video/quicktime"
                    onFilesChange={setFiles}
                    hint="Images, PDF, MP4 or QuickTime."
                  />
                  <Button
                    fullWidth
                    disabled={busy || (!message.trim() && !files.length)}
                    onClick={() =>
                      void mutate(async () => {
                        const mediaIds = files.length
                          ? await uploadEvidence(selected.id)
                          : [];
                        await apiClient.request(
                          `/admin/operations/support/cases/${encodeURIComponent(
                            selected.id,
                          )}/notes`,
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
              </Card>

              <Card>
                <div className="admin-section-heading">
                  <div>
                    <p className="eyebrow">Outcome</p>
                    <h2>Propose resolution</h2>
                  </div>
                </div>
                <div className="space-y-3">
                  <FormField label="Resolution code">
                    <Select
                      value={resolutionCode}
                      onChange={(event) =>
                        setResolutionCode(event.target.value)
                      }
                    >
                      <option value="AGREED_RESOLUTION">
                        Agreed resolution
                      </option>
                      <option value="REFUND_ISSUED">Refund issued</option>
                      <option value="DELIVERY_RECOVERED">
                        Delivery recovered
                      </option>
                      <option value="NO_ADJUSTMENT_REQUIRED">
                        No adjustment required
                      </option>
                      <option value="OTHER">Other</option>
                    </Select>
                  </FormField>
                  <FormField label="Participant-facing resolution">
                    <Textarea
                      value={resolution}
                      onChange={(event) => setResolution(event.target.value)}
                    />
                  </FormField>
                  <Button
                    fullWidth
                    disabled={busy || !resolution.trim()}
                    onClick={() =>
                      void mutate(async () => {
                        await apiClient.request(
                          `/admin/operations/support/cases/${encodeURIComponent(
                            selected.id,
                          )}/resolve`,
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
                </div>
              </Card>

              {hasRole(UserRole.SUPER_ADMIN) &&
                selected.status !== "CLOSED" && (
                  <Card className="admin-case-override">
                    <InlineBanner
                      kind="danger"
                      title="Super Admin closure override"
                    >
                      Use only when participant confirmation is impossible or
                      operationally inappropriate.
                    </InlineBanner>
                    <Textarea
                      className="mt-3"
                      value={overrideReason}
                      onChange={(event) =>
                        setOverrideReason(event.target.value)
                      }
                      placeholder="Mandatory closure reason"
                    />
                    <Button
                      variant="danger"
                      fullWidth
                      className="mt-3"
                      disabled={busy || overrideReason.trim().length < 3}
                      onClick={() =>
                        void mutate(async () => {
                          await apiClient.request(
                            `/admin/operations/support/cases/${encodeURIComponent(
                              selected.id,
                            )}/force-close`,
                            {
                              method: "POST",
                              body: JSON.stringify({
                                reason: overrideReason,
                              }),
                            },
                          );
                          setOverrideReason("");
                        })
                      }
                    >
                      Override and close
                    </Button>
                  </Card>
                )}
            </div>
          ) : null}
        </aside>
      </div>
    </>
  );
}

export { supportProgressStage };
