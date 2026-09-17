import { pageColumns, type ArchetypeId, type Block, type MenuItem, type Page } from "@menu-studio/shared";
import { Fragment, type CSSProperties, type ReactNode } from "react";
import { useRenderContext, type RenderContextValue } from "./context.tsx";
import {
  DividerBlock,
  FeaturedItemBlock,
  FooterBlock,
  HeaderBlock,
  ItemListBlock,
  LegendBlock,
  LogoBlock,
  MatrixBlock,
  NoteBlock,
  SectionBlock,
  SectionHeading,
  orderedItems,
} from "./components/blocks.tsx";
import { MenuItemView, type ItemVariant } from "./components/Item.tsx";
import { JourneyView } from "./components/Journey.tsx";
import { orderBlocks, toBands } from "./layout/flow.ts";

const VARIANTS: Record<ArchetypeId, ItemVariant> = {
  classic_list: "row",
  two_column: "row",
  flavor_matrix: "row",
  editorial: "editorial",
  by_base_spirit: "row",
  tasting_journey: "compact",
  poster: "row",
  chalkboard: "row",
  grid_cards: "card",
  mobile_stack: "mobile",
};

function spiritHeading(ctx: RenderContextValue, block: Block): string | undefined {
  if (ctx.spec.archetype !== "by_base_spirit") return undefined;
  const first = block.itemRefs?.map((r) => ctx.items.get(r)?.item).find(Boolean);
  const spirit = first?.attributes.baseSpirit ?? "Other";
  return spirit.charAt(0).toUpperCase() + spirit.slice(1);
}

export function renderBlock(ctx: RenderContextValue, block: Block, variant: ItemVariant): ReactNode {
  switch (block.type) {
    case "header":
      return <HeaderBlock key={block.id} block={block} />;
    case "logo":
      return <LogoBlock key={block.id} block={block} />;
    case "section":
      return <SectionBlock key={block.id} block={block} variant={variant} />;
    case "itemList": {
      const heading = spiritHeading(ctx, block);
      return heading ? <ItemListBlock key={block.id} block={block} variant={variant} heading={heading} /> : <ItemListBlock key={block.id} block={block} variant={variant} />;
    }
    case "matrix":
      return <MatrixBlock key={block.id} block={block} />;
    case "divider":
      return <DividerBlock key={block.id} block={block} />;
    case "note":
      return <NoteBlock key={block.id} block={block} />;
    case "footer":
      return <FooterBlock key={block.id} block={block} />;
    case "featuredItem":
      return <FeaturedItemBlock key={block.id} block={block} />;
    case "legend":
      return <LegendBlock key={block.id} block={block} />;
  }
}

const TRAILING = new Set(["legend", "note", "footer", "divider"]);

function FlowContent({ page }: { page: Page }) {
  const ctx = useRenderContext();
  const variant = VARIANTS[ctx.spec.archetype];
  const columns = pageColumns(ctx.spec.archetype, ctx.spec.format, ctx.spec.orientation);
  const panels = ctx.spec.format === "DL_TRIFOLD" || ctx.spec.format === "BIFOLD_A4";

  if (panels) {
    const count = ctx.spec.format === "DL_TRIFOLD" ? 3 : 2;
    const cols: Block[][] = Array.from({ length: count }, () => []);
    for (const block of orderBlocks(page.blocks)) {
      const full = block.gridArea.colSpan >= columns;
      const index = full ? (TRAILING.has(block.type) ? count - 1 : 0) : Math.min(count, block.gridArea.col) - 1;
      cols[index]?.push(block);
    }
    return (
      <>
        {cols.map((blocks, i) => (
          <div key={i} className="ms-column ms-column--panel" data-ms-column={i}>
            {blocks.map((b) => renderBlock(ctx, b, variant))}
          </div>
        ))}
      </>
    );
  }

  const bands = toBands(page.blocks, columns);
  return (
    <>
      {bands.map((band, i) =>
        band.kind === "full" ? (
          <Fragment key={band.block.id}>{renderBlock(ctx, band.block, variant)}</Fragment>
        ) : (
          <div key={`band-${i}`} className="ms-band" style={{ ["--ms-cols" as string]: String(columns) } as CSSProperties}>
            {band.columns.map((col, c) => (
              <div key={c} className="ms-column" data-ms-column={c}>
                {col.map((b) => renderBlock(ctx, b, variant))}
              </div>
            ))}
          </div>
        ),
      )}
    </>
  );
}

function EditorialContent({ page }: { page: Page }) {
  const ctx = useRenderContext();
  return (
    <div className="ms-editorial">
      {orderBlocks(page.blocks).map((block) => (
        <div
          key={block.id}
          className="ms-editorial__cell"
          style={{
            gridColumn: `${Math.min(3, block.gridArea.col)} / span ${Math.min(3, block.gridArea.colSpan)}`,
            gridRow: `${block.gridArea.row} / span ${block.gridArea.rowSpan}`,
          }}
        >
          {renderBlock(ctx, block, "editorial")}
        </div>
      ))}
    </div>
  );
}

function JourneyContent({ page, first }: { page: Page; first: boolean }) {
  const ctx = useRenderContext();
  const ordered = orderBlocks(page.blocks);
  const leading = ordered.filter((b) => b.type === "header" || b.type === "logo");
  const rest = ordered.filter((b) => b.type !== "header" && b.type !== "logo" && b.type !== "section" && b.type !== "itemList");
  return (
    <>
      {leading.map((b) => renderBlock(ctx, b, "compact"))}
      {first ? <JourneyView /> : null}
      {rest.map((b) => renderBlock(ctx, b, "compact"))}
    </>
  );
}

export function PageContent({ page, index }: { page: Page; index: number }) {
  const ctx = useRenderContext();
  if (ctx.spec.archetype === "editorial") return <EditorialContent page={page} />;
  if (ctx.spec.archetype === "tasting_journey") return <JourneyContent page={page} first={index === 0} />;
  return <FlowContent page={page} />;
}

/** Phone layout: sticky section tabs and collapsible sections. Used for QR menus. */
export function MobileStack() {
  const ctx = useRenderContext();
  const blocks = ctx.spec.pages.flatMap((p) => orderBlocks(p.blocks));
  const sectionBlocks = blocks.filter((b) => b.type === "section" && b.sectionRef && ctx.sections.has(b.sectionRef));
  const seen = new Set<string>();
  const tabs = sectionBlocks
    .map((b) => ctx.sections.get(b.sectionRef ?? ""))
    .filter((s): s is NonNullable<typeof s> => {
      if (!s || seen.has(s.section.id)) return false;
      seen.add(s.section.id);
      return true;
    });
  const renderedSections = new Set<string>();

  return (
    <div className="ms-mobile">
      {blocks
        .filter((b) => b.type === "header" || b.type === "logo")
        .map((b) => renderBlock(ctx, b, "mobile"))}
      {tabs.length > 1 ? (
        <nav className="ms-mobile__tabs" aria-label="Sections" data-ms-tabs>
          {tabs.map(({ section }) => (
            <a key={section.id} href={`#section-${section.id}`} data-ms-tab={section.id}>
              {section.translations?.[ctx.lang]?.title ?? section.title}
            </a>
          ))}
        </nav>
      ) : null}
      {blocks
        .filter((b) => b.type !== "header" && b.type !== "logo")
        .map((block) => {
          if (block.type === "section" && block.sectionRef) {
            const found = ctx.sections.get(block.sectionRef);
            if (!found || renderedSections.has(found.section.id)) return null;
            renderedSections.add(found.section.id);
            const items = orderedItems(ctx, found.section.items);
            return (
              <details key={block.id} className="ms-mobile__section" id={`section-${found.section.id}`} open data-ms-block={block.id} data-ms-section={found.section.id}>
                <summary>
                  <SectionHeading section={found.section} continued={false} />
                </summary>
                <MobileSectionItems items={items} sectionId={found.section.id} />
              </details>
            );
          }
          return renderBlock(ctx, block, "mobile");
        })}
    </div>
  );
}

function MobileSectionItems({ items, sectionId }: { items: MenuItem[]; sectionId: string }) {
  const ctx = useRenderContext();
  const section = ctx.sections.get(sectionId)?.section;
  if (section?.availability && ctx.now) {
    // Availability is re-checked on the client at view time; the server render marks the window.
  }
  return (
    <div className="ms-items" data-ms-availability={section?.availability ? JSON.stringify(section.availability) : undefined}>
      {items.map((item) => (
        <MenuItemView key={item.id} item={item} variant="mobile" />
      ))}
    </div>
  );
}
