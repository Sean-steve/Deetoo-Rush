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
export function AccountSupport() {
  const { apiClient } = useAuth();
  const cases = useResource<any>("/customer/support/cases");
  const notifications = useResource<any>("/customer/support/notifications");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [orderId, setOrderId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [caseId, setCaseId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const detail = useResource<any>(
    caseId ? `/customer/support/cases/${encodeURIComponent(caseId)}` : null,
  );
  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiClient.request("/customer/support/cases", {
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
      <div className="workflow-grid">
        <section className="space-y-4">
          <ResourceState resource={cases}>
            {cases.data?.cases?.map((item: any) => (
              <Card key={item.id}>
                <StatusBadge status={item.status} />
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
                description="Need help? Send us the details."
              />
            )}
          </ResourceState>
          {caseId && (
            <Card>
              <ResourceState resource={detail}>
                <h2 className="font-bold mb-3">Conversation</h2>
                {(detail.data?.notes || []).map((note: any) => (
                  <p className="p-3 bg-stone-50 rounded-xl mb-2" key={note.id}>
                    {note.body}
                  </p>
                ))}
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
                      await apiClient.request(
                        `/customer/support/cases/${encodeURIComponent(caseId)}/notes`,
                        {
                          method: "POST",
                          body: JSON.stringify({ body: reply }),
                        },
                      );
                      setReply("");
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
        </section>
        <Card className="h-fit">
          <h2 className="text-xl font-bold mb-4">How can we help?</h2>
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
