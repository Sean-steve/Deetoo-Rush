import React, { useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  FormField,
  Input,
  Select,
  Textarea,
} from "../../../../packages/ui/src/index";
import {
  PageHeading,
  ResourceState,
  StatusBadge,
  errorMessage,
  useResource,
} from "../../../../packages/ui/src/workflows";
import { useAuth } from "../../../../packages/auth/src/react";
import { CheckCircle2, FileUp, MessageSquare, ShieldCheck, Users } from "lucide-react";

const audienceOptions = [
  ["ALL_PARTICIPANTS", "Everyone in the case"],
  ["CUSTOMER_ONLY", "Customer only"],
  ["MERCHANT_ONLY", "Merchant only"],
  ["RIDER_ONLY", "Rider only"],
  ["INTERNAL", "Internal staff only"],
] as const;

async function uploadEvidence(apiClient: any, caseId: string, file: File): Promise<string> {
  const prepared = await apiClient.request<any>("/media/uploads", {
    method: "POST",
    body: JSON.stringify({
      purpose: "SUPPORT_ATTACHMENT",
      content_type: file.type || "application/octet-stream",
      reference_type: "SUPPORT_CASE",
      reference_id: caseId,
    }),
  });
  const upload = prepared.data;
  const result = await fetch(upload.upload_url, {
    method: "PUT",
    headers: upload.upload_headers || { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!result.ok) throw new Error("Evidence upload failed with HTTP " + result.status);
  await apiClient.request("/media/uploads/" + encodeURIComponent(upload.media_id) + "/complete", {
    method: "POST",
  });
  return String(upload.media_id);
}

export function SupportConversation() {
  const { apiClient, user } = useAuth();
  const cases = useResource<any>("/admin/operations/support/cases?limit=100", 15000, "admin:operations");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const detail = useResource<any>(
    selectedId ? "/admin/operations/support/cases/" + encodeURIComponent(selectedId) : null,
    10000,
    "admin:operations",
  );
  const [audience, setAudience] = useState("ALL_PARTICIPANTS");
  const [message, setMessage] = useState("");
  const [resolutionCode, setResolutionCode] = useState("SUPPORT_RESOLUTION");
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const caseList = Array.isArray(cases.data?.cases) ? cases.data.cases : [];
  const selectedCase = detail.data?.case;
  const notes = Array.isArray(detail.data?.notes) ? detail.data.notes : [];
  const participants = Array.isArray(detail.data?.participants)
    ? detail.data.participants
    : selectedCase?.participants || [];
  const pendingParticipants = useMemo(
    () => participants.filter((p: any) =>
      p.required_confirmation && !["ACCEPTED", "ACKNOWLEDGED"].includes(p.confirmation_status)
    ),
    [participants],
  );

  async function sendMessage() {
    if (!selectedId || !message.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const attachmentIds: string[] = [];
      for (const file of files) attachmentIds.push(await uploadEvidence(apiClient, selectedId, file));
      await apiClient.request(
        "/admin/operations/support/cases/" + encodeURIComponent(selectedId) + "/notes",
        {
          method: "POST",
          body: JSON.stringify({
            visibility: audience,
            body: message.trim(),
            attachmentIds,
          }),
        },
      );
      setMessage("");
      setFiles([]);
      await detail.refresh();
      await cases.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function proposeResolution() {
    if (!selectedId || !resolutionNotes.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await apiClient.request(
        "/admin/operations/support/cases/" + encodeURIComponent(selectedId) + "/resolve",
        {
          method: "POST",
          body: JSON.stringify({
            resolutionCode: resolutionCode.trim() || "SUPPORT_RESOLUTION",
            resolutionNotes: resolutionNotes.trim(),
          }),
        },
      );
      setResolutionNotes("");
      await detail.refresh();
      await cases.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function assignToMe() {
    if (!selectedId || !user) return;
    setBusy(true);
    setError(null);
    try {
      await apiClient.request(
        "/admin/operations/support/cases/" + encodeURIComponent(selectedId) + "/assign",
        {
          method: "POST",
          body: JSON.stringify({
            agentId: user.id,
            agentName: user.name || user.email || "Support agent",
          }),
        },
      );
      await detail.refresh();
      await cases.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function openAttachment(mediaId: string) {
    try {
      const response = await apiClient.request<any>("/media/" + encodeURIComponent(mediaId) + "/read-url");
      if (response.data?.url) window.open(response.data.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className="space-y-5">
      <PageHeading
        eyebrow="Support"
        title="Case conversations"
        action={selectedCase ? (
          <div className="flex items-center gap-2">
            <StatusBadge status={selectedCase.status} />
            <Badge variant="default">{selectedCase.case_number}</Badge>
          </div>
        ) : undefined}
      />
      {error && <ErrorState message={error} />}
      <div className="grid grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)_320px] gap-5">
        <Card className="h-fit xl:sticky xl:top-24">
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare size={18} className="text-emerald-600" />
            <h2 className="font-bold">Case inbox</h2>
          </div>
          <ResourceState resource={cases}>
            <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
              {caseList.map((item: any) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className={
                    "w-full text-left rounded-2xl border p-3 transition " +
                    (selectedId === item.id
                      ? "border-emerald-300 bg-emerald-50"
                      : "border-slate-200 bg-white hover:border-emerald-200")
                  }
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-black text-slate-500">{item.case_number}</span>
                    <StatusBadge status={item.status} />
                  </div>
                  <p className="font-bold text-sm text-slate-900 mt-2">{item.subject}</p>
                  <p className="text-xs text-slate-500 mt-1">{String(item.priority || "").toLowerCase()} priority</p>
                </button>
              ))}
              {!caseList.length && (
                <EmptyState title="No support cases" description="New customer, merchant and Rider conversations will appear here." />
              )}
            </div>
          </ResourceState>
        </Card>

        <Card className="min-h-[540px]">
          {!selectedId ? (
            <EmptyState
              icon={<MessageSquare size={24} />}
              title="Choose a case"
              description="Open a support case to review the full multi-party conversation and evidence."
            />
          ) : (
            <ResourceState resource={detail}>
              {selectedCase && (
                <>
                  <div className="pb-4 border-b border-slate-100">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="text-xl font-extrabold tracking-tight text-slate-950">{selectedCase.subject}</h2>
                        <p className="text-sm text-slate-500 mt-1">{selectedCase.description}</p>
                      </div>
                      {!selectedCase.assigned_agent_id && (
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => void assignToMe()}>
                          Assign to me
                        </Button>
                      )}
                    </div>
                    {selectedCase.assigned_agent_name && (
                      <p className="text-xs text-slate-500 mt-3">
                        Owner: <strong>{selectedCase.assigned_agent_name}</strong>
                      </p>
                    )}
                  </div>

                  <div className="space-y-3 py-5 max-h-[52vh] overflow-y-auto pr-1">
                    {notes.map((note: any) => {
                      const internal = note.visibility === "INTERNAL";
                      const resolution = note.message_type === "RESOLUTION";
                      const className = internal
                        ? "bg-amber-50 border-amber-200"
                        : resolution
                          ? "bg-emerald-50 border-emerald-200"
                          : "bg-slate-50 border-slate-200";
                      return (
                        <div key={note.id} className={"rounded-2xl border p-4 " + className}>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mb-2">
                            <strong className="text-slate-800">{note.author_name || note.author_role || "DeeToo"}</strong>
                            <Badge variant={internal ? "warning" : "default"}>
                              {String(note.visibility || "message").toLowerCase().replaceAll("_", " ")}
                            </Badge>
                            {note.message_type && note.message_type !== "MESSAGE" && (
                              <Badge variant="success">{note.message_type.toLowerCase().replaceAll("_", " ")}</Badge>
                            )}
                            <span>{new Date(note.created_at).toLocaleString()}</span>
                          </div>
                          <p className="text-sm whitespace-pre-wrap leading-6 text-slate-800">{note.body}</p>
                          {!!note.attachments?.length && (
                            <div className="flex flex-wrap gap-2 mt-3">
                              {note.attachments.map((attachment: any) => (
                                <Button
                                  key={attachment.id}
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => void openAttachment(attachment.media_object_id)}
                                >
                                  <FileUp size={14} /> View evidence
                                </Button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {selectedCase.status !== "CLOSED" && (
                    <div className="border-t border-slate-100 pt-4 space-y-3">
                      <div className="grid sm:grid-cols-[220px_1fr] gap-3">
                        <Select value={audience} onChange={(event) => setAudience(event.target.value)}>
                          {audienceOptions.map(([value, label]) => (
                            <option value={value} key={value}>{label}</option>
                          ))}
                        </Select>
                        <Textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Write a case message…" />
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <label className="text-xs font-semibold text-slate-600">
                          Evidence
                          <input
                            className="block mt-1 text-xs"
                            type="file"
                            multiple
                            accept="image/jpeg,image/png,image/webp,application/pdf,video/mp4,video/quicktime"
                            onChange={(event) => setFiles(Array.from(event.target.files || []))}
                          />
                        </label>
                        <Button disabled={busy || !message.trim()} onClick={() => void sendMessage()}>
                          Send message
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </ResourceState>
          )}
        </Card>

        <div className="space-y-5">
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <Users size={18} className="text-emerald-600" />
              <h2 className="font-bold">Participants</h2>
            </div>
            {!participants.length ? (
              <p className="text-sm text-slate-500">No linked participants.</p>
            ) : (
              <div className="space-y-3">
                {participants.map((participant: any) => (
                  <div key={participant.id} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-bold text-sm">{participant.display_name || participant.participant_type}</p>
                        <p className="text-xs text-slate-500">{String(participant.participant_type).toLowerCase()}</p>
                      </div>
                      <StatusBadge status={participant.confirmation_status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {selectedCase && selectedCase.status !== "CLOSED" && (
            <Card>
              <div className="flex items-center gap-2 mb-3">
                <ShieldCheck size={18} className="text-emerald-600" />
                <h2 className="font-bold">Resolution</h2>
              </div>
              {selectedCase.status === "PARTY_CONFIRMATION" ? (
                <>
                  <p className="text-sm text-slate-600">
                    A resolution has been proposed. DeeToo closes the case only after every required participant confirms it.
                  </p>
                  <div className="mt-4 rounded-xl bg-slate-50 p-3">
                    <p className="text-xs font-bold text-slate-500 uppercase">Proposed outcome</p>
                    <p className="text-sm mt-1">{selectedCase.resolution_notes || "Resolution proposed"}</p>
                  </div>
                  <p className="text-xs text-slate-500 mt-3">
                    {pendingParticipants.length} confirmation{pendingParticipants.length === 1 ? "" : "s"} remaining.
                  </p>
                </>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-slate-600">
                    Proposing an outcome does not close the case. Participants can accept or dispute it.
                  </p>
                  <FormField label="Internal resolution code">
                    <Input value={resolutionCode} onChange={(event) => setResolutionCode(event.target.value)} />
                  </FormField>
                  <FormField label="Customer-facing proposed resolution">
                    <Textarea value={resolutionNotes} onChange={(event) => setResolutionNotes(event.target.value)} />
                  </FormField>
                  <Button className="w-full" disabled={busy || !resolutionNotes.trim()} onClick={() => void proposeResolution()}>
                    <CheckCircle2 size={15} /> Propose resolution
                  </Button>
                </div>
              )}
            </Card>
          )}

          {selectedCase?.status === "CLOSED" && (
            <Card className="border-emerald-200 bg-emerald-50">
              <CheckCircle2 className="text-emerald-600" />
              <h2 className="font-bold mt-2">Case closed</h2>
              <p className="text-sm text-emerald-900 mt-1">All required participants confirmed the resolution.</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
