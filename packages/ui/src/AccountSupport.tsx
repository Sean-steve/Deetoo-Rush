import React, { useState } from "react";
import { useAuth } from "../../auth/src/react";
import {
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
export function AccountSupport({
  mode = "customer",
}: {
  mode?: "customer" | "participant";
}) {
  const { apiClient } = useAuth();
  const supportBase = mode === "customer" ? "/customer/support" : "/support";
  const cases = useResource<any>(`${supportBase}/cases`);
  const notifications = useResource<any>(
    mode === "customer" ? "/customer/support/notifications" : null,
  );
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [orderId, setOrderId] = useState("");
  const [caseKind, setCaseKind] = useState<"SUPPORT" | "DISPUTE">("SUPPORT");
  const [extraPaymentOrderId, setExtraPaymentOrderId] = useState("");
  const [extraPaymentRequested, setExtraPaymentRequested] = useState("");
  const [extraPaymentDescription, setExtraPaymentDescription] = useState("");
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [caseId, setCaseId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const detail = useResource<any>(
    caseId ? `${supportBase}/cases/${encodeURIComponent(caseId)}` : null,
  );

  const uploadEvidence = async (targetCaseId: string, selected: File[]) => {
    const mediaIds: string[] = [];
    for (const file of selected) {
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
        throw new Error("Support evidence upload could not be prepared.");
      }
      const upload = await fetch(media.upload_url, {
        method: "PUT",
        headers: media.upload_headers || { "content-type": file.type },
        body: file,
      });
      if (!upload.ok) throw new Error(`Evidence upload failed (HTTP ${upload.status}).`);
      await apiClient.request(`/media/uploads/${encodeURIComponent(media.media_id)}/complete`, {
        method: "POST",
      });
      mediaIds.push(media.media_id);
    }
    return mediaIds;
  };
  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setActionMessage(null);
    try {
      const created =
        caseKind === "DISPUTE"
          ? await apiClient.request<any>("/trust/disputes", {
              method: "POST",
              body: JSON.stringify({
                subject,
                description,
                category: "DISPUTE",
                allegation_code: "PARTICIPANT_DISPUTE",
                ...(orderId ? { order_id: orderId } : {}),
              }),
            })
          : await apiClient.request<any>(`${supportBase}/cases`, {
              method: "POST",
              body: JSON.stringify({
                subject,
                description,
                category: "ORDER_ISSUE",
                ...(orderId ? { order_id: orderId } : {}),
              }),
            });
      const createdCaseId =
        caseKind === "DISPUTE"
          ? created.data?.support_case?.id
          : created.data?.id;
      const createdTrustCaseId =
        caseKind === "DISPUTE" ? created.data?.trust_case?.id : null;
      if (createdCaseId && files.length) {
        const mediaIds = await uploadEvidence(createdCaseId, files);
        await apiClient.request(
          mode === "customer"
            ? `/customer/support/cases/${encodeURIComponent(createdCaseId)}/notes`
            : `/support/cases/${encodeURIComponent(createdCaseId)}/messages`,
          {
            method: "POST",
            body: JSON.stringify({
              body: "Evidence attached to this case.",
              media_ids: mediaIds,
            }),
          },
        );
        if (createdTrustCaseId) {
          for (const mediaId of mediaIds) {
            await apiClient.request(
              `/trust/disputes/${encodeURIComponent(createdTrustCaseId)}/evidence`,
              {
                method: "POST",
                body: JSON.stringify({
                  evidence_type: "DOCUMENT",
                  media_object_id: mediaId,
                  summary: "Participant-supplied dispute evidence",
                }),
              },
            );
          }
        }
      }
      setSubject("");
      setDescription("");
      setFiles([]);
      setCaseKind("SUPPORT");
      if (createdCaseId) setCaseId(createdCaseId);
      setActionMessage(
        caseKind === "DISPUTE"
          ? "Dispute opened with evidence snapshots and a shared support conversation."
          : "Support case created.",
      );
      await cases.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const reportExtraPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setActionMessage(null);
    try {
      const requestedMinor = Math.round(Number(extraPaymentRequested) * 100);
      if (!extraPaymentOrderId.trim() || !Number.isSafeInteger(requestedMinor) || requestedMinor < 0) {
        throw new Error("Enter an order ID and a valid amount requested by the Rider.");
      }
      const created = await apiClient.request<any>("/trust/conduct/extra-payment", {
        method: "POST",
        body: JSON.stringify({
          order_id: extraPaymentOrderId.trim(),
          requested_amount_minor: requestedMinor,
          description: extraPaymentDescription.trim() || undefined,
        }),
      });
      const supportCaseId = created.data?.support_case?.id;
      const due = Number(created.data?.conduct_report?.authoritative_amount_minor || 0);
      setExtraPaymentOrderId("");
      setExtraPaymentRequested("");
      setExtraPaymentDescription("");
      if (supportCaseId) setCaseId(supportCaseId);
      setActionMessage(
        `Report created. DeeToo's recorded amount due at handover was KES ${(due / 100).toFixed(2)}. The allegation requires human review.`,
      );
      await cases.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const messages = Array.isArray(notifications.data)
    ? notifications.data
    : notifications.data?.notifications || [];
  return (
    <>
      <PageHeading title="Support & notifications" />
      {error && <ErrorState message={error} />}
      {actionMessage && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          {actionMessage}
        </div>
      )}
      <div className="workflow-grid">
        <section className="space-y-4">
          <ResourceState resource={cases}>
            {cases.data?.cases?.map((item: any) => (
              <Card key={item.id}>
                <StatusBadge status={item.status} />
                <h2 className="font-bold mt-3">{item.subject}</h2>
                <div className="mt-3">
                  <input
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,application/pdf"
                    onChange={(e) => setFiles(Array.from(e.target.files || []))}
                    className="block w-full text-xs text-slate-500 mb-3"
                  />
                </div>
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
                description="Need help? Send us the details."
              />
            )}
          </ResourceState>
          {caseId && (
            <Card>
              <ResourceState resource={detail}>
                <h2 className="font-bold mb-3">Conversation</h2>
                {(detail.data?.notes || []).map((note: any) => (
                  <div
                    className={
                      "p-3 rounded-xl mb-2 border " +
                      (note.visibility === "INTERNAL"
                        ? "bg-amber-50 border-amber-200"
                        : note.message_type === "RESOLUTION"
                          ? "bg-emerald-50 border-emerald-200"
                          : "bg-stone-50 border-stone-100")
                    }
                    key={note.id}
                  >
                    <div className="text-[11px] font-semibold text-slate-500 mb-1">
                      {note.author_name || note.author_role || "Support"} ·{" "}
                      {note.message_type === "RESOLUTION" ? "Proposed resolution" : "Message"}
                    </div>
                    <p className="text-sm">{note.body}</p>
                  </div>
                ))}
                {(detail.data?.attachments || []).length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-semibold text-slate-500 mb-2">Evidence</p>
                    <div className="flex flex-wrap gap-2">
                      {(detail.data.attachments || []).map((attachment: any, index: number) => (
                        <Button
                          key={attachment.id}
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            try {
                              const result = await apiClient.request<any>(
                                `${supportBase}/cases/${encodeURIComponent(caseId!)}/attachments/${encodeURIComponent(attachment.media_object_id)}/read-url`,
                              );
                              if (result.data?.url) window.open(result.data.url, "_blank", "noopener,noreferrer");
                            } catch (e) {
                              setError(errorMessage(e));
                            }
                          }}
                        >
                          View evidence {index + 1}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
                {["RESOLUTION_PROPOSED", "PARTY_CONFIRMATION"].includes(detail.data?.case?.status) && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 mb-4">
                    <p className="font-bold text-emerald-950">Support has proposed a resolution</p>
                    <p className="text-sm text-emerald-900 mt-1">
                      {detail.data?.case?.resolution_notes || "Review the conversation and tell us if this resolves the issue."}
                    </p>
                    <div className="flex flex-wrap gap-2 mt-3">
                      <Button
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          try {
                            await apiClient.request(
                              `${supportBase}/cases/${encodeURIComponent(caseId!)}/resolution-response`,
                              { method: "POST", body: JSON.stringify({ decision: "ACCEPTED" }) },
                            );
                            await detail.refresh();
                            await cases.refresh();
                          } catch (e) { setError(errorMessage(e)); }
                          finally { setBusy(false); }
                        }}
                      >
                        I’m satisfied
                      </Button>
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          try {
                            await apiClient.request(
                              `${supportBase}/cases/${encodeURIComponent(caseId!)}/resolution-response`,
                              {
                                method: "POST",
                                body: JSON.stringify({
                                  decision: "DISPUTED",
                                  comment: reply.trim() || "I still need help with this case.",
                                }),
                              },
                            );
                            setReply("");
                            await detail.refresh();
                            await cases.refresh();
                          } catch (e) { setError(errorMessage(e)); }
                          finally { setBusy(false); }
                        }}
                      >
                        I still need help
                      </Button>
                    </div>
                  </div>
                )}
                <FormField label="Reply">
                  <Textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                  />
                </FormField>
                <Button
                  className="mt-3"
                  disabled={busy || !reply.trim()}
                  onClick={async () => {
                    setBusy(true);
                    setError(null);
                    try {
                      const mediaIds = files.length
                        ? await uploadEvidence(caseId, files)
                        : [];
                      await apiClient.request(
                        mode === "customer"
                          ? `/customer/support/cases/${encodeURIComponent(caseId)}/notes`
                          : `/support/cases/${encodeURIComponent(caseId)}/messages`,
                        {
                          method: "POST",
                          body: JSON.stringify({ body: reply, media_ids: mediaIds }),
                        },
                      );
                      setReply("");
                      setFiles([]);
                      await detail.refresh();
                    } catch (e) {
                      setError(errorMessage(e));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Send reply
                </Button>
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
                      {message.title || message.subject || message.template_key}
                    </h3>
                    <p>{message.body || message.message}</p>
                    {!message.read_at && (
                      <Button
                        variant="ghost"
                        onClick={async () => {
                          try {
                            await apiClient.request(
                              `/customer/support/notifications/${encodeURIComponent(message.id)}/read`,
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
          <h2 className="text-xl font-bold mb-4">How can we help?</h2>
          <form onSubmit={create} className="space-y-4">
            <FormField label="Case type" required>
              <select
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                value={caseKind}
                onChange={(e) => setCaseKind(e.target.value as "SUPPORT" | "DISPUTE")}
              >
                <option value="SUPPORT">Support request</option>
                <option value="DISPUTE">Formal dispute</option>
              </select>
            </FormField>
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
            <FormField label="Evidence (optional)">
              <input
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,application/pdf"
                onChange={(e) => setFiles(Array.from(e.target.files || []))}
                className="block w-full text-xs text-slate-500"
              />
            </FormField>
            <Button type="submit" isLoading={busy}>
              {caseKind === "DISPUTE" ? "Open dispute" : "Create support case"}
            </Button>
          </form>

          {mode === "customer" && (
            <div className="mt-6 border-t border-slate-200 pt-5">
              <h3 className="font-bold text-slate-900">Report extra payment request</h3>
              <p className="mt-1 text-xs text-slate-500">
                Use this when a Rider asks for money outside the amount shown by DeeToo. The report creates an evidence-backed conduct case; enforcement remains human-reviewed.
              </p>
              <form onSubmit={reportExtraPayment} className="mt-4 space-y-3">
                <FormField label="Order ID" required>
                  <Input
                    required
                    value={extraPaymentOrderId}
                    onChange={(e) => setExtraPaymentOrderId(e.target.value)}
                  />
                </FormField>
                <FormField label="Amount Rider requested (KES)" required>
                  <Input
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    value={extraPaymentRequested}
                    onChange={(e) => setExtraPaymentRequested(e.target.value)}
                  />
                </FormField>
                <FormField label="What happened?">
                  <Textarea
                    value={extraPaymentDescription}
                    onChange={(e) => setExtraPaymentDescription(e.target.value)}
                  />
                </FormField>
                <Button type="submit" variant="outline" isLoading={busy}>
                  Report extra payment request
                </Button>
              </form>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
