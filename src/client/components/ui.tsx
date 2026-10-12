import { CheckCircle, Info, WarningCircle } from "@phosphor-icons/react";
import { type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, forwardRef, useId } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "lg" | "sm";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:brightness-[1.06] disabled:opacity-50",
  secondary: "bg-surface text-ink border border-line-strong hover:bg-surface-2 disabled:opacity-50",
  ghost: "text-ink-2 hover:text-ink hover:bg-surface-2 disabled:opacity-50",
  danger: "bg-surface text-danger border border-line-strong hover:bg-danger-soft disabled:opacity-50",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-sm gap-1.5",
  md: "h-11 px-4 text-[15px] gap-2",
  lg: "h-12 px-5 text-base gap-2",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading = false, className = "", children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`press inline-flex select-none items-center justify-center whitespace-nowrap rounded-button font-medium disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {loading ? <span className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none" aria-hidden /> : null}
      {children}
    </button>
  );
});

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  htmlFor: string;
}) {
  return (
    <div className="grid content-start gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="flex items-start gap-1.5 text-sm text-danger">
          <WarningCircle size={16} weight="bold" className="mt-0.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-sm text-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean; mono?: boolean }>(function Input(
  { invalid, mono, className = "", ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      {...rest}
      aria-invalid={invalid || undefined}
      className={`h-11 w-full min-w-0 rounded-control border bg-surface px-3 text-[16px] text-ink placeholder:text-ink-3 transition-[border-color,box-shadow] duration-150 focus:outline-none focus-visible:border-accent focus-visible:shadow-[0_0_0_3px_var(--accent-soft)] ${
        invalid ? "border-danger" : "border-line-strong hover:border-ink-3"
      } ${mono ? "font-mono tabular" : ""} ${className}`}
    />
  );
});

export function useFieldId(prefix: string) {
  return `${prefix}-${useId().replace(/:/g, "")}`;
}

type Tone = "info" | "success" | "warning" | "danger";

const tones: Record<Tone, { box: string; Icon: typeof Info }> = {
  info: { box: "bg-surface-2 text-ink-2", Icon: Info },
  success: { box: "bg-success-soft text-success", Icon: CheckCircle },
  warning: { box: "bg-warning-soft text-warning", Icon: WarningCircle },
  danger: { box: "bg-danger-soft text-danger", Icon: WarningCircle },
};

export function Notice({ tone = "info", title, children, action }: { tone?: Tone; title?: string; children?: ReactNode; action?: ReactNode }) {
  const { box, Icon } = tones[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={`flex items-start gap-3 rounded-card px-4 py-3 text-sm ${box}`}>
      <Icon size={18} weight="bold" className="mt-0.5 shrink-0" aria-hidden />
      <div className="grid min-w-0 flex-1 gap-0.5">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div className={title ? "text-ink-2" : ""}>{children}</div> : null}
      </div>
      {action}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}
