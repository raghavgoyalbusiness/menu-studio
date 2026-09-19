import { BACKGROUND_TEXTURES, FONT_PAIRING_IDS, FONT_PAIRINGS, ORNAMENT_STYLES, PALETTE_IDS, PALETTES } from "@menu-studio/design-system/catalog";
import {
  ARCHETYPE_IDS,
  ARCHETYPES,
  archetypeEligibility,
  DENSITIES,
  EMPHASES,
  ICON_SETS,
  PRICE_PLACEMENTS,
  PRICE_STYLES,
  TEXT_CASES,
  type Edit,
  type Tokens,
} from "@menu-studio/shared";
import type { ReactNode } from "react";
import { IconLock, IconRefresh, IconUnlock } from "../components/icons.tsx";
import { Button, cx, Segmented, Select, Slider } from "../components/ui.tsx";
import { BrandPalette } from "./BrandPalette.tsx";
import { useEditor } from "../stores/editor.ts";
import { moveBlockBy, moveMatrixItem, resetMatrixItem, setBlockEmphasis, setBlockOverride, setMatrixLock, setToken, switchArchetype } from "./spec-edits.ts";

const pretty = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-line px-4 py-4">
      <h3 className="eyebrow mb-3">{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-2.5 flex items-center justify-between gap-3 last:mb-0">
      <span className="text-[12.5px] text-ink-2">{label}</span>
      <div className="w-40">{children}</div>
    </div>
  );
}

export function InspectorPanel() {
  const { document: doc, spec, selectedBlockId, selectedItemId, commit } = useEditor();
  if (!doc || !spec) return null;
  const run = (edit: Edit | null, summary: string) => edit && void commit([edit], summary);
  const token = <K extends keyof Tokens>(key: K, value: Tokens[K]) => run(setToken(spec, key, value), `Changed ${pretty(String(key)).toLowerCase()}`);
  const block = spec.pages.flatMap((p) => p.blocks).find((b) => b.id === selectedBlockId);
  const placement = selectedItemId ? spec.matrix?.placements.find((p) => p.itemId === selectedItemId) : undefined;
  const placementItem = placement ? doc.sections.flatMap((s) => s.items).find((i) => i.id === placement.itemId) : undefined;

  return (
    <div className="scroll-quiet h-full overflow-y-auto">
      {placement && placementItem ? (
        <Group title={`Matrix · ${placementItem.name}`}>
          <div className="mb-3">
            <div className="mb-1.5 flex justify-between text-[11.5px] text-muted">
              <span>{spec.matrix?.xAxis.negLabel}</span>
              <span>{spec.matrix?.xAxis.posLabel}</span>
            </div>
            <Slider label="Horizontal position" min={-1} max={1} step={0.05} value={placement.x} onChange={() => undefined} onCommit={(x) => run(moveMatrixItem(spec, placement.itemId, x, placement.y), `Moved ${placementItem.name}`)} />
          </div>
          <div className="mb-3">
            <div className="mb-1.5 flex justify-between text-[11.5px] text-muted">
              <span>{spec.matrix?.yAxis.negLabel}</span>
              <span>{spec.matrix?.yAxis.posLabel}</span>
            </div>
            <Slider label="Vertical position" min={-1} max={1} step={0.05} value={placement.y} onChange={() => undefined} onCommit={(y) => run(moveMatrixItem(spec, placement.itemId, placement.x, y), `Moved ${placementItem.name}`)} />
          </div>
          <div className="flex gap-2">
            <Button size="sm" icon={placement.locked ? <IconUnlock size={13} /> : <IconLock size={13} />} onClick={() => run(setMatrixLock(spec, placement.itemId, !placement.locked), placement.locked ? "Unlocked a placement" : "Locked a placement")}>
              {placement.locked ? "Unlock" : "Lock"}
            </Button>
            <Button size="sm" variant="ghost" icon={<IconRefresh size={13} />} disabled={!placement.ai} onClick={() => run(resetMatrixItem(spec, placement.itemId), "Reset to AI placement")}>
              Reset to AI placement
            </Button>
          </div>
          <p className="mt-2 text-[11.5px] text-muted">Drag on the canvas, or use arrow keys. Locked drinks never move when labels are spaced out.</p>
        </Group>
      ) : null}

      {block ? (
        <Group title={`Selected · ${pretty(block.type)}`}>
          <Row label="Emphasis">
            <Segmented size="sm" value={block.emphasis} onChange={(v) => run(setBlockEmphasis(spec, block.id, v), "Changed emphasis")} options={EMPHASES.map((e) => ({ value: e, label: pretty(e) }))} />
          </Row>
          <Row label="Colour role">
            <Select value={block.styleOverrides?.paletteRole ?? "default"} onChange={(e) => run(setBlockOverride(spec, block.id, "paletteRole", e.target.value === "default" ? undefined : (e.target.value as "accent")), "Changed colour role")}>
              {["default", "accent", "accent2", "inverse"].map((r) => (
                <option key={r} value={r}>
                  {pretty(r)}
                </option>
              ))}
            </Select>
          </Row>
          <Row label="Alignment">
            <Segmented size="sm" value={block.styleOverrides?.align ?? "start"} onChange={(v) => run(setBlockOverride(spec, block.id, "align", v === "start" ? undefined : v), "Changed alignment")} options={[{ value: "start", label: "Start" }, { value: "center", label: "Centre" }]} />
          </Row>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={() => run(moveBlockBy(spec, block.id, -1), "Moved a block up")}>
              Move up
            </Button>
            <Button size="sm" onClick={() => run(moveBlockBy(spec, block.id, 1), "Moved a block down")}>
              Move down
            </Button>
          </div>
        </Group>
      ) : null}

      <Group title="Layout">
        <div className="grid grid-cols-2 gap-1.5">
          {ARCHETYPE_IDS.map((id) => {
            const eligibility = archetypeEligibility(id, doc, spec.format);
            return (
              <button
                key={id}
                disabled={!eligibility.eligible}
                title={eligibility.reason ?? ARCHETYPES[id].summary}
                onClick={() => run(switchArchetype(doc, spec, id), `Switched to ${ARCHETYPES[id].label}`)}
                className={cx(
                  "rounded-md border px-2 py-2 text-left text-[12px] transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                  spec.archetype === id ? "border-ink bg-card text-ink" : "border-line text-ink-2 hover:border-line-strong",
                )}
              >
                {ARCHETYPES[id].label}
              </button>
            );
          })}
        </div>
      </Group>

      <Group title="Typography">
        <div className="flex flex-col gap-1.5">
          {FONT_PAIRING_IDS.map((id) => {
            const p = FONT_PAIRINGS[id];
            return (
              <button key={id} onClick={() => token("fontPairingId", id)} className={cx("flex items-baseline justify-between rounded-md border px-3 py-2 text-left transition-colors", spec.tokens.fontPairingId === id ? "border-ink bg-card" : "border-line hover:border-line-strong")}>
                <span className="text-[17px] leading-tight" style={{ fontFamily: `"${p.display.family}"` }}>
                  {p.name}
                </span>
                <span className="text-[10.5px] text-muted" style={{ fontFamily: `"${p.body.family}"` }}>
                  {p.scripts.filter((s) => s !== "latin").join(", ")}
                </span>
              </button>
            );
          })}
        </div>
      </Group>

      <Group title="Colour">
        <div className="grid grid-cols-3 gap-2">
          {PALETTE_IDS.map((id) => {
            const p = PALETTES[id];
            return (
              <button key={id} onClick={() => token("paletteId", id)} className={cx("overflow-hidden rounded-md border text-left transition-colors", spec.tokens.paletteId === id ? "border-ink ring-1 ring-ink" : "border-line hover:border-line-strong")} title={p.moodTags.join(", ")}>
                <div className="flex h-9" style={{ background: p.colors.background }}>
                  <span className="m-auto h-3 w-3 rounded-full" style={{ background: p.colors.accent }} />
                  <span className="m-auto mr-2 h-1.5 w-6 rounded-full" style={{ background: p.colors.text }} />
                </div>
                <div className="truncate px-1.5 py-1 text-[10.5px] text-ink-2">{p.name}</div>
              </button>
            );
          })}
        </div>
      </Group>

      <Group title="Your brand colours">
        <BrandPalette spec={spec} />
      </Group>

      <Group title="Details">
        <Row label="Density">
          <Segmented size="sm" value={spec.tokens.density} onChange={(v) => token("density", v)} options={DENSITIES.map((d) => ({ value: d, label: pretty(d) }))} />
        </Row>
        <Row label="Ornament">
          <Select value={spec.tokens.ornamentStyle} onChange={(e) => token("ornamentStyle", e.target.value as Tokens["ornamentStyle"])}>
            {ORNAMENT_STYLES.map((o) => (
              <option key={o} value={o}>
                {pretty(o)}
              </option>
            ))}
          </Select>
        </Row>
        <Row label="Icons">
          <Select value={spec.tokens.iconSet} onChange={(e) => token("iconSet", e.target.value as Tokens["iconSet"])}>
            {ICON_SETS.map((o) => (
              <option key={o} value={o}>
                {pretty(o)}
              </option>
            ))}
          </Select>
        </Row>
        <Row label="Price placement">
          <Select value={spec.tokens.pricePlacement} onChange={(e) => token("pricePlacement", e.target.value as Tokens["pricePlacement"])}>
            {PRICE_PLACEMENTS.map((o) => (
              <option key={o} value={o}>
                {pretty(o)}
              </option>
            ))}
          </Select>
        </Row>
        <Row label="Price style">
          <Select value={spec.tokens.priceStyle} onChange={(e) => token("priceStyle", e.target.value as Tokens["priceStyle"])}>
            {PRICE_STYLES.map((o) => (
              <option key={o} value={o}>
                {pretty(o)}
              </option>
            ))}
          </Select>
        </Row>
        <Row label="Text case">
          <Select value={spec.tokens.textCase} onChange={(e) => token("textCase", e.target.value as Tokens["textCase"])}>
            {TEXT_CASES.map((o) => (
              <option key={o} value={o}>
                {pretty(o)}
              </option>
            ))}
          </Select>
        </Row>
        <Row label="Texture">
          <Select value={spec.tokens.backgroundTexture} onChange={(e) => token("backgroundTexture", e.target.value as Tokens["backgroundTexture"])}>
            {BACKGROUND_TEXTURES.map((o) => (
              <option key={o} value={o}>
                {pretty(o)}
              </option>
            ))}
          </Select>
        </Row>
        <div className="mt-3">
          <div className="mb-1.5 flex justify-between text-[12.5px] text-ink-2">
            <span>Text size</span>
            <span className="tabular-nums text-muted">{Math.round(spec.tokens.bodyScale * 100)}%</span>
          </div>
          <Slider label="Text size" min={0.85} max={1.2} step={0.05} value={spec.tokens.bodyScale} onChange={() => undefined} onCommit={(v) => token("bodyScale", Math.round(v * 100) / 100)} />
        </div>
      </Group>
    </div>
  );
}
