import React, { useEffect, useState } from "react";
import { useAuth } from "../../../../packages/auth/src/react";
import {
  Button,
  Card,
  DataTable,
  Drawer,
  EmptyState,
  ErrorState,
  FormField,
  Input,
  Modal,
  SearchInput,
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
  roles?: string[];
}
export interface TableFilter {
  key: string;
  label: string;
  param?: string;
  options: Array<string | { value: string; label: string }>;
  defaultValue?: string;
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
  filters?: TableFilter[];
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
  const { apiClient, hasRole } = useAuth();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      (config.filters || []).map((filter) => [
        filter.key,
        filter.defaultValue || "",
      ]),
    ),
  );
  const suffix = new URLSearchParams();
  if (config.searchable && query) suffix.set("search", query);
  for (const filter of config.filters || []) {
    const value = filters[filter.key];
    if (value) suffix.set(filter.param || filter.key, value);
  }
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
        density="dense"
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
          {config.toolbar
            .filter((action) => !action.roles || action.roles.some((role) => hasRole(role)))
            .map((action) => (
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
      {(config.searchable || config.filters?.length) && (
        <div className="admin-resource-commandbar">
          {config.searchable && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                setPage(1);
                setQuery(search);
              }}
              className="admin-resource-search"
            >
              <SearchInput
                aria-label={`Search ${config.title}`}
                placeholder={`Search ${config.title.toLowerCase()}`}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onClear={() => {
                  setSearch("");
                  setQuery("");
                  setPage(1);
                }}
              />
              <Button type="submit">Search</Button>
            </form>
          )}

          {config.filters?.map((filter) => (
            <label className="admin-resource-filter" key={filter.key}>
              <span>{filter.label}</span>
              <Select
                aria-label={filter.label}
                value={filters[filter.key] || ""}
                onChange={(event) => {
                  setFilters((current) => ({
                    ...current,
                    [filter.key]: event.target.value,
                  }));
                  setPage(1);
                }}
              >
                <option value="">All</option>
                {filter.options.map((option) => {
                  const value =
                    typeof option === "string" ? option : option.value;
                  const label =
                    typeof option === "string"
                      ? option.toLowerCase().replaceAll("_", " ")
                      : option.label;
                  return (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  );
                })}
              </Select>
            </label>
          ))}

          <div className="admin-resource-command-meta">
            <strong>{list.length}</strong>
            <span>{config.pageable ? `records on page ${page}` : "records"}</span>
          </div>
        </div>
      )}
      <ResourceState resource={resource}>
        <DataTable<any>
          density="dense"
          rows={list}
          rowKey={(row) =>
            String(
              row.id ||
                row.order_number ||
                row.reference_id ||
                list.indexOf(row),
            )
          }
          empty={
            <EmptyState
              title="No records"
              description="No records match this view."
            />
          }
          selectedRowKey={
            detailRow
              ? String(
                  detailRow.id ||
                    detailRow.order_number ||
                    detailRow.reference_id ||
                    list.indexOf(detailRow),
                )
              : null
          }
          onRowClick={config.detail ? (row) => setDetailRow(row) : undefined}
          columns={[
            ...config.columns.map((column) => ({
              key: column.key,
              label: column.label,
              render: (row: any) =>
                column.money && typeof row[column.key] === "number" ? (
                  <Price minor={row[column.key]} />
                ) : column.key.includes("status") ? (
                  <StatusBadge status={row[column.key]} />
                ) : (
                  String(row[column.key] ?? "—")
                ),
            })),
            {
              key: "__actions",
              label: "Actions",
              render: (row: any) => (
                <div className="flex flex-wrap gap-2">
                  {config.detail && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(event) => {
                        event.stopPropagation();
                        setDetailRow(row);
                      }}
                    >
                      Inspect
                    </Button>
                  )}
                  {config.actions
                    ?.filter(
                      (action) =>
                        !action.roles ||
                        action.roles.some((role) => hasRole(role)),
                    )
                    .filter((action) => !action.when || action.when(row))
                    .map((action) => (
                      <Button
                        key={action.label}
                        variant="outline"
                        size="sm"
                        disabled={busy || Boolean(resource.error)}
                        onClick={(event) => {
                          event.stopPropagation();
                          setTarget({ row, action });
                          setValues({});
                          setError(null);
                        }}
                      >
                        {action.label}
                      </Button>
                    ))}
                </div>
              ),
            },
          ]}
        />
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
      <Drawer
        isOpen={Boolean(detailRow)}
        onClose={() => setDetailRow(null)}
        title="Record details"
        description={
          detailRow
            ? String(
                detailRow.order_number ||
                  detailRow.name ||
                  detailRow.reference_id ||
                  detailRow.id ||
                  "Selected record",
              )
            : undefined
        }
        side="right"
        size="lg"
      >
        {config.detail ? (
          <>
            <RecordDetails value={detailRow} />
            <ResourceState resource={details} compact>
              {details.data && <RecordDetails value={details.data} />}
            </ResourceState>
          </>
        ) : (
          <RecordDetails value={detailRow} />
        )}
      </Drawer>
    </>
  );
}
