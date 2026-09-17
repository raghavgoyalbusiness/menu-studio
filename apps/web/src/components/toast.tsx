import { create } from "zustand";
import { cx } from "./ui.tsx";

interface Toast {
  id: number;
  message: string;
  tone: "neutral" | "ok" | "danger";
  action?: { label: string; onClick: () => void };
}

interface ToastState {
  toasts: Toast[];
  push(message: string, options?: { tone?: Toast["tone"]; action?: Toast["action"] }): void;
  dismiss(id: number): void;
}

let nextId = 1;

export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push(message, options) {
    const id = nextId++;
    const toast: Toast = { id, message, tone: options?.tone ?? "neutral" };
    if (options?.action) toast.action = options.action;
    set({ toasts: [...get().toasts.slice(-2), toast] });
    setTimeout(() => get().dismiss(id), options?.action ? 8000 : 4000);
  },
  dismiss(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
}));

export const toast = (message: string, options?: { tone?: Toast["tone"]; action?: Toast["action"] }) => useToasts.getState().push(message, options);

export function Toaster() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cx(
            "animate-fade-up pointer-events-auto flex items-center gap-4 rounded-md px-4 py-2.5 text-[13px] shadow-float",
            t.tone === "danger" ? "bg-danger text-white" : "bg-ink text-paper",
          )}
        >
          <span>{t.message}</span>
          {t.action ? (
            <button
              className="font-medium underline underline-offset-2"
              onClick={() => {
                t.action?.onClick();
                dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
