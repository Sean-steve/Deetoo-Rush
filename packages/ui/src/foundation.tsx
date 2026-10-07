import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Info,
  Search,
  TriangleAlert,
  X,
} from "lucide-react";

export type Density = "comfortable" | "compact" | "dense";

export interface SurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "subtle" | "raised" | "inverse";
  density?: Density;
  padding?: "none" | "sm" | "md" | "lg";
  interactive?: boolean;
}

export function Surface({
  variant = "default",
  density = "comfortable",
  padding = "md",
  interactive = false,
  className = "",
  children,
  ...props
}: SurfaceProps) {
  return (
    <div
      data-density={density}
      data-interactive={interactive || undefined}
      className={`deetoo-surface deetoo-surface-${variant} deetoo-surface-pad-${padding} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export interface ChipProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "aria-pressed"> {
  selected?: boolean;
  count?: number;
  icon?: React.ReactNode;
}

function Chip({
  selected = false,
  count,
  icon,
  className = "",
  children,
  ...props
}: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={`deetoo-chip ${selected ? "is-selected" : ""} ${className}`}
      {...props}
    >
      {icon}
      <span>{children}</span>
      {count != null && <span className="deetoo-chip-count">{count}</span>}
    </button>
  );
}

export const FilterChip = Chip;
export const ChoiceChip = Chip;

export function SegmentedControl({
  value,
  options,
  onChange,
  ariaLabel,
  className = "",
}: {
  value: string;
  options: Array<{ value: string; label: React.ReactNode; icon?: React.ReactNode; disabled?: boolean }>;
  onChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`deetoo-segmented-control ${className}`}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          disabled={option.disabled}
          onClick={() => onChange(option.value)}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function FieldMessage({
  id,
  kind = "hint",
  children,
}: {
  id?: string;
  kind?: "hint" | "error" | "success";
  children: React.ReactNode;
}) {
  return (
    <p
      id={id}
      role={kind === "error" ? "alert" : kind === "success" ? "status" : undefined}
      className={`deetoo-field-message deetoo-field-message-${kind}`}
    >
      {children}
    </p>
  );
}

export interface FileInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
  hint?: string;
  files?: File[];
  onFilesChange?: (files: File[]) => void;
}

export function FileInput({
  label = "Choose files",
  hint,
  files,
  onFilesChange,
  className = "",
  id,
  onChange,
  ...props
}: FileInputProps) {
  const generated = useId();
  const inputId = id || generated;
  const selected = files || [];
  return (
    <div className={`deetoo-file-input ${className}`}>
      <input
        {...props}
        id={inputId}
        type="file"
        className="sr-only"
        onChange={(event) => {
          onChange?.(event);
          onFilesChange?.(Array.from(event.currentTarget.files || []));
        }}
      />
      <label htmlFor={inputId} className="deetoo-file-input-trigger">
        {label}
      </label>
      {hint && <FieldMessage kind="hint">{hint}</FieldMessage>}
      {selected.length > 0 && (
        <ul aria-label="Selected files" className="deetoo-file-input-list">
          {selected.map((file, index) => (
            <li key={`${file.name}-${index}`}>
              <span>{file.name}</span>
              <span>{Math.max(1, Math.round(file.size / 1024))} KB</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export const SearchInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { onClear?: () => void }
>(({ className = "", onClear, value, ...props }, ref) => (
  <div className={`deetoo-search-input ${className}`}>
    <Search size={16} aria-hidden="true" />
    <input ref={ref} value={value} className="deetoo-search-native" {...props} />
    {onClear && String(value || "").length > 0 && (
      <button type="button" onClick={onClear} aria-label="Clear search">
        <X size={16} aria-hidden="true" />
      </button>
    )}
  </div>
));
SearchInput.displayName = "SearchInput";

export function InlineBanner({
  kind = "info",
  title,
  children,
  action,
  onDismiss,
  referenceId,
  className = "",
}: {
  kind?: "info" | "success" | "warning" | "danger";
  title?: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
  onDismiss?: () => void;
  referenceId?: string;
  className?: string;
}) {
  const Icon =
    kind === "success"
      ? CheckCircle2
      : kind === "warning"
        ? TriangleAlert
        : kind === "danger"
          ? AlertCircle
          : Info;
  return (
    <div
      role={kind === "danger" ? "alert" : "status"}
      className={`deetoo-inline-banner deetoo-inline-banner-${kind} ${className}`}
    >
      <Icon size={19} aria-hidden="true" />
      <div className="min-w-0">
        {title && <strong>{title}</strong>}
        <div className="deetoo-inline-banner-body">{children}</div>
        {referenceId && (
          <p className="deetoo-reference-id">Reference: {referenceId}</p>
        )}
        {action && <div className="deetoo-inline-banner-action">{action}</div>}
      </div>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss">
          <X size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export function Snackbar({
  message,
  kind = "success",
  action,
  onDismiss,
}: {
  message: string | null;
  kind?: "success" | "error" | "info";
  action?: React.ReactNode;
  onDismiss: () => void;
}) {
  if (!message) return null;
  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      aria-live={kind === "error" ? "assertive" : "polite"}
      className={`deetoo-snackbar deetoo-snackbar-${kind}`}
    >
      <span>{message}</span>
      {action}
      <button type="button" onClick={onDismiss} aria-label="Dismiss notification">
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

export function ProgressBar({
  value,
  max = 100,
  label,
  showValue = false,
  className = "",
}: {
  value: number;
  max?: number;
  label?: string;
  showValue?: boolean;
  className?: string;
}) {
  const safeMax = Math.max(1, max);
  const safe = Math.min(safeMax, Math.max(0, value));
  const percent = (safe / safeMax) * 100;
  return (
    <div className={`deetoo-progress ${className}`}>
      {(label || showValue) && (
        <div className="deetoo-progress-meta">
          <span>{label}</span>
          {showValue && <strong>{Math.round(percent)}%</strong>}
        </div>
      )}
      <div
        className="deetoo-progress-track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={safe}
      >
        <span style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export function ProgressSteps({
  steps,
  current,
  className = "",
}: {
  steps: Array<{ id: string; label: React.ReactNode; description?: React.ReactNode }>;
  current: string;
  className?: string;
}) {
  const activeIndex = Math.max(0, steps.findIndex((step) => step.id === current));
  return (
    <ol className={`deetoo-progress-steps ${className}`}>
      {steps.map((step, index) => {
        const state = index < activeIndex ? "complete" : index === activeIndex ? "current" : "upcoming";
        return (
          <li key={step.id} data-state={state} aria-current={state === "current" ? "step" : undefined}>
            <span className="deetoo-progress-step-dot">
              {state === "complete" ? "✓" : index + 1}
            </span>
            <div>
              <strong>{step.label}</strong>
              {step.description && <p>{step.description}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function formatCountdown(seconds: number) {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export function Countdown({
  expiresAt,
  warningAtSeconds = 60,
  onExpire,
  className = "",
}: {
  expiresAt: string | number | Date;
  warningAtSeconds?: number;
  onExpire?: () => void;
  className?: string;
}) {
  const target = useMemo(() => new Date(expiresAt).getTime(), [expiresAt]);
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, Math.ceil((target - Date.now()) / 1000)),
  );
  const expiredRef = useRef(false);

  useEffect(() => {
    const update = () => {
      const next = Math.max(0, Math.ceil((target - Date.now()) / 1000));
      setRemaining(next);
      if (next === 0 && !expiredRef.current) {
        expiredRef.current = true;
        onExpire?.();
      }
    };
    expiredRef.current = false;
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [target, onExpire]);

  return (
    <time
      dateTime={new Date(target).toISOString()}
      className={`deetoo-countdown ${remaining <= warningAtSeconds ? "is-warning" : ""} ${className}`}
      aria-label={remaining ? `${remaining} seconds remaining` : "Expired"}
    >
      {formatCountdown(remaining)}
    </time>
  );
}

function useDialogLifecycle(
  isOpen: boolean,
  dialogRef: React.RefObject<HTMLDialogElement | null>,
) {
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!isOpen || !dialog) return;
    const previous =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    if (!dialog.open) dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      if (dialog.open) dialog.close();
      document.body.style.overflow = previousOverflow;
      if (previous?.isConnected) previous.focus();
    };
  }, [isOpen, dialogRef]);
}

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  side?: "left" | "right" | "bottom";
  size?: "sm" | "md" | "lg" | "xl";
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export function Drawer({
  isOpen,
  onClose,
  title,
  description,
  side = "right",
  size = "md",
  children,
  footer,
  className = "",
}: DrawerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useDialogLifecycle(isOpen, dialogRef);
  if (!isOpen) return null;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className={`deetoo-drawer deetoo-drawer-${side} deetoo-drawer-${size} ${className}`}
    >
      <header>
        <div>
          <h2 id={titleId}>{title}</h2>
          {description && <p id={descriptionId}>{description}</p>}
        </div>
        <button type="button" onClick={onClose} aria-label={`Close ${title}`}>
          <X size={18} aria-hidden="true" />
        </button>
      </header>
      <div className="deetoo-drawer-body">{children}</div>
      {footer && <footer>{footer}</footer>}
    </dialog>
  );
}

export function BottomSheet(
  props: Omit<DrawerProps, "side">,
) {
  return <Drawer {...props} side="bottom" className={`deetoo-bottom-sheet ${props.className || ""}`} />;
}

export function StickyActionBar({
  primary,
  secondary,
  className = "",
}: {
  primary: React.ReactNode;
  secondary?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`deetoo-sticky-action-bar ${className}`}>
      {secondary && <div>{secondary}</div>}
      <div>{primary}</div>
    </div>
  );
}

export interface DataTableColumn<T> {
  key: string;
  label: React.ReactNode;
  render?: (row: T) => React.ReactNode;
  align?: "left" | "center" | "right";
  sortable?: boolean;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  density = "dense",
  loading = false,
  empty,
  selectedRowKey,
  onRowClick,
  sortKey,
  sortDirection,
  onSort,
  className = "",
}: {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  density?: Density;
  loading?: boolean;
  empty?: React.ReactNode;
  selectedRowKey?: string | null;
  onRowClick?: (row: T) => void;
  sortKey?: string | null;
  sortDirection?: "asc" | "desc" | null;
  onSort?: (key: string) => void;
  className?: string;
}) {
  if (!loading && rows.length === 0) {
    return <>{empty || <p className="deetoo-data-table-empty">No records available.</p>}</>;
  }

  return (
    <div className={`data-table-wrap deetoo-data-table-wrap ${className}`} data-density={density}>
      <table className="data-table deetoo-data-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" style={{ textAlign: column.align }}>
                {column.sortable && onSort ? (
                  <button
                    type="button"
                    onClick={() => onSort(column.key)}
                    aria-label={`Sort by ${String(column.label)}`}
                  >
                    {column.label}
                    <span aria-hidden="true">
                      {sortKey === column.key
                        ? sortDirection === "desc"
                          ? " ↓"
                          : " ↑"
                        : ""}
                    </span>
                  </button>
                ) : (
                  column.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: 5 }).map((_, index) => (
                <tr key={`loading-${index}`} aria-hidden="true">
                  {columns.map((column) => (
                    <td key={column.key}>
                      <span className="deetoo-skeleton deetoo-table-skeleton-cell" />
                    </td>
                  ))}
                </tr>
              ))
            : rows.map((row) => {
                const key = rowKey(row);
                const interactive = Boolean(onRowClick);
                return (
                  <tr
                    key={key}
                    data-selected={selectedRowKey === key || undefined}
                    tabIndex={interactive ? 0 : undefined}
                    onClick={() => onRowClick?.(row)}
                    onKeyDown={(event) => {
                      if (
                        interactive &&
                        (event.key === "Enter" || event.key === " ")
                      ) {
                        event.preventDefault();
                        onRowClick?.(row);
                      }
                    }}
                  >
                    {columns.map((column) => (
                      <td key={column.key} style={{ textAlign: column.align }}>
                        {column.render
                          ? column.render(row)
                          : String((row as any)?.[column.key] ?? "—")}
                      </td>
                    ))}
                  </tr>
                );
              })}
        </tbody>
      </table>
    </div>
  );
}

export function Sparkline({
  values,
  label,
  className = "",
}: {
  values: number[];
  label?: string;
  className?: string;
}) {
  const valid = values.filter(Number.isFinite);
  if (valid.length < 2) return null;
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const points = valid
    .map((value, index) => {
      const x = (index / (valid.length - 1)) * 100;
      const y = 32 - ((value - min) / Math.max(1, max - min)) * 28;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg
      className={`deetoo-sparkline ${className}`}
      viewBox="0 0 100 36"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      preserveAspectRatio="none"
    >
      <polyline points={points} fill="none" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function ChartFrame({
  title,
  description,
  legend,
  loading = false,
  empty = false,
  children,
  footer,
  className = "",
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  legend?: React.ReactNode;
  loading?: boolean;
  empty?: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`deetoo-chart-frame ${className}`}>
      <header>
        <div>
          <h3>{title}</h3>
          {description && <p>{description}</p>}
        </div>
        {legend}
      </header>
      <div className="deetoo-chart-body">
        {loading ? (
          <div className="deetoo-skeleton h-48" role="status" aria-label="Loading chart" />
        ) : empty ? (
          <p className="deetoo-chart-empty">No chart data available yet.</p>
        ) : (
          children
        )}
      </div>
      {footer && <footer>{footer}</footer>}
    </section>
  );
}

export function CardSkeleton() {
  return <div className="deetoo-skeleton deetoo-card-skeleton" role="status" aria-label="Loading card" />;
}

export function MetricSkeleton() {
  return <div className="deetoo-skeleton deetoo-metric-skeleton" role="status" aria-label="Loading metric" />;
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="deetoo-list-skeleton" role="status" aria-label="Loading list">
      {Array.from({ length: rows }).map((_, index) => (
        <span className="deetoo-skeleton" key={index} />
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="deetoo-table-skeleton" role="status" aria-label="Loading table">
      {Array.from({ length: rows }).map((_, row) => (
        <div key={row}>
          {Array.from({ length: columns }).map((__, column) => (
            <span className="deetoo-skeleton" key={column} />
          ))}
        </div>
      ))}
    </div>
  );
}
