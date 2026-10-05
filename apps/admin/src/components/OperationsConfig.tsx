import React, { useState } from "react";
import { DispatchConfigUpdateSchema } from "@deetoo/validation";
import { useAuth } from "../../../../packages/auth/src/react";
import {
  Button,
  Card,
  ErrorState,
  FormField,
  Input,
} from "../../../../packages/ui/src/index";
import {
  errorMessage,
  PageHeading,
  ResourceState,
  useResource,
} from "../../../../packages/ui/src/workflows";
export function OperationsConfig() {
  const { apiClient } = useAuth();
  const config = useResource<any>("/admin/dispatch/config");
  const switches = useResource<any>("/admin/operations/kill-switches");
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fields = [
    ["initialSearchRadius", "Initial search radius (m)"],
    ["maxSearchRadius", "Maximum search radius (m)"],
    ["offerTimeoutSeconds", "Offer timeout (seconds)"],
    ["maxOffersPerCycle", "Offers per dispatch cycle"],
    ["dispatchSlaSeconds", "Dispatch SLA (seconds)"],
  ];
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const input = Object.fromEntries(
        Object.entries(values).map(([k, v]) => [k, Number(v)]),
      );
      const result = DispatchConfigUpdateSchema.safeParse(input);
      if (!result.success)
        throw new Error(result.error.issues.map((i) => i.message).join(" "));
      await apiClient.request("/admin/dispatch/config", {
        method: "PUT",
        body: JSON.stringify(result.data),
      });
      await config.refresh();
      setValues({});
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeading title="Dispatch configuration & controls" />
      {error && <ErrorState message={error} />}
      <ResourceState resource={config}>
        {config.data && (
          <Card>
            <form onSubmit={save} className="grid sm:grid-cols-2 gap-4">
              {fields.map(([key, label]) => (
                <FormField key={key} label={label}>
                  <Input
                    type="number"
                    min="1"
                    value={values[key] ?? String(config.data[key] ?? "")}
                    onChange={(e) =>
                      setValues({ ...values, [key]: e.target.value })
                    }
                  />
                </FormField>
              ))}
              <Button
                type="submit"
                disabled={busy || !Object.keys(values).length}
                isLoading={busy}
              >
                Save configuration
              </Button>
            </form>
          </Card>
        )}
      </ResourceState>
      <h2 className="text-xl font-bold my-5">Operational controls</h2>
      <ResourceState resource={switches}>
        {switches.data && (
          <div className="grid gap-4">
            {Object.entries(switches.data).map(
              ([key, value]: [string, any]) => (
                <Card key={key}>
                  <div className="flex justify-between items-center gap-4">
                    <div>
                      <h3 className="font-bold">{key.replaceAll("_", " ")}</h3>
                      <p className="text-sm">{value.description}</p>
                    </div>
                    <Button
                      variant={value.enabled ? "danger" : "outline"}
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        setError(null);
                        try {
                          await apiClient.request(
                            "/admin/operations/kill-switches",
                            {
                              method: "POST",
                              body: JSON.stringify({
                                keyName: key,
                                enabled: !value.enabled,
                                description: value.description,
                              }),
                            },
                          );
                          await switches.refresh();
                        } catch (e) {
                          setError(errorMessage(e));
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      {value.enabled ? "Disable control" : "Enable control"}
                    </Button>
                  </div>
                </Card>
              ),
            )}
          </div>
        )}
      </ResourceState>
    </>
  );
}
