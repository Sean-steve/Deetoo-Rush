/**
 * DEETOO - Shared UI Primitives
 * Reusable design-system foundation for Customer, Merchant, Rider, and Admin applications
 */

import React, {
  useState,
  useId,
  useEffect,
  useRef,
  Component,
  ErrorInfo,
  ReactNode,
} from "react";
import {
  LucideIcon,
  AlertCircle,
  CheckCircle,
  Info,
  X,
  ChevronDown,
} from "lucide-react";
export * from "./tokens";

// ==========================================
// 1. Deetoo Brand Logo
// ==========================================

export function DeetooLogo({
  className = "h-8",
  showText = true,
}: {
  className?: string;
  showText?: boolean;
}) {
  return (
    <svg
      className={className}
      viewBox={showText ? "0 0 178 48" : "0 0 48 48"}
      role="img"
      aria-label="DeeToo"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
    >
      <circle cx="24" cy="24" r="21" fill="#00BF62" />
      <path d="M13 22.5 24 13l11 9.5H13Z" fill="white" />
      <path d="M13 27.5h22" stroke="white" strokeWidth="2.2" strokeLinecap="round" opacity=".35" />
      {showText && (
        <>
          <text
            x="54"
            y="31.5"
            fontFamily="Epilogue, ui-sans-serif, system-ui, sans-serif"
            fontWeight="900"
            fontSize="25"
            letterSpacing="-.045em"
            fill="#10231A"
          >
            DeeToo
          </text>
          <circle cx="161" cy="27" r="3" fill="#00BF62" />
        </>
      )}
    </svg>
  );
}

// ==========================================
// 2. Button
// ==========================================

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = "primary",
  size = "md",
  isLoading = false,
  className = "",
  disabled,
  type = "button",
  ...props
}) => {
  const baseClasses =
    "inline-flex items-center justify-center font-medium rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed select-none";

  const variantClasses = {
    primary: "deetoo-button-primary",
    secondary: "deetoo-button-secondary",
    outline: "deetoo-button-outline",
    danger: "deetoo-button-danger",
    ghost: "deetoo-button-ghost",
  };

  const sizeClasses = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base",
  };

  return (
    <button
      type={type}
      aria-busy={isLoading || undefined}
      className={`deetoo-button ${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && (
        <svg
          className="animate-spin -ml-1 mr-2 h-4 w-4 text-current"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      )}
      {children}
    </button>
  );
};

// ==========================================
// 3. Form Field, Input & Textarea
// ==========================================

export interface FormFieldProps {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  id?: string;
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  error,
  hint,
  required,
  children,
  id,
}) => {
  const generatedId = useId();
  const child = React.isValidElement<
    React.InputHTMLAttributes<HTMLInputElement>
  >(children)
    ? children
    : null;
  const fieldId = child?.props.id || id || generatedId;
  const messageId = `${fieldId}-message`;
  return (
    <div className="flex flex-col gap-1.5 w-full text-left">
      <label htmlFor={fieldId} className="text-xs font-semibold text-slate-700">
        {label}{" "}
        {required && (
          <span aria-hidden="true" className="text-rose-500">
            *
          </span>
        )}
      </label>
      {child
        ? React.cloneElement(child, {
            id: fieldId,
            "aria-invalid": error ? true : child.props["aria-invalid"],
            "aria-required": required || child.props["aria-required"],
            "aria-describedby":
              [child.props["aria-describedby"], (error || hint) && messageId]
                .filter(Boolean)
                .join(" ") || undefined,
          })
        : children}
      {hint && !error && (
        <p id={messageId} className="text-xs text-slate-500">
          {hint}
        </p>
      )}
      {error && (
        <p
          id={messageId}
          role="alert"
          className="text-xs text-rose-600 font-medium"
        >
          {error}
        </p>
      )}
    </div>
  );
};

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className = "", ...props }, ref) => (
  <input
    ref={ref}
    className={`deetoo-field w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand disabled:bg-slate-50 disabled:text-slate-400 transition-colors ${className}`}
    {...props}
  />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className = "", ...props }, ref) => (
  <textarea
    ref={ref}
    className={`deetoo-field w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand disabled:bg-slate-50 disabled:text-slate-400 transition-colors ${className}`}
    {...props}
  />
));
Textarea.displayName = "Textarea";

// ==========================================
// 4. Select, Checkbox, Radio
// ==========================================

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className = "", children, ...props }, ref) => (
  <div className="relative w-full">
    <select
      ref={ref}
      className={`deetoo-field w-full appearance-none rounded-lg border border-slate-300 bg-white px-3.5 py-2 pr-10 text-sm text-slate-900 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand disabled:bg-slate-50 transition-colors ${className}`}
      {...props}
    >
      {children}
    </select>
    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
      <ChevronDown size={16} />
    </div>
  </div>
));
Select.displayName = "Select";

export const Checkbox: React.FC<
  React.InputHTMLAttributes<HTMLInputElement> & { label?: string }
> = ({ label, className = "", id, ...props }) => (
  <label className="inline-flex items-center gap-2.5 cursor-pointer text-sm text-slate-700 select-none">
    <input
      type="checkbox"
      id={id}
      className={`h-4 w-4 rounded border-slate-300 text-[#00BF62] focus:ring-brand cursor-pointer ${className}`}
      {...props}
    />
    {label && <span>{label}</span>}
  </label>
);

export const Radio: React.FC<
  React.InputHTMLAttributes<HTMLInputElement> & { label?: string }
> = ({ label, className = "", id, ...props }) => (
  <label className="inline-flex items-center gap-2.5 cursor-pointer text-sm text-slate-700 select-none">
    <input
      type="radio"
      id={id}
      className={`h-4 w-4 border-slate-300 text-[#00BF62] focus:ring-brand cursor-pointer ${className}`}
      {...props}
    />
    {label && <span>{label}</span>}
  </label>
);

// ==========================================
// 5. Card & Badge
// ==========================================

export const Card: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className = "",
  children,
  ...props
}) => (
  <div className={`deetoo-card p-5 sm:p-6 ${className}`} {...props}>
    {children}
  </div>
);

export interface BadgeProps {
  variant?: "default" | "success" | "warning" | "danger" | "info";
  children: React.ReactNode;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = "default",
  children,
  className = "",
}) => {
  const variantClasses = {
    default: "bg-slate-100 text-slate-700 border-slate-200",
    success: "bg-emerald-50 text-emerald-700 border-emerald-200",
    warning: "bg-amber-50 text-amber-700 border-amber-200",
    danger: "bg-rose-50 text-rose-700 border-rose-200",
    info: "bg-sky-50 text-sky-700 border-sky-200",
  };

  return (
    <span
      className={`deetoo-badge inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${variantClasses[variant]} ${className}`}
    >
      {children}
    </span>
  );
};

// ==========================================
// 6. Avatar
// ==========================================

export const Avatar: React.FC<{
  name: string;
  src?: string;
  size?: "sm" | "md" | "lg";
}> = ({ name, src, size = "md" }) => {
  const sizeClasses = {
    sm: "h-8 w-8 text-xs",
    md: "h-10 w-10 text-sm",
    lg: "h-12 w-12 text-base",
  };

  const initials = name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={`deetoo-avatar ${sizeClasses[size]} rounded-full object-cover border border-slate-200`}
      />
    );
  }

  return (
    <div
      className={`deetoo-avatar ${sizeClasses[size]} rounded-full bg-emerald-50 text-emerald-800 font-bold flex items-center justify-center select-none border border-emerald-100`}
    >
      {initials}
    </div>
  );
};

// ==========================================
// 7. Feedback & State Boundaries
// ==========================================

export const Spinner: React.FC<{
  size?: "sm" | "md" | "lg";
  className?: string;
}> = ({ size = "md", className = "" }) => {
  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-6 w-6",
    lg: "h-8 w-8",
  };
  return (
    <svg
      role="status"
      aria-label="Loading"
      className={`animate-spin text-brand ${sizeClasses[size]} ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
};

export const EmptyState: React.FC<{
  title: string;
  description: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
}> = ({ title, description, icon: Icon, action }) => (
  <div className="deetoo-empty-state flex flex-col items-center justify-center p-8 sm:p-10 text-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/50">
    {Icon && (
      <div className="deetoo-empty-state-icon mb-4 rounded-2xl bg-emerald-50 p-3 text-emerald-700">
        <Icon size={24} />
      </div>
    )}
    <h3 className="text-base font-bold tracking-tight text-slate-900">{title}</h3>
    <p className="mt-1.5 text-sm leading-6 text-slate-500 max-w-sm">{description}</p>
    {action && <div className="mt-4">{action}</div>}
  </div>
);

export const ErrorState: React.FC<{
  title?: string;
  message: string;
  onRetry?: () => void;
}> = ({ title = "Something went wrong", message, onRetry }) => (
  <div
    role="alert"
    className="deetoo-error-state flex flex-col items-center justify-center p-6 sm:p-8 text-center rounded-2xl border border-rose-200 bg-rose-50 text-rose-900"
  >
    <AlertCircle className="text-rose-500 mb-2" size={28} />
    <h3 className="text-sm font-semibold">{title}</h3>
    <p className="mt-1 text-xs text-rose-700 max-w-md">{message}</p>
    {onRetry && (
      <Button
        variant="outline"
        size="sm"
        onClick={onRetry}
        className="mt-4 bg-white border-rose-300 text-rose-800"
      >
        Retry
      </Button>
    )}
  </div>
);

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size = "md",
  className = "",
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!isOpen || !dialog) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [isOpen]);
  const sizeClasses = {
    sm: "max-w-sm",
    md: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
  };
  if (!isOpen) return null;
  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className={`deetoo-modal m-auto w-[calc(100%-2rem)] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-3xl bg-white p-6 shadow-xl ${sizeClasses[size]} ${className}`}
    >
      <div className="deetoo-modal-header flex items-center justify-between gap-4">
        <h3 id={titleId} className="text-lg font-extrabold tracking-tight text-slate-900">
          {title}
        </h3>
        <button
          type="button"
          aria-label={`Close ${title}`}
          onClick={onClose}
          className="min-h-11 min-w-11 rounded-2xl flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <div className="mt-4">{children}</div>
    </dialog>
  );
};

export const Dialog = Modal;
export const Drawer = Modal;

export interface ToastProps {
  message: string | null;
  onDismiss: () => void;
  kind?: "success" | "error" | "info";
  durationMs?: number;
}

export function Toast({
  message,
  onDismiss,
  kind = "success",
  durationMs = 2400,
}: ToastProps) {
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(onDismiss, durationMs);
    return () => window.clearTimeout(timer);
  }, [message, durationMs, onDismiss]);

  if (!message) return null;
  const Icon =
    kind === "success" ? CheckCircle : kind === "error" ? AlertCircle : Info;
  const tone =
    kind === "success"
      ? "border-emerald-200 bg-emerald-950 text-emerald-50"
      : kind === "error"
        ? "border-rose-200 bg-rose-950 text-rose-50"
        : "border-sky-200 bg-slate-950 text-slate-50";

  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      aria-live={kind === "error" ? "assertive" : "polite"}
      className={`fixed bottom-5 right-5 z-[100] max-w-sm rounded-2xl border px-4 py-3 shadow-xl ${tone}`}
    >
      <div className="flex items-center gap-3">
        <Icon size={18} aria-hidden="true" className="shrink-0" />
        <span className="text-sm font-semibold">{message}</span>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss notification"
          className="ml-2 rounded-lg p-1 opacity-70 hover:opacity-100"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

// ==========================================
// 8. Global Error Boundary Component
// ==========================================

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallbackTitle?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  override state: ErrorBoundaryState = { hasError: false };

  constructor(props: ErrorBoundaryProps) {
    super(props);
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  override render() {
    if (this.state.hasError) {
      return (
        <div className="p-6">
          <ErrorState
            title={this.props.fallbackTitle || "Application Shell Error"}
            message={
              this.state.error?.message ||
              "An unexpected rendering error occurred."
            }
            onRetry={this.handleReset}
          />
        </div>
      );
    }
    return this.props.children;
  }
}

/** Presentational loading placeholder; the container owns request state. */
export function Skeleton({
  className = "",
  label = "Loading content",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <div
      role="status"
      aria-label={label}
      className={`deetoo-skeleton min-h-6 ${className}`}
    />
  );
}

/** Display integer minor units without introducing pricing calculations. */
export function Price({
  minor,
  currency = "KES",
}: {
  minor: number;
  currency?: string;
}) {
  return (
    <span className="deetoo-price">
      {new Intl.NumberFormat("en-KE", { style: "currency", currency }).format(
        minor / 100,
      )}
    </span>
  );
}
