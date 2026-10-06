import React, { useState } from "react";
import { useAuth } from "../../auth/src/react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  FormField,
  Input,
  Textarea,
} from "./index";
import {
  errorMessage,
  PageHeading,
  ResourceState,
  StatusBadge,
  useResource,
} from "./workflows";

type SupportMode = "customer" | "participant";

async function uploadSupportEvidence(
  apiClient: any,
  caseId: string,
  file: File,
): Promise<string> {
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
  const response = await fetch(upload.upload_url, {
    method: "PUT",
    headers: upload.upload_headers || {
      "Content-Type": file.type || "application/octet-stream",
    },
    body: file,
  });
  if (!response.ok) {
    throw new Error("Evidence upload failed with HTTP " + response.status);
  }
  await apiClient.request(
    "/media/uploads/" + encodeURIComponent(upload.media_id) + "/complete",
    { method: "POST" },
  );
  return String(upload.media_id);
}

export function AccountSupport({
  mode = "customer",
}: {
  mode?: SupportMode;
}) {
  const { apiClient } = useAuth();
  const basePath = mode === "customer" ? "/customer/support" : "/support";
  const cases = useResource<any>(basePath + "/cases");
  const notifications = useResource<any>(
    mode === "customer" ? "/customer/support/notifications" : null,
  );
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [orderId, setOrderId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [caseId, setCaseId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [confirmationNote, setConfirmationNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const detail = useResource<any>(
    caseId ? basePath + "/cases/" + encodeURIComponent(caseId) : null,
    10000,
  );

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiClient.request(basePath + "/cases", {
        method: "POST",
        body: JSON.stringify({
          subject,
          description,
          category: "ORDER_ISSUE",
          ...(orderId ? { order_id: orderId } : {}),
        }),
      });
      setSubject("");
      setDescription("");
      setOrderId("");
      await cases.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const sendReply = async () => {
    if (!caseId || !reply.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const attachmentIds: string[] = [];
      for (const file of files) {
        attachmentIds.push(await uploadSupportEvidence(apiClient, caseId, file));
      }
      const suffix = mode === "customer" ? "/notes" : "/messages";
      await apiClient.request(
        basePath + "/cases/" + encodeURIComponent(caseId) + suffix,
        {
          method: "POST",
          body: JSON.stringify({ body: reply, attachmentIds }),
        },
      );
      setReply("");
      setFiles([]);
      await detail.refresh();
      await cases.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const confirmResolution = async (accepted: boolean) => {
    if (!caseId) return;
    setBusy(true);
    setError(null);
    try {
      await apiClient.request(
        basePath +
          "/cases/" +
          encodeURIComponent(caseId) +
          "/confirm-resolution",
        {
          method: "POST",
          body: JSON.stringify({
            accepted,
            note: confirmationNote || undefined,
          }),
        },
      );
      setConfirmationNote("");
      await detail.refresh();
      await cases.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const openEvidence = async (mediaId: string) => {
    try {
      const response = await apiClient.request<any>(
        "/media/" + encodeURIComponent(mediaId) + "/read-url",
      );
      if (response.data?.url) {
        window.open(response.data.url, "_blank", "noopener,noreferrer");
      }
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const messages = Array.isArray(notifications.data)
    ? notifications.data
    : notifications.data?.notifications || [];
  const selectedCase = detail.data?.case;
  const notes = detail.data?.notes || [];
  const participants = detail.data?.participants || [];

  return (
    <>
      <PageHeading title="Support conversations" />
      {error && <ErrorState message={error} />}
      <div className="workflow-grid">
        <section className="space-y-4">
          <ResourceState resource={cases}>
            {cases.data?.cases?.map((item: any) => (
              <Card key={item.id}>
                <div className="flex items-center justify-between gap-3">
                  <StatusBadge status={item.status} />
                  <span className="text-xs font-bold text-slate-500">
                    {item.case_number}
                  </span>
                </div>
                <h2 className="font-bold mt-3">{item.subject}</h2>
                <Button
                  className="mt-3"
                  variant="outline"
                  onClick={() => setCaseId(item.id)}
                >
                  Open conversation
                </Button>
              </Card>
            ))}
            {cases.data?.cases?.length === 0 && (
              <EmptyState
                title="No support cases"
                description="Need help? Start a conversation with DeeToo Support."
              />
            )}
          </ResourceState>

          {caseId && (
            <Card>
              <ResourceState resource={detail}>
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div>
                    <h2 className="font-bold">Conversation</h2>
                    <p className="text-xs text-slate-500">
                      {selectedCase?.case_number}
                    </p>
                  </div>
                  <StatusBadge status={selectedCase?.status} />
                </div>

                {!!participants.length && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {participants.map((participant: any) => (
                      <Badge
                        key={participant.id}
                        variant={
                          ["ACCEPTED", "ACKNOWLEDGED"].includes(
                            participant.confirmation_status,
                          )
                            ? "success"
                            : participant.confirmation_status === "DISPUTED"
                              ? "danger"
                              : "default"
                        }
                      >
                        {(participant.display_name ||
                          participant.participant_type) +
                          " · " +
                          String(participant.confirmation_status)
                            .toLowerCase()
                            .replaceAll("_", " ")}
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="space-y-2">
                  {notes.map((note: any) => (
                    <div
                      className={
                        "p-3 rounded-xl border " +
                        (note.message_type === "RESOLUTION"
                          ? "bg-emerald-50 border-emerald-200"
                          : "bg-stone-50 border-stone-200")
                      }
                      key={note.id}
                    >
                      <div className="text-xs text-slate-500 mb-1">
                        <strong>{note.author_name || "DeeToo"}</strong>
                        {" · "}
                        {new Date(note.created_at).toLocaleString()}
                      </div>
                      <p className="whitespace-pre-wrap">{note.body}</p>
                      {!!note.attachments?.length && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {note.attachments.map((attachment: any) => (
                            <Button
                              key={attachment.id}
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                void openEvidence(attachment.media_object_id)
                              }
                            >
                              View evidence
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {selectedCase?.status === "PARTY_CONFIRMATION" && (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 mt-4">
                    <h3 className="font-bold text-emerald-950">
                      Proposed resolution
                    </h3>
                    <p className="text-sm mt-1 text-emerald-900">
                      {selectedCase.resolution_notes}
                    </p>
                    <FormField label="Optional response">
                      <Textarea
                        value={confirmationNote}
                        onChange={(e) => setConfirmationNote(e.target.value)}
                      />
                    </FormField>
                    <div className="flex flex-wrap gap-2 mt-3">
                      <Button
                        disabled={busy}
                        onClick={() => void confirmResolution(true)}
                      >
                        I accept this resolution
                      </Button>
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => void confirmResolution(false)}
                      >
                        I still have a concern
                      </Button>
                    </div>
                  </div>
                )}

                {selectedCase?.status !== "CLOSED" && (
                  <>
                    <FormField label="Reply">
                      <Textarea
                        value={reply}
                        onChange={(e) => setReply(e.target.value)}
                      />
                    </FormField>
                    <label className="block text-xs text-slate-600 mt-3">
                      Add evidence
                      <input
                        className="block mt-1"
                        type="file"
                        multiple
                        accept="image/jpeg,image/png,image/webp,application/pdf,video/mp4,video/quicktime"
                        onChange={(event) =>
                          setFiles(Array.from(event.target.files || []))
                        }
                      />
                    </label>
                    <Button
                      className="mt-3"
                      disabled={busy || !reply.trim()}
                      onClick={() => void sendReply()}
                    >
                      Send reply
                    </Button>
                  </>
                )}
              </ResourceState>
            </Card>
          )}

          {mode === "customer" && (
            <>
              <h2 className="text-xl font-bold">Notifications</h2>
              <ResourceState resource={notifications}>
                {messages.map((message: any) => (
                  <Card key={message.id}>
                    <h3 className="font-bold">
                      {message.title ||
                        message.subject ||
                        message.template_key}
                    </h3>
                    <p>{message.body || message.message}</p>
                    {!message.read_at && (
                      <Button
                        variant="ghost"
                        onClick={async () => {
                          try {
                            await apiClient.request(
                              "/customer/support/notifications/" +
                                encodeURIComponent(message.id) +
                                "/read",
                              { method: "POST" },
                            );
                            await notifications.refresh();
                          } catch (e) {
                            setError(errorMessage(e));
                          }
                        }}
                      >
                        Mark as read
                      </Button>
                    )}
                  </Card>
                ))}
                {notifications.data && !messages.length && (
                  <p className="text-sm">No notifications.</p>
                )}
              </ResourceState>
            </>
          )}
        </section>

        <Card className="h-fit">
          <h2 className="text-xl font-bold mb-4">Start a conversation</h2>
          <form onSubmit={create} className="space-y-4">
            <FormField label="Subject" required>
              <Input
                required
                minLength={3}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </FormField>
            <FormField label="Order ID (optional)">
              <Input
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
              />
            </FormField>
            <FormField label="Tell us what happened" required>
              <Textarea
                required
                minLength={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </FormField>
            <Button type="submit" isLoading={busy}>
              Create support case
            </Button>
          </form>
        </Card>
      </div>
    </>
  );
}
