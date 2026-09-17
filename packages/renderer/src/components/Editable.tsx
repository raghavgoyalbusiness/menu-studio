import { useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { isTranslated, useRenderContext } from "../context.tsx";

export interface EditableProps {
  /** JSON Pointer into the MenuDocument. Null renders read-only text. */
  pointer: string | null;
  value: string;
  className?: string;
  kind?: "text" | "price";
  multiline?: boolean;
  as?: "span" | "p" | "div";
}

/**
 * Click-to-edit text. The element is uncontrolled while editing (React must not fight
 * the caret) and remounts by key whenever the committed value changes.
 */
export function Editable({ pointer, value, className, kind = "text", multiline = false, as = "span" }: EditableProps) {
  const ctx = useRenderContext();
  const bridge = ctx.editing;
  const Tag = as;
  if (!bridge || !pointer || isTranslated(ctx)) {
    return <Tag className={className}>{value}</Tag>;
  }
  return <EditableInner key={value} pointer={pointer} value={value} className={className} kind={kind} multiline={multiline} as={Tag} />;
}

interface InnerProps {
  pointer: string;
  value: string;
  className: string | undefined;
  kind: "text" | "price";
  multiline: boolean;
  as: "span" | "p" | "div";
}

function EditableInner({ pointer, value, className, kind, multiline, as: Tag }: InnerProps) {
  const ctx = useRenderContext();
  const ref = useRef<HTMLElement | null>(null);
  const [editing, setEditing] = useState(false);

  const begin = (event: MouseEvent) => {
    event.stopPropagation();
    if (editing) return;
    setEditing(true);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
  };

  const finish = (commit: boolean) => {
    const el = ref.current;
    setEditing(false);
    if (!el) return;
    const next = (el.textContent ?? "").replace(/\s+/g, multiline ? " " : " ").trim();
    // Restore the committed text; the store re-renders with the new value if it is accepted.
    el.textContent = value;
    if (!commit || next === value.trim()) return;
    if (kind === "price") ctx.editing?.commitPrice(pointer, next);
    else if (next.length > 0) ctx.editing?.commitText(pointer, next);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      finish(false);
      (event.currentTarget as HTMLElement).blur();
    } else if (event.key === "Enter" && (!multiline || !event.shiftKey)) {
      event.preventDefault();
      (event.currentTarget as HTMLElement).blur();
    }
  };

  return (
    <Tag
      ref={(el: HTMLElement | null) => {
        ref.current = el;
      }}
      className={`${className ?? ""} ms-editable${editing ? " ms-editable--active" : ""}`}
      data-pointer={pointer}
      contentEditable={editing ? "plaintext-only" : false}
      suppressContentEditableWarning
      spellCheck={editing}
      onClick={begin}
      onBlur={() => editing && finish(true)}
      onKeyDown={editing ? onKeyDown : undefined}
      title={editing ? undefined : kind === "price" ? "Click to edit price" : "Click to edit"}
    >
      {value}
    </Tag>
  );
}
