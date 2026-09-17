import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Block, LayoutSpec, MenuDocument } from "@menu-studio/shared";
import { IconGrip } from "../components/icons.tsx";
import { cx } from "../components/ui.tsx";
import { moveSection } from "../lib/doc-edits.ts";
import { useEditor } from "../stores/editor.ts";
import { reorderBlocks } from "./spec-edits.ts";

const TYPE_LABEL: Record<Block["type"], string> = {
  header: "Header",
  logo: "Logo",
  section: "Section",
  itemList: "Item list",
  matrix: "Flavor matrix",
  divider: "Divider",
  note: "Note",
  footer: "Footer",
  featuredItem: "Featured item",
  legend: "Legend",
};

function blockLabel(block: Block, doc: MenuDocument): string {
  if (block.sectionRef) return doc.sections.find((s) => s.id === block.sectionRef)?.title ?? "Missing section";
  if (block.itemRefs?.length) {
    const names = block.itemRefs.map((r) => doc.sections.flatMap((s) => s.items).find((i) => i.id === r)?.name).filter(Boolean);
    return names.length === 1 ? (names[0] ?? "") : `${names[0] ?? ""} +${names.length - 1}`;
  }
  if (block.type === "note") return block.noteRef === "taxNote" ? "Tax note" : block.noteRef === "allergenDisclaimer" ? "Allergen note" : "Footer note";
  return TYPE_LABEL[block.type];
}

function SortableBlock({ block, doc, selected, onSelect }: { block: Block; doc: MenuDocument; selected: boolean; onSelect: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cx("group flex items-center gap-1.5 rounded-md", isDragging && "z-10 bg-card shadow-soft")}>
      <button className="cursor-grab px-0.5 text-faint opacity-0 group-hover:opacity-100" aria-label={`Reorder ${blockLabel(block, doc)}`} {...attributes} {...listeners}>
        <IconGrip size={14} />
      </button>
      <button onClick={onSelect} className={cx("flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] transition-colors", selected ? "bg-ink text-paper" : "text-ink-2 hover:bg-paper-2")}>
        <span className="truncate">{blockLabel(block, doc)}</span>
        <span className={cx("shrink-0 text-[10.5px] uppercase tracking-wide", selected ? "text-paper/60" : "text-faint")}>{TYPE_LABEL[block.type]}</span>
      </button>
    </li>
  );
}

function PageLayers({ spec, doc, pageIndex }: { spec: LayoutSpec; doc: MenuDocument; pageIndex: number }) {
  const page = spec.pages[pageIndex];
  const { selectedBlockId, select, commit } = useEditor();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  if (!page) return null;
  const ordered = [...page.blocks].sort((a, b) => a.gridArea.row - b.gridArea.row || a.gridArea.col - b.gridArea.col);
  const onDragEnd = (event: DragEndEvent) => {
    const from = ordered.findIndex((b) => b.id === event.active.id);
    const to = ordered.findIndex((b) => b.id === event.over?.id);
    if (from < 0 || to < 0 || from === to) return;
    const edit = reorderBlocks(spec, pageIndex, arrayMove(ordered, from, to).map((b) => b.id));
    if (edit) void commit([edit], "Reordered blocks");
  };
  return (
    <div className="mb-4">
      <div className="eyebrow mb-1.5 px-2">Page {pageIndex + 1}</div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ordered.map((b) => b.id)} strategy={verticalListSortingStrategy}>
          <ul className="space-y-0.5">
            {ordered.map((block) => (
              <SortableBlock
                key={block.id}
                block={block}
                doc={doc}
                selected={selectedBlockId === block.id}
                onSelect={() => {
                  select(block.id, null);
                  document.querySelector(`[data-ms-block="${block.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}

export function LayersPanel() {
  const { document: doc, spec, commit } = useEditor();
  if (!doc || !spec) return null;
  return (
    <div className="scroll-quiet h-full overflow-y-auto px-2 py-4">
      {spec.pages.map((_, i) => (
        <PageLayers key={spec.pages[i]?.id} spec={spec} doc={doc} pageIndex={i} />
      ))}
      <div className="mt-6 border-t border-line pt-4">
        <div className="eyebrow mb-2 px-2">Section order</div>
        <ul className="space-y-0.5">
          {doc.sections.map((section, i) => (
            <li key={section.id} className="flex items-center justify-between gap-2 rounded-md px-2 py-1 text-[12.5px] text-ink-2 hover:bg-paper-2">
              <span className="truncate">{section.title}</span>
              <span className="flex shrink-0 gap-0.5">
                <button className="rounded px-1 text-muted hover:bg-line disabled:opacity-30" disabled={i === 0} onClick={() => { const e = moveSection(doc, section.id, i - 1); if (e) void commit([e], "Moved a section"); }} aria-label={`Move ${section.title} up`}>
                  ↑
                </button>
                <button className="rounded px-1 text-muted hover:bg-line disabled:opacity-30" disabled={i === doc.sections.length - 1} onClick={() => { const e = moveSection(doc, section.id, i + 1); if (e) void commit([e], "Moved a section"); }} aria-label={`Move ${section.title} down`}>
                  ↓
                </button>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
