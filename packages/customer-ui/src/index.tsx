import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";

export function classNames(...names: Array<string | false | null | undefined>) {
  return names.filter(Boolean).join(" ");
}

type ButtonVariant = "primary" | "outline" | "quiet" | "soft";
type ButtonSize = "sm" | "md";
export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  startIcon?: ReactNode;
  endIcon?: ReactNode;
};
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", startIcon, endIcon, className, children, type = "button", ...props }, ref
) {
  return (
    <button
      {...props}
      type={type}
      ref={ref}
      className={classNames("dt-button", `dt-button--${variant}`, `dt-button--${size}`, className)}
    >
      {startIcon && <span className="dt-button__icon" aria-hidden="true">{startIcon}</span>}
      <span>{children}</span>
      {endIcon && <span className="dt-button__icon" aria-hidden="true">{endIcon}</span>}
    </button>
  );
});

export function IconButton({ label, children, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  children: ReactNode;
}) {
  return <button {...props} type="button" className={classNames("dt-icon-button", className)} aria-label={label} title={label}>{children}</button>;
}

export function Panel({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section {...props} className={classNames("dt-panel", className)} />;
}

export function Badge({ variant = "mint", children, className }: {
  variant?: "mint" | "red" | "dark" | "neutral" | "gold";
  children: ReactNode;
  className?: string;
}) {
  return <span className={classNames("dt-badge", `dt-badge--${variant}`, className)}>{children}</span>;
}

export function VisuallyHidden({ children }: {children: ReactNode}) {
  return <span className="dt-sr-only">{children}</span>;
}
