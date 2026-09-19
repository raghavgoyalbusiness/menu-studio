import { AA_TEXT, isHexColor, PALETTES, paletteContrastIssues } from "@menu-studio/design-system/catalog";
import type { CustomPalette, LayoutSpec } from "@menu-studio/shared";
import { useState } from "react";
import { Button, cx } from "../components/ui.tsx";
import { clearToken, setToken } from "./spec-edits.ts";
import { useEditor } from "../stores/editor.ts";

/**
 * The owner's own brand colours. Fonts stay curated — a menu set in whatever the venue happens to
 * own would undo the point of the product — but colour is the thing a restaurant genuinely already
 * owns, so it is theirs to set.
 *
 * Contrast is checked as they type, against the same AA rule the palette catalog is held to — and
 * the same one the LayoutSpec schema enforces, so a failing palette would be rejected on save
 * anyway. Rather than let that happen, the edit is held locally until it passes: the swatches keep
 * moving, nothing is committed, and the reason is on screen.
 */

const ROLES = [
  { key: "background", label: "Paper", hint: "The page itself" },
  { key: "surface", label: "Panel", hint: "Boxed sections and cards" },
  { key: "text", label: "Text", hint: "Item names and descriptions" },
  { key: "muted", label: "Secondary text", hint: "Descriptions, notes" },
  { key: "accent", label: "Accent", hint: "Section headings, rules" },
  { key: "accent2", label: "Second accent", hint: "Badges, matrix axes" },
] as const satisfies readonly { key: keyof CustomPalette; label: string; hint: string }[];

const ROLE_LABELS: Record<string, string> = { text: "Text", muted: "Secondary text", accent: "Accent", accent2: "Second accent" };

function Swatch({ role, value, onChange }: { role: (typeof ROLES)[number]; value: string; onChange: (hex: string) => void }) {
  const [text, setText] = useState(value);
  // Follow the committed value when it changes elsewhere (undo, a preset, another window).
  const [committed, setCommitted] = useState(value);
  if (committed !== value) {
    setCommitted(value);
    setText(value);
  }
  const valid = isHexColor(text);
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        aria-label={`${role.label} colour`}
        value={valid ? text : value}
        onChange={(e) => {
          setText(e.target.value.toUpperCase());
          onChange(e.target.value.toUpperCase());
        }}
        className="h-7 w-7 shrink-0 cursor-pointer rounded border border-line bg-transparent p-0.5"
      />
      <div className="min-w-0 flex-1">
        <div className="text-[12px] text-ink">{role.label}</div>
        <div className="truncate text-[11px] text-faint">{role.hint}</div>
      </div>
      <input
        value={text}
        onChange={(e) => {
          const next = e.target.value.toUpperCase();
          setText(next);
          if (isHexColor(next)) onChange(next);
        }}
        spellCheck={false}
        className={cx("w-[76px] rounded-md border bg-transparent px-1.5 py-1 font-mono text-[11.5px] uppercase focus:outline-none", valid ? "border-line focus:border-line-strong" : "border-danger text-danger")}
      />
    </div>
  );
}

export function BrandPalette({ spec }: { spec: LayoutSpec }) {
  const commit = useEditor((s) => s.commit);
  const custom = spec.tokens.customPalette;
  const base = PALETTES[spec.tokens.paletteId].colors;
  // Editing starts from whatever is on screen now, so turning this on never changes the design.
  const [draft, setDraft] = useState<CustomPalette>(custom ?? { ...base });

  // A custom palette never colours text with the accents (see resolveTokens), so the check is the
  // one that matters: body text and secondary text, on the paper and on panels.
  const readable = (palette: CustomPalette) => paletteContrastIssues(palette, { accentForText: false, accent2ForText: false });

  const apply = (next: CustomPalette, summary: string) => {
    setDraft(next);
    if (readable(next).length) return; // held, not saved — the notice below says why
    const edit = setToken(spec, "customPalette", next);
    if (edit) void commit([edit], summary);
  };

  const issues = readable(draft);

  if (!custom) {
    return (
      <div>
        <p className="mb-3 text-[12px] text-muted">Using the {PALETTES[spec.tokens.paletteId].name} palette. Swap in your own colours if the venue has them.</p>
        <Button size="sm" onClick={() => apply({ ...base }, "Started from a custom palette")}>
          Use my brand colours
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col gap-2">
        {ROLES.map((role) => (
          <Swatch key={role.key} role={role} value={draft[role.key]} onChange={(hex) => apply({ ...draft, [role.key]: hex }, `Changed the ${role.label.toLowerCase()} colour`)} />
        ))}
      </div>

      {issues.length ? (
        <div className="mt-3 rounded-md bg-danger-soft px-2.5 py-2 text-[11.5px] text-danger">
          <div className="font-medium">Hard to read</div>
          <ul className="mt-0.5 space-y-0.5">
            {issues.map((issue) => (
              <li key={`${issue.role}-${issue.against}`}>
                {ROLE_LABELS[issue.role]} on {issue.against === "background" ? "the paper" : "panels"} is {issue.ratio.toFixed(1)}:1, under the {AA_TEXT}:1 minimum.
              </li>
            ))}
          </ul>
          <p className="mt-1">A printed menu is read in low light, so this is not saved yet. Darken the text or lighten the paper.</p>
        </div>
      ) : (
        <p className="mt-3 text-[11.5px] text-ok">Text passes AA contrast on the paper and on panels.</p>
      )}

      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="ghost" onClick={() => apply({ ...base }, "Reset the brand colours")}>
          Reset to {PALETTES[spec.tokens.paletteId].name}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            const edit = clearToken(spec, "customPalette");
            if (edit) void commit([edit], "Went back to a catalog palette");
          }}
        >
          Use a catalog palette
        </Button>
      </div>
    </div>
  );
}
