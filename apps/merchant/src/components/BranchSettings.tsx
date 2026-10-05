import React, { useEffect, useState } from "react";
import {
  UpdateBranchSchema,
  BatchOpeningHoursSchema,
} from "@deetoo/validation";
import { useAuth } from "../../../../packages/auth/src/react";
import {
  Button,
  Card,
  ErrorState,
  FormField,
  Input,
  Select,
} from "../../../../packages/ui/src/index";
import {
  errorMessage,
  PageHeading,
  ResourceState,
  useResource,
} from "../../../../packages/ui/src/workflows";
export function BranchSettings({
  branchId,
  canManage,
  onChanged,
}: {
  branchId: string;
  canManage: boolean;
  onChanged: () => void;
}) {
  const { apiClient } = useAuth();
  const path = `/merchant/branches/${encodeURIComponent(branchId)}`;
  const branch = useResource<any>(path);
  const schedule = useResource<any[]>(path + "/opening-hours");
  const [fields, setFields] = useState({
    name: "",
    address_line1: "",
    phone: "",
    prep_default_min: "",
    min_order_minor: "",
  });
  const [hours, setHours] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState("");
  useEffect(() => {
    if (branch.data)
      setFields({
        name: branch.data.name,
        address_line1: branch.data.address_line1,
        phone: branch.data.phone || "",
        prep_default_min: String(branch.data.prep_default_min),
        min_order_minor: String(branch.data.min_order_minor),
      });
  }, [branch.data]);
  useEffect(() => {
    if (schedule.data) setHours(schedule.data.map((h) => ({ ...h })));
  }, [schedule.data]);
  async function save(
    endpoint: string,
    method: string,
    payload: any,
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
      await apiClient.request(endpoint, {
        method,
        body: JSON.stringify(parsed.data),
      });
      await Promise.all([branch.refresh(), schedule.refresh()]);
      onChanged();
      setSaved("Branch settings saved.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      <PageHeading title="Branch settings" />
      {error && <ErrorState message={error} />}
      <p role="status">{saved}</p>
      <ResourceState resource={branch}>
        {branch.data && (
          <Card>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void save(
                  path,
                  "PATCH",
                  {
                    ...fields,
                    phone: fields.phone || undefined,
                    prep_default_min: Number(fields.prep_default_min),
                    min_order_minor: Number(fields.min_order_minor),
                  },
                  UpdateBranchSchema,
                );
              }}
            >
              {Object.entries(fields).map(([key, value]) => (
                <FormField
                  key={key}
                  label={
                    {
                      name: "Branch name",
                      address_line1: "Street address",
                      phone: "Phone",
                      prep_default_min: "Default preparation (minutes)",
                      min_order_minor: "Minimum order (minor units)",
                    }[key]
                  }
                >
                  <Input
                    disabled={!canManage}
                    value={value}
                    type={
                      key.endsWith("_min") || key.endsWith("_minor")
                        ? "number"
                        : "text"
                    }
                    onChange={(e) =>
                      setFields({ ...fields, [key]: e.target.value })
                    }
                  />
                </FormField>
              ))}
              {canManage && (
                <Button type="submit" isLoading={busy}>
                  Save branch
                </Button>
              )}
            </form>
          </Card>
        )}
      </ResourceState>
      <ResourceState resource={schedule}>
        <Card>
          <h2 className="text-xl font-bold mb-4">
            Opening hours · {branch.data?.timezone}
          </h2>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void save(
                path + "/opening-hours",
                "PUT",
                hours,
                BatchOpeningHoursSchema,
              );
            }}
          >
            {hours.map((hour, i) => (
              <fieldset
                key={hour.id || i}
                className="flex flex-wrap gap-3 items-end"
              >
                <legend className="sr-only">Opening interval {i + 1}</legend>
                <FormField label="Day">
                  <Select
                    disabled={!canManage}
                    value={hour.day_of_week}
                    onChange={(e) =>
                      setHours(
                        hours.map((h, j) =>
                          i === j
                            ? { ...h, day_of_week: Number(e.target.value) }
                            : h,
                        ),
                      )
                    }
                  >
                    {[
                      "Sunday",
                      "Monday",
                      "Tuesday",
                      "Wednesday",
                      "Thursday",
                      "Friday",
                      "Saturday",
                    ].map((day, d) => (
                      <option key={day} value={d}>
                        {day}
                      </option>
                    ))}
                  </Select>
                </FormField>
                {["open_time", "close_time"].map((key) => (
                  <FormField
                    key={key}
                    label={key === "open_time" ? "Opens" : "Closes"}
                  >
                    <Input
                      type="time"
                      disabled={!canManage || hour.is_closed}
                      value={hour[key]}
                      onChange={(e) =>
                        setHours(
                          hours.map((h, j) =>
                            i === j ? { ...h, [key]: e.target.value } : h,
                          ),
                        )
                      }
                    />
                  </FormField>
                ))}
                <label className="flex items-center gap-2 min-h-11">
                  <input
                    type="checkbox"
                    disabled={!canManage}
                    checked={hour.is_closed}
                    onChange={(e) =>
                      setHours(
                        hours.map((h, j) =>
                          i === j ? { ...h, is_closed: e.target.checked } : h,
                        ),
                      )
                    }
                  />
                  Closed
                </label>
                {canManage && (
                  <Button
                    variant="ghost"
                    onClick={() => setHours(hours.filter((_, j) => j !== i))}
                  >
                    Remove interval {i + 1}
                  </Button>
                )}
              </fieldset>
            ))}
            {canManage && (
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() =>
                    setHours([
                      ...hours,
                      {
                        day_of_week: 0,
                        open_time: "09:00",
                        close_time: "17:00",
                        is_closed: false,
                      },
                    ])
                  }
                >
                  Add interval
                </Button>
                <Button
                  type="submit"
                  isLoading={busy}
                  disabled={Boolean(schedule.error)}
                >
                  Save opening hours
                </Button>
              </div>
            )}
          </form>
        </Card>
      </ResourceState>
    </div>
  );
}
