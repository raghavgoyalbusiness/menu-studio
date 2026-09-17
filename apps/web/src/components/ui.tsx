import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as SliderPrimitive from "@radix-ui/react-slider";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { forwardRef, useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { ApiError, errorMessage } from "../lib/api.ts";
import { IconAlert, IconX } from "./icons.tsx";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "quiet";

const buttonStyles: Record<ButtonVariant, string> = {
  primary: "bg-ink text-paper hover:bg-ink-2 disabled:bg-faint",
  secondary: "border border-line-strong bg-card text-ink hover:bg-paper-2 disabled:text-faint",
  ghost: "text-ink-2 hover:bg-paper-2 disabled:text-faint",
  danger: "border border-danger/30 bg-card text-danger hover:bg-danger-soft",
  quiet: "text-muted hover:text-ink",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = "secondary", size = "md", loading, icon, className, children, disabled, ...props }, ref) {
  return (
    <button
      ref={ref}
      className={cx(
        "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium tracking-[-0.005em] transition-colors duration-150",
        size === "sm" ? "h-8 px-2.5 text-[12.5px]" : size === "lg" ? "h-11 px-5 text-[14px]" : "h-9 px-3.5 text-[13px]",
        buttonStyles[variant],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Spinner size={14} /> : icon}
      {children}
    </button>
  );
});

export function IconButton({ label, children, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <Tooltip label={label}>
      <button aria-label={label} className={cx("inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-2 transition-colors hover:bg-paper-2 disabled:text-faint disabled:hover:bg-transparent", className)} {...props}>
        {children}
      </button>
    </Tooltip>
  );
}

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={cx("animate-spin", className)} aria-hidden>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

const fieldBase =
  "w-full rounded-md border border-line-strong bg-card px-3 text-[13.5px] text-ink placeholder:text-faint transition-colors focus:border-ink-2 focus:outline-none focus:ring-2 focus:ring-ink/5 disabled:bg-paper-2";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cx(fieldBase, "h-9", className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cx(fieldBase, "min-h-24 py-2 leading-relaxed", className)} {...props} />;
});

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(fieldBase, "h-9 appearance-none bg-[length:12px] bg-[right_10px_center] bg-no-repeat pr-8", className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236b675f' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }} {...props}>
      {children}
    </select>
  );
}

export function Field({ label, hint, error, children, className }: { label: string; hint?: string; error?: string | null; children: ReactNode; className?: string }) {
  return (
    <label className={cx("flex flex-col gap-1.5", className)}>
      <span className="text-[12.5px] font-medium text-ink-2">{label}</span>
      {children}
      {error ? <span className="text-[12px] text-danger">{error}</span> : hint ? <span className="text-[12px] text-muted">{hint}</span> : null}
    </label>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("rounded-lg border border-line bg-card", className)}>{children}</div>;
}

export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "ok" | "warn" | "danger" | "accent"; className?: string }) {
  const tones = {
    neutral: "bg-paper-2 text-ink-2",
    ok: "bg-ok-soft text-ok",
    warn: "bg-warn-soft text-warn",
    danger: "bg-danger-soft text-danger",
    accent: "bg-accent-soft text-accent",
  };
  return <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium", tones[tone], className)}>{children}</span>;
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 pb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        {eyebrow ? <div className="eyebrow mb-2">{eyebrow}</div> : null}
        <h1 className="display text-[38px] text-ink sm:text-[44px]">{title}</h1>
        {description ? <p className="mt-3 text-[15px] leading-relaxed text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-line-strong px-6 py-16 text-center">
      <div className="display text-2xl text-ink">{title}</div>
      {description ? <p className="mt-2 max-w-sm text-[13.5px] text-muted">{description}</p> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

export function ErrorNotice({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  const retryable = error instanceof ApiError ? error.retryable : true;
  return (
    <div role="alert" className={cx("flex items-start gap-3 rounded-md border border-danger/20 bg-danger-soft px-4 py-3 text-[13px] text-danger", className)}>
      <IconAlert size={16} className="mt-0.5 shrink-0" />
      <div className="flex-1">
        <div>{errorMessage(error)}</div>
        {error instanceof ApiError && error.issues.length ? <div className="mt-1 text-[12px] opacity-80">{error.issues.slice(0, 3).join(" · ")}</div> : null}
      </div>
      {onRetry && retryable ? (
        <button className="shrink-0 font-medium underline underline-offset-2" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function Notice({ tone = "neutral", children, className }: { tone?: "neutral" | "warn" | "ok"; children: ReactNode; className?: string }) {
  const tones = { neutral: "border-line bg-paper-2 text-ink-2", warn: "border-warn/20 bg-warn-soft text-warn", ok: "border-ok/20 bg-ok-soft text-ok" };
  return <div className={cx("rounded-md border px-4 py-3 text-[13px] leading-relaxed", tones[tone], className)}>{children}</div>;
}

export function Tooltip({ label, children, side = "bottom" }: { label: string; children: ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <TooltipPrimitive.Root delayDuration={350}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content side={side} sideOffset={6} className="z-50 rounded-sm bg-ink px-2 py-1 text-[11.5px] text-paper shadow-soft">
          {label}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

export function Segmented<T extends string>({ value, onChange, options, className, size = "md" }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string; size?: "sm" | "md" }) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v as T)}
      className={cx("inline-flex rounded-md border border-line-strong bg-paper-2 p-0.5", className)}
    >
      {options.map((o) => (
        <ToggleGroup.Item
          key={o.value}
          value={o.value}
          className={cx(
            "flex-1 rounded-[5px] px-2.5 text-ink-2 transition-colors data-[state=on]:bg-card data-[state=on]:text-ink data-[state=on]:shadow-[0_1px_2px_rgb(0_0_0/0.08)]",
            size === "sm" ? "h-7 text-[12px]" : "h-8 text-[12.5px]",
          )}
        >
          {o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}

export function Slider({ value, onChange, onCommit, min = 0, max = 100, step = 1, label }: { value: number; onChange: (v: number) => void; onCommit?: (v: number) => void; min?: number; max?: number; step?: number; label: string }) {
  return (
    <SliderPrimitive.Root
      className="relative flex h-5 w-full touch-none items-center select-none"
      value={[value]}
      min={min}
      max={max}
      step={step}
      onValueChange={([v]) => v !== undefined && onChange(v)}
      onValueCommit={([v]) => v !== undefined && onCommit?.(v)}
      aria-label={label}
    >
      <SliderPrimitive.Track className="relative h-[3px] grow rounded-full bg-line-strong">
        <SliderPrimitive.Range className="absolute h-full rounded-full bg-ink" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="block h-4 w-4 rounded-full border border-ink bg-card shadow-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-focus" />
    </SliderPrimitive.Root>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={onChange}
      aria-label={label}
      className="relative h-5 w-9 shrink-0 rounded-full bg-line-strong transition-colors data-[state=checked]:bg-ink"
    >
      <SwitchPrimitive.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-card shadow transition-transform data-[state=checked]:translate-x-[18px]" />
    </SwitchPrimitive.Root>
  );
}

export const Tabs = TabsPrimitive.Root;

export function TabList({ children, className }: { children: ReactNode; className?: string }) {
  return <TabsPrimitive.List className={cx("flex gap-1 border-b border-line px-3", className)}>{children}</TabsPrimitive.List>;
}

export function Tab({ value, children }: { value: string; children: ReactNode }) {
  return (
    <TabsPrimitive.Trigger
      value={value}
      className="relative -mb-px flex h-10 items-center gap-1.5 border-b-2 border-transparent px-2 text-[12.5px] font-medium text-muted transition-colors hover:text-ink data-[state=active]:border-ink data-[state=active]:text-ink"
    >
      {children}
    </TabsPrimitive.Trigger>
  );
}

export const TabPanel = TabsPrimitive.Content;

export function Dialog({ open, onOpenChange, title, description, children, wide }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: string; children: ReactNode; wide?: boolean }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-ink/25 backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          className={cx(
            "fixed top-1/2 left-1/2 z-50 max-h-[88vh] w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-line bg-card p-6 shadow-float focus:outline-none",
            wide ? "max-w-3xl" : "max-w-lg",
          )}
        >
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <DialogPrimitive.Title className="display text-[26px] text-ink">{title}</DialogPrimitive.Title>
              {description ? <DialogPrimitive.Description className="mt-1.5 text-[13.5px] text-muted">{description}</DialogPrimitive.Description> : null}
            </div>
            <DialogPrimitive.Close className="rounded-md p-1 text-muted hover:bg-paper-2 hover:text-ink" aria-label="Close">
              <IconX size={18} />
            </DialogPrimitive.Close>
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function Sheet({ open, onOpenChange, title, children }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; children: ReactNode }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-ink/15" />
        <DialogPrimitive.Content className="fixed top-0 right-0 z-50 flex h-full w-full max-w-md flex-col border-l border-line bg-card shadow-float focus:outline-none">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <DialogPrimitive.Title className="display text-[24px]">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Close className="rounded-md p-1 text-muted hover:bg-paper-2 hover:text-ink" aria-label="Close">
              <IconX size={18} />
            </DialogPrimitive.Close>
          </div>
          <div className="scroll-quiet flex-1 overflow-y-auto">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Seconds since mount, for long AI waits. */
export function useElapsed(active: boolean): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!active) return;
    const started = Date.now();
    const id = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 500);
    return () => {
      clearInterval(id);
      setSeconds(0);
    };
  }, [active]);
  return active ? seconds : 0;
}

export function ProgressSteps({ steps, elapsed }: { steps: string[]; elapsed: number }) {
  const index = Math.min(steps.length - 1, Math.floor(elapsed / 9));
  return (
    <div className="flex items-center gap-3 text-[13px] text-muted" aria-live="polite">
      <Spinner size={14} />
      <span className="text-ink-2">{steps[index]}</span>
      <span className="tabular-nums text-faint">{elapsed}s</span>
    </div>
  );
}
