import React, { useEffect, useState } from "react";
import { useAuth } from "../../../../packages/auth/src/react";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  FormField,
  Input,
  Modal,
  Price,
  Select,
} from "../../../../packages/ui/src/index";
import {
  errorMessage,
  PageHeading,
  ResourceState,
  StatusBadge,
  useResource,
} from "../../../../packages/ui/src/workflows";
export interface Field {
  key: string;
  label: string;
  type?: "number" | "text" | "date";
  options?: string[];
  optionsEndpoint?: (row: any) => string;
  required?: boolean;
}
export interface RowAction {
  label: string;
  endpoint: (row: any) => string;
  method?: "POST" | "PATCH" | "PUT";
  fields?: Field[];
  body?: Record<string, unknown>;
  when?: (row: any) => boolean;
  schema?: { safeParse: (value: unknown) => any };
}
export interface TableConfig {
  title: string;
  endpoint: string;
  listKey?: string;
  columns: Array<{ key: string; label: string; money?: boolean }>;
  actions?: RowAction[];
  toolbar?: RowAction[];
  detail?: (row: any) => string;
  pageable?: boolean;
  offsetPaging?: boolean;
  refreshInterval?: number;
  searchable?: boolean;
}
export function RecordDetails({ value }: { value: any }) {
  if (value == null) return <span>—</span>;
  if (Array.isArray(value))
    return (
      <div className="space-y-3">
        {value.map((v, i) => (
          <Card key={v?.id || i}>
            <RecordDetails value={v} />
          </Card>
        ))}
      </div>
    );
  if (typeof value === "object")
    return (
      <dl className="record-details">
        {Object.entries(value)
          .filter(
            ([key]) => !/(password|token|secret|signature_data)/i.test(key),
          )
          .map(([key, v]) => (
            <div key={key}>
              <dt>
                {key.replaceAll("_", " ").replace(/([a-z])([A-Z])/g, "$1 $2")}
              </dt>
              <dd>
                {key.endsWith("_minor") && typeof v === "number" ? (
                  <Price minor={v} />
                ) : typeof v === "object" ? (
                  <RecordDetails value={v} />
                ) : (
                  String(v ?? "—")
                )}
              </dd>
            </div>
          ))}
      </dl>
    );
  return <span>{String(value)}</span>;
}
export function ResourceTable({ config }: { config: TableConfig }) {
  const { apiClient } = useAuth();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const suffix = new URLSearchParams();
  if (config.searchable && query) suffix.set("search", query);
  if (config.pageable) {
    suffix.set("page", String(page));
    suffix.set("limit", "20");
    if (config.offsetPaging) suffix.set("offset", String((page - 1) * 20));
  }
  const path =
    config.endpoint +
    (suffix.size
      ? (config.endpoint.includes("?") ? "&" : "?") + suffix.toString()
      : "");
  const resource = useResource<any>(path, config.refreshInterval || 0);
  const rows: any[] = resource.data
    ? config.listKey
      ? resource.data[config.listKey]
      : resource.data
    : [];
  const list = Array.isArray(rows) ? rows : [];
  const [target, setTarget] = useState<{ row: any; action: RowAction } | null>(
    null,
  );
  const [values, setValues] = useState<Record<string, string>>({});
  const [remoteOptions, setRemoteOptions] = useState<
    Record<string, Array<{ value: string; label: string }>>
  >({});
  const [optionsLoading, setOptionsLoading] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailRow, setDetailRow] = useState<any>(null);
  const details = useResource<any>(
    detailRow && config.detail ? config.detail(detailRow) : null,
  );

  useEffect(() => {
    let cancelled = false;
    async function loadRemoteOptions() {
      if (!target) {
        setRemoteOptions({});
        setOptionsLoading({});
        return;
      }

      const fields = (target.action.fields || []).filter(
        (field) => field.optionsEndpoint,
      );
      if (!fields.length) {
        setRemoteOptions({});
        setOptionsLoading({});
        return;
      }

      await Promise.all(
        fields.map(async (field) => {
          const endpoint = field.optionsEndpoint!(target.row);
          setOptionsLoading((current) => ({ ...current, [field.key]: true }));
          try {
            const response = await apiClient.request<any>(endpoint);
            const options = Array.isArray(response?.data) ? response.data : [];
            if (!cancelled) {
              setRemoteOptions((current) => ({
                ...current,
                [field.key]: options.map((option: any) => ({
                  value: String(option.value),
                  label: String(option.label || option.value),
                })),
              }));
            }
          } catch (e) {
            if (!cancelled) setError(errorMessage(e));
          } finally {
            if (!cancelled) {
              setOptionsLoading((current) => ({
                ...current,
                [field.key]: false,
              }));
            }
          }
        }),
      );
    }
    void loadRemoteOptions();
    return () => {
      cancelled = true;
    };
  }, [apiClient, target]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { ...target.action.body };
      for (const field of target.action.fields || []) {
        if (values[field.key])
          body[field.key] =
            field.type === "number"
              ? Number(values[field.key])
              : values[field.key];
      }
      const parsed = target.action.schema?.safeParse(body);
      if (parsed && !parsed.success)
        throw new Error(
          parsed.error.issues.map((i: any) => i.message).join(" "),
        );
      await apiClient.request(target.action.endpoint(target.row), {
        method: target.action.method || "POST",
        body: JSON.stringify(parsed?.data || body),
      });
      setTarget(null);
      await resource.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        title={config.title}
        action={
          <Button
            variant="outline"
            isLoading={resource.loading}
            onClick={resource.refresh}
          >
            Refresh
          </Button>
        }
      />
      {config.toolbar && (
        <div className="flex gap-3 mb-4">
          {config.toolbar.map((action) => (
            <Button
              key={action.label}
              onClick={() => {
                setTarget({ row: {}, action });
                setValues({});
                setError(null);
              }}
            >
              {action.label}
            </Button>
          ))}
        </div>
      )}
      {config.searchable && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setQuery(search);
          }}
          className="flex gap-3 mb-4"
        >
          <Input
            aria-label={`Search ${config.title}`}
            placeholder={`Search ${config.title.toLowerCase()}`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button type="submit">Search</Button>
        </form>
      )}
      <ResourceState resource={resource}>
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {config.columns.map((c) => (
                  <th key={c.key}>{c.label}</th>
                ))}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.map((row, i) => (
                <tr key={row.id || i}>
                  {config.columns.map((c) => (
                    <td key={c.key}>
                      {c.money && typeof row[c.key] === "number" ? (
                        <Price minor={row[c.key]} />
                      ) : c.key.includes("status") ? (
                        <StatusBadge status={row[c.key]} />
                      ) : (
                        String(row[c.key] ?? "—")
                      )}
                    </td>
                  ))}
                  <td>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDetailRow(row)}
                      >
                        Details
                      </Button>
                      {config.actions
                        ?.filter((a) => !a.when || a.when(row))
                        .map((action) => (
                          <Button
                            key={action.label}
                            variant="outline"
                            size="sm"
                            disabled={busy || Boolean(resource.error)}
                            onClick={() => {
                              setTarget({ row, action });
                              setValues({});
                              setError(null);
                            }}
                          >
                            {action.label}
                          </Button>
                        ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!resource.loading && !resource.error && !list.length && (
            <EmptyState
              title="No records"
              description="No records match this view."
            />
          )}
        </div>
        {config.pageable && (
          <div className="flex justify-between items-center mt-4">
            <Button
              variant="outline"
              disabled={page === 1 || resource.loading}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <span className="text-sm">
              Page {page} · {list.length} records
            </span>
            <Button
              variant="outline"
              disabled={
                resource.meta?.has_more === false ||
                (resource.meta?.has_more == null && list.length < 20) ||
                resource.loading ||
                Boolean(resource.error)
              }
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </ResourceState>
      <Modal
        isOpen={Boolean(target)}
        onClose={() => !busy && setTarget(null)}
        title={target?.action.label || "Action"}
      >
        {target && (
          <form onSubmit={submit} className="space-y-4">
            <p className="text-sm">
              Record:{" "}
              {target.row.order_number || target.row.name || target.row.id}
            </p>
            {target.action.fields?.map((field) => (
              <FormField
                key={field.key}
                label={field.label}
                required={field.required !== false}
              >
                {field.options || field.optionsEndpoint ? (
                  <Select
                    required={field.required !== false}
                    disabled={Boolean(optionsLoading[field.key])}
                    value={values[field.key] || ""}
                    onChange={(e) =>
                      setValues({ ...values, [field.key]: e.target.value })
                    }
                  >
                    <option value="">
                      {optionsLoading[field.key]
                        ? "Loading available options…"
                        : "Choose…"}
                    </option>
                    {field.options?.map((value) => (
                      <option key={value} value={value}>
                        {value.toLowerCase().replaceAll("_", " ")}
                      </option>
                    ))}
                    {remoteOptions[field.key]?.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    required={field.required !== false}
                    type={field.type || "text"}
                    value={values[field.key] || ""}
                    onChange={(e) =>
                      setValues({ ...values, [field.key]: e.target.value })
                    }
                  />
                )}
              </FormField>
            ))}
            {error && <ErrorState message={error} />}
            <Button type="submit" isLoading={busy}>
              Confirm {target.action.label.toLowerCase()}
            </Button>
          </form>
        )}
      </Modal>
      <Modal
        isOpen={Boolean(detailRow)}
        onClose={() => setDetailRow(null)}
        title="Record details"
        size="xl"
      >
        {config.detail ? (
          <>
            <RecordDetails value={detailRow} />
            <ResourceState resource={details}>
              {details.data && <RecordDetails value={details.data} />}
            </ResourceState>
          </>
        ) : (
          <RecordDetails value={detailRow} />
        )}
      </Modal>
    </>
  );
}
