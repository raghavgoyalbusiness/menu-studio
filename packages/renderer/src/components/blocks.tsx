import { ALLERGEN_LABELS, DIETARY_LABELS, DIETARY_LEGEND_ORDER } from "@menu-studio/design-system/catalog";
import { DietaryMark, Divider } from "@menu-studio/design-system/react";
import {
  confirmedAllergens,
  confirmedDietaryTags,
  DEFAULT_ALLERGEN_DISCLAIMER,
  isAvailableAt,
  sectionDisplaySubtitle,
  sectionDisplayTitle,
  type Block,
  type MenuItem,
  type MenuSection,
  type SectionAvailability,
} from "@menu-studio/shared";
import type { ReactNode } from "react";
import { useRenderContext, type RenderContextValue } from "../context.tsx";
import { Editable } from "./Editable.tsx";
import { MenuItemView, type ItemVariant } from "./Item.tsx";
import { MatrixView } from "./Matrix.tsx";

const DAY_LABELS: Record<string, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
const DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export function availabilityLabel(availability: SectionAvailability): string {
  const days = [...availability.days].sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
  let dayText: string;
  if (days.length === 7) dayText = "Daily";
  else {
    const indexes = days.map((d) => DAY_ORDER.indexOf(d));
    const contiguous = indexes.every((n, i) => i === 0 || n === (indexes[i - 1] ?? -2) + 1);
    dayText = contiguous && days.length > 2 ? `${DAY_LABELS[days[0] ?? ""]}–${DAY_LABELS[days[days.length - 1] ?? ""]}` : days.map((d) => DAY_LABELS[d]).join(", ");
  }
  return `${dayText} · ${availability.startTime}–${availability.endTime}`;
}

/** Engineering boost order: stars and puzzles lead a section when enabled; otherwise source order. */
export function orderedItems(ctx: RenderContextValue, items: readonly MenuItem[]): MenuItem[] {
  let list = ctx.mode === "qr" ? items.filter((i) => i.available) : [...items];
  if (ctx.spec.engineeringApplied) {
    const rank = (i: MenuItem) => (i.engineering?.quadrant === "star" ? 0 : i.engineering?.quadrant === "puzzle" ? 1 : 2);
    list = list.map((item, index) => ({ item, index })).sort((a, b) => rank(a.item) - rank(b.item) || a.index - b.index).map((x) => x.item);
  }
  return list;
}

export function BlockFrame({ block, children, className }: { block: Block; children: ReactNode; className?: string }) {
  const ctx = useRenderContext();
  const overrides = block.styleOverrides;
  const classes = [
    "ms-block",
    `ms-block--${block.type}`,
    `ms-emphasis--${block.emphasis}`,
    overrides?.paletteRole && overrides.paletteRole !== "default" ? `ms-role--${overrides.paletteRole}` : "",
    overrides?.density ? `ms-density--${overrides.density}` : "",
    overrides?.textCase ? `ms-case-${overrides.textCase}` : "",
    overrides?.align ? `ms-align--${overrides.align}` : "",
    ctx.selectedBlockId === block.id ? "ms-block--selected" : "",
    ctx.highlightBlockIds.has(block.id) ? "ms-block--overflow" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  const onClick = ctx.editing
    ? (event: React.MouseEvent) => {
        event.stopPropagation();
        ctx.editing?.selectBlock(block.id);
      }
    : undefined;
  return (
    <div className={classes} data-ms-block={block.id} onClick={onClick}>
      {children}
    </div>
  );
}

function ornamentFor(ctx: RenderContextValue, block?: Block) {
  return block?.styleOverrides?.ornament ?? ctx.spec.tokens.ornamentStyle;
}

export function HeaderBlock({ block }: { block: Block }) {
  const ctx = useRenderContext();
  const ornament = ornamentFor(ctx, block);
  return (
    <BlockFrame block={block}>
      <header className="ms-header">
        {ctx.logoUrl && block.emphasis !== "normal" ? <img className="ms-header__logo" src={ctx.logoUrl} alt="" /> : null}
        <h1 className="ms-venue">
          <Editable pointer="/venueName" value={ctx.document.venueName} />
        </h1>
        {ornament !== "none" ? <Divider style={ornament} className="ms-header__rule" /> : null}
      </header>
    </BlockFrame>
  );
}

export function LogoBlock({ block }: { block: Block }) {
  const ctx = useRenderContext();
  const initials = ctx.document.venueName
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 3);
  return (
    <BlockFrame block={block}>
      <div className="ms-logo">{ctx.logoUrl ? <img src={ctx.logoUrl} alt={ctx.document.venueName} /> : <span className="ms-logo__monogram">{initials}</span>}</div>
    </BlockFrame>
  );
}

export function SectionHeading({ section, continued }: { section: MenuSection; continued: boolean }) {
  const ctx = useRenderContext();
  const index = ctx.sections.get(section.id)?.index;
  const pointer = index === undefined ? null : `/sections/${index}`;
  const title = sectionDisplayTitle(section, ctx.lang);
  const subtitle = sectionDisplaySubtitle(section, ctx.lang);
  return (
    <div className="ms-section__heading">
      <h2 className="ms-section__title">
        <Editable pointer={pointer ? `${pointer}/title` : null} value={title} />
        {continued ? <span className="ms-section__continued"> (continued)</span> : null}
      </h2>
      {subtitle ? <Editable as="p" className="ms-section__subtitle" pointer={pointer ? `${pointer}/subtitle` : null} value={subtitle} /> : null}
      {section.description && !continued ? <Editable as="p" className="ms-section__description" pointer={pointer ? `${pointer}/description` : null} value={section.description} multiline /> : null}
      {section.availability && (ctx.mode === "qr" || !subtitle) ? <p className="ms-section__availability">{availabilityLabel(section.availability)}</p> : null}
    </div>
  );
}

export function SectionBlock({ block, variant }: { block: Block; variant: ItemVariant }) {
  const ctx = useRenderContext();
  const found = block.sectionRef ? ctx.sections.get(block.sectionRef) : undefined;
  if (!found) return null;
  const { section } = found;
  const slice = block.itemSlice;
  const sliced = slice ? section.items.slice(slice.start, slice.end) : section.items;
  const available = !ctx.now || !section.availability || isAvailableAt(section.availability, ctx.now, ctx.timezone);
  const items = orderedItems(ctx, sliced);
  if (!items.length && ctx.mode === "qr") return null;
  return (
    <BlockFrame block={block} className={available ? "" : "ms-section--unavailable"}>
      <section className={`ms-section ms-section--${variant}`}>
        <SectionHeading section={section} continued={Boolean(slice && slice.start > 0)} />
        {available ? (
          <div className={variant === "card" ? "ms-cards" : "ms-items"}>
            {items.map((item) => (
              <MenuItemView key={item.id} item={item} variant={variant} />
            ))}
          </div>
        ) : (
          <p className="ms-section__closed">Not being served right now.</p>
        )}
      </section>
    </BlockFrame>
  );
}

export function ItemListBlock({ block, variant, heading }: { block: Block; variant: ItemVariant; heading?: string }) {
  const ctx = useRenderContext();
  const items = orderedItems(
    ctx,
    (block.itemRefs ?? []).map((ref) => ctx.items.get(ref)?.item).filter((i): i is MenuItem => Boolean(i)),
  );
  if (!items.length) return null;
  return (
    <BlockFrame block={block}>
      <section className={`ms-section ms-section--${variant}`}>
        {heading ? (
          <div className="ms-section__heading">
            <h2 className="ms-section__title">{heading}</h2>
          </div>
        ) : null}
        <div className={variant === "card" ? "ms-cards" : "ms-items"}>
          {items.map((item) => (
            <MenuItemView key={item.id} item={item} variant={variant} />
          ))}
        </div>
      </section>
    </BlockFrame>
  );
}

export function FeaturedItemBlock({ block }: { block: Block }) {
  const ctx = useRenderContext();
  const item = block.itemRefs?.[0] ? ctx.items.get(block.itemRefs[0])?.item : undefined;
  if (!item || (ctx.mode === "qr" && !item.available)) return null;
  return (
    <BlockFrame block={block}>
      <aside className="ms-feature">
        <MenuItemView item={item} variant="feature" />
      </aside>
    </BlockFrame>
  );
}

export function DividerBlock({ block }: { block: Block }) {
  const ctx = useRenderContext();
  const style = ornamentFor(ctx, block);
  return (
    <BlockFrame block={block}>
      <Divider style={style === "none" ? "hairline" : style} />
    </BlockFrame>
  );
}

export function noteText(ctx: RenderContextValue, block: Block): { text: string; pointer: string | null } | null {
  const ref = block.noteRef;
  if (ref === "taxNote") return ctx.document.taxNote ? { text: ctx.document.taxNote, pointer: "/taxNote" } : null;
  if (ref === "allergenDisclaimer") {
    return { text: ctx.document.allergenDisclaimer ?? DEFAULT_ALLERGEN_DISCLAIMER, pointer: ctx.document.allergenDisclaimer ? "/allergenDisclaimer" : null };
  }
  if (typeof ref === "number") {
    const text = ctx.document.footerNotes[ref];
    return text ? { text, pointer: `/footerNotes/${ref}` } : null;
  }
  return null;
}

export function NoteBlock({ block }: { block: Block }) {
  const ctx = useRenderContext();
  const note = noteText(ctx, block);
  if (!note) return null;
  return (
    <BlockFrame block={block}>
      <Editable as="p" className="ms-note" pointer={note.pointer} value={note.text} multiline />
    </BlockFrame>
  );
}

export function FooterBlock({ block }: { block: Block }) {
  const ctx = useRenderContext();
  const referenced = new Set(
    ctx.spec.pages.flatMap((p) => p.blocks).flatMap((b) => (b.type === "note" && typeof b.noteRef === "number" ? [b.noteRef] : [])),
  );
  const notes = ctx.document.footerNotes.map((text, i) => ({ text, i })).filter((n) => !referenced.has(n.i));
  return (
    <BlockFrame block={block}>
      <footer className="ms-footer">
        {ctx.qrCode ? (
          <figure className="ms-qr">
            <img src={ctx.qrCode.src} alt="" />
            <figcaption>{ctx.qrCode.caption}</figcaption>
          </figure>
        ) : null}
        {notes.map((n, idx) => (
          <span key={n.i} className="ms-footer__note">
            {idx > 0 ? <span className="ms-footer__sep" aria-hidden> · </span> : null}
            <Editable pointer={`/footerNotes/${n.i}`} value={n.text} />
          </span>
        ))}
      </footer>
    </BlockFrame>
  );
}

export function LegendBlock({ block }: { block: Block }) {
  const ctx = useRenderContext();
  if (ctx.spec.tokens.iconSet === "none") return null;
  const used = new Set(ctx.document.sections.flatMap((s) => s.items.flatMap((i) => confirmedDietaryTags(i))));
  const tags = DIETARY_LEGEND_ORDER.filter((t) => used.has(t));
  if (!tags.length) return null;
  return (
    <BlockFrame block={block}>
      <div className="ms-legend">
        {tags.map((tag) => (
          <span key={tag} className="ms-legend__entry">
            <DietaryMark tag={tag} />
            <span>{DIETARY_LABELS[tag]}</span>
          </span>
        ))}
      </div>
    </BlockFrame>
  );
}

export function MatrixBlock({ block }: { block: Block }) {
  return (
    <BlockFrame block={block}>
      <MatrixView />
    </BlockFrame>
  );
}

export function allergensShown(ctx: RenderContextValue): string[] {
  return [...new Set(ctx.document.sections.flatMap((s) => s.items.flatMap((i) => confirmedAllergens(i))))].map((a) => ALLERGEN_LABELS[a] ?? a);
}
