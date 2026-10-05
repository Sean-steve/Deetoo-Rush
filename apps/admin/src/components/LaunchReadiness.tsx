import React, { useState } from "react";
import { useAuth } from "../../../../packages/auth/src/react";
import { Button, Card, FormField, Input, Modal, Select } from "../../../../packages/ui/src/index";
import { PageHeading, ResourceState, StatusBadge, useResource, errorMessage } from "../../../../packages/ui/src/workflows";

export function LaunchReadiness() {
  const { apiClient, hasRole } = useAuth();
  const readiness = useResource<any>("/admin/operations/launch-readiness", 15000);
  const [selected, setSelected] = useState<any | null>(null);
  const [status, setStatus] = useState("PASSED");
  const [evidence, setEvidence] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canUpdate = hasRole("admin" as any);

  async function saveGate() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await apiClient.request(
        `/admin/operations/launch-readiness/${encodeURIComponent(selected.gate_key)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            status,
            evidence_reference: evidence || undefined,
            note: note || undefined,
          }),
        },
      );
      setSelected(null);
      setEvidence("");
      setNote("");
      await readiness.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeading
        title="Production launch readiness"
        eyebrow="Code readiness is not production certification"
        action={<Button variant="outline" onClick={readiness.refresh}>Refresh gates</Button>}
      />
      {error && <p className="mb-4 text-sm text-rose-700">{error}</p>}
      <ResourceState resource={readiness}>
        {readiness.data && (
          <div className="space-y-6">
            <Card>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold">Launch decision</h2>
                  <p className="text-sm text-slate-600">
                    All automatic configuration checks and all evidence gates must pass.
                  </p>
                </div>
                <StatusBadge status={readiness.data.ready ? "READY" : "BLOCKED"} />
              </div>
              {!readiness.data.ready && (
                <div className="rounded-xl bg-rose-50 p-4 text-sm text-rose-900">
                  {readiness.data.blockers?.join(" · ")}
                </div>
              )}
            </Card>

            <Card>
              <h2 className="text-xl font-bold mb-4">Automatic configuration</h2>
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {Object.entries(readiness.data.automatic || {}).map(([key, ok]) => (
                  <div className="rounded-xl bg-stone-50 p-3 flex items-center justify-between" key={key}>
                    <span className="text-sm">{key.replaceAll("_", " ")}</span>
                    <StatusBadge status={ok ? "PASSED" : "BLOCKED"} />
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <h2 className="text-xl font-bold mb-4">Certification evidence</h2>
              <div className="space-y-3">
                {(readiness.data.gates || []).map((gate: any) => (
                  <div key={gate.gate_key} className="rounded-xl border border-stone-200 p-4 flex flex-wrap gap-3 items-center justify-between">
                    <div>
                      <strong>{gate.gate_key.replaceAll("_", " ")}</strong>
                      <p className="text-xs text-slate-600 mt-1">
                        {gate.evidence_reference || "No evidence recorded"}
                      </p>
                      {gate.note && <p className="text-xs mt-1">{gate.note}</p>}
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={gate.status} />
                      {canUpdate && (
                        <Button
                          variant="outline"
                          onClick={() => {
                            setSelected(gate);
                            setStatus(gate.status === "PASSED" ? "PASSED" : "BLOCKED");
                            setEvidence(gate.evidence_reference || "");
                            setNote(gate.note || "");
                          }}
                        >
                          Review
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}
      </ResourceState>

      <Modal
        isOpen={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected ? selected.gate_key.replaceAll("_", " ") : "Launch gate"}
      >
        <div className="space-y-4">
          <FormField label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="PASSED">PASSED</option>
              <option value="BLOCKED">BLOCKED</option>
              <option value="PENDING">PENDING</option>
            </Select>
          </FormField>
          <FormField label="Evidence reference">
            <Input value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="Ticket, report, run ID, or evidence URL" />
          </FormField>
          <FormField label="Note">
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </FormField>
          <Button onClick={saveGate} isLoading={busy}>Save launch gate</Button>
        </div>
      </Modal>
    </>
  );
}
