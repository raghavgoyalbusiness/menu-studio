import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ALLERGEN_LABELS, DIETARY_LABELS, GLASSWARE_TYPES } from "@menu-studio/design-system/catalog";
import {
  ALLERGENS,
  DIETARY_TAGS,
  formatMoney,
  isDrink,
  parseMoney,
  unconfirmedCount,
  WEEKDAYS,
  type Edit,
  type ExtractionWarning,
  type ExtractResponse,
  type InferrableField,
  type MenuDocument,
  type MenuItem,
  type MenuSection,
} from "@menu-studio/shared";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { IconArrowRight, IconCheck, IconGrip, IconPlus, IconTrash, IconX } from "../../components/icons.tsx";
import { Badge, Button, Card, cx, ErrorNotice, Notice, PageHeader, ProgressSteps, Spinner, Switch, useElapsed } from "../../components/ui.tsx";
import { api } from "../../lib/api.ts";
import { useProject } from "../../lib/queries.ts";
import {
  addItem,
  addSection,
  clearInferred,
  confirmAllInferred,
  confirmInferred,
  moveItem,
  moveSection,
  removeItem,
  removeSection,
  setItemAttribute,
  setItemFields,
  setSectionFields,
} from "../../lib/doc-edits.ts";
import { useEditor } from "../../stores/editor.ts";

function useCommit() {
  const commit = useEditor((s) => s.commit);
  return (edit: Edit | null, summary?: string) => {
    if (edit) void commit([edit], summary);
  };
}

/** Wraps a control; when the field was inferred, shows it with confirm / clear actions. */
function Inferred({ item, field, children, doc }: { item: MenuItem; field: InferrableField; children: ReactNode; doc: MenuDocument }) {
  const commit = useCommit();
  const inferred = item.inferredFields.includes(field);
  if (!inferred) return <>{children}</>;
  return (
    <div className="relative rounded-md bg-warn-soft/70 p-1 ring-1 ring-warn/30">
      {children}
      <div className="mt-1 flex items-center gap-2 px-1 text-[11.5px] text-warn">
        <span>We guessed this</span>
        <button className="inline-flex items-center gap-0.5 font-medium hover:underline" onClick={() => commit(confirmInferred(doc, item.id, [field]), "Confirmed a detail")}>
          <IconCheck size={12} /> Confirm
        </button>
        {field !== "name" ? (
          <button className="inline-flex items-center gap-0.5 hover:underline" onClick={() => commit(clearInferred(doc, item.id, field), "Cleared a guessed detail")}>
            <IconX size={12} /> Clear
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={cx("rounded-full border px-2 py-0.5 text-[11.5px] transition-colors", active ? "border-ink bg-ink text-paper" : "border-line-strong text-muted hover:text-ink")}>
      {children}
    </button>
  );
}

function BlurInput({ value, onCommit, className, placeholder, multiline }: { value: string; onCommit: (v: string) => void; className?: string; placeholder?: string; multiline?: boolean }) {
  const [draft, setDraft] = useState(value);
  // Follow the saved value when it changes elsewhere (undo, AI edit, another window).
  const [committed, setCommitted] = useState(value);
  if (committed !== value) {
    setCommitted(value);
    setDraft(value);
  }
  const commit = () => draft !== value && onCommit(draft);
  if (multiline) {
    return (
      <textarea
        value={draft}
        placeholder={placeholder}
        rows={Math.min(3, Math.max(1, Math.ceil(draft.length / 70)))}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        className={cx("w-full resize-none rounded-md border border-transparent bg-transparent px-2 py-1 text-[13px] text-muted hover:border-line focus:border-line-strong focus:bg-card focus:text-ink focus:outline-none", className)}
      />
    );
  }
  return (
    <input
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      className={cx("w-full rounded-md border border-transparent bg-transparent px-2 py-1 hover:border-line focus:border-line-strong focus:bg-card focus:outline-none", className)}
    />
  );
}

function ItemRow({ item, doc }: { item: MenuItem; doc: MenuDocument }) {
  const commit = useCommit();
  const [open, setOpen] = useState(item.inferredFields.length > 0);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const money = (minor: number) => formatMoney(minor, { locale: doc.locale, currency: doc.currency, symbol: false, trimDecimals: false });
  const [priceError, setPriceError] = useState(false);

  const setPrice = (raw: string) => {
    if (!raw.trim()) return commit(setItemFields(doc, item.id, { price: null }), "Removed a price");
    const minor = parseMoney(raw, doc.currency);
    if (minor === null) return setPriceError(true);
    setPriceError(false);
    commit(setItemFields(doc, item.id, { price: minor }), `Set ${item.name} price`);
  };
  const toggleTag = (tag: (typeof DIETARY_TAGS)[number]) => {
    const has = item.dietaryTags.includes(tag);
    let next = has ? item.dietaryTags.filter((t) => t !== tag) : [...item.dietaryTags, tag];
    if (!has && tag === "veg") next = next.filter((t) => t !== "non_veg");
    if (!has && tag === "non_veg") next = next.filter((t) => t !== "veg");
    if (!has && tag.startsWith("spicy_")) next = next.filter((t) => !t.startsWith("spicy_") || t === tag);
    commit(setItemFields(doc, item.id, { dietaryTags: next, inferredFields: item.inferredFields.filter((f) => f !== "dietaryTags") }), "Updated dietary tags");
  };
  const toggleAllergen = (a: (typeof ALLERGENS)[number]) => {
    const next = item.allergens.includes(a) ? item.allergens.filter((x) => x !== a) : [...item.allergens, a];
    commit(setItemFields(doc, item.id, { allergens: next, inferredFields: item.inferredFields.filter((f) => f !== "allergens") }), "Updated allergens");
  };

  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cx("group border-t border-line px-3 py-3 first:border-t-0", isDragging && "relative z-10 bg-card shadow-float")}>
      <div className="grid grid-cols-[20px_minmax(0,1fr)_120px_auto] items-start gap-2">
        <button className="mt-1.5 cursor-grab text-faint opacity-0 group-hover:opacity-100 active:cursor-grabbing" aria-label="Reorder" {...attributes} {...listeners}>
          <IconGrip size={16} />
        </button>
        <div className="min-w-0">
          <Inferred item={item} field="name" doc={doc}>
            <BlurInput value={item.name} onCommit={(v) => v.trim() && commit(setItemFields(doc, item.id, { name: v.trim() }), "Renamed an item")} className="text-[14px] font-medium text-ink" />
          </Inferred>
          <Inferred item={item} field="description" doc={doc}>
            <BlurInput multiline value={item.description ?? ""} placeholder="Add a description" onCommit={(v) => commit(setItemFields(doc, item.id, { description: v.trim() || undefined }), "Edited a description")} />
          </Inferred>
        </div>
        <div>
          {item.priceVariants.length ? (
            <div className="space-y-1 pt-1 text-right text-[12.5px]">
              {item.priceVariants.map((v, i) => (
                <div key={`${v.label}-${i}`} className="flex items-center justify-end gap-1.5">
                  <span className="text-muted">{v.label}</span>
                  <input
                    defaultValue={money(v.price)}
                    key={v.price}
                    onBlur={(e) => {
                      const minor = parseMoney(e.target.value, doc.currency);
                      if (minor === null || minor === v.price) return;
                      const variants = item.priceVariants.map((pv, j) => (j === i ? { ...pv, price: minor } : pv));
                      commit(setItemFields(doc, item.id, { priceVariants: variants, price: i === 0 ? minor : item.price }), "Edited a price");
                    }}
                    className="w-20 rounded-md border border-line bg-card px-2 py-1 text-right tabular-nums"
                  />
                </div>
              ))}
            </div>
          ) : (
            <Inferred item={item} field="price" doc={doc}>
              <input
                key={item.price ?? "none"}
                defaultValue={item.price === null ? "" : money(item.price)}
                placeholder="No price"
                onBlur={(e) => setPrice(e.target.value)}
                aria-invalid={priceError}
                className={cx("h-8 w-full rounded-md border bg-card px-2 text-right text-[13.5px] tabular-nums", priceError ? "border-danger" : item.price === null ? "border-warn/50" : "border-line")}
              />
            </Inferred>
          )}
        </div>
        <div className="flex items-center gap-1 pt-1">
          <button className="rounded px-1.5 py-1 text-[12px] text-muted hover:bg-paper-2 hover:text-ink" onClick={() => setOpen(!open)}>
            {open ? "Less" : "Details"}
          </button>
          <button aria-label={`Delete ${item.name}`} className="rounded p-1 text-faint hover:bg-danger-soft hover:text-danger" onClick={() => commit(removeItem(doc, item.id), `Removed ${item.name}`)}>
            <IconTrash size={14} />
          </button>
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-7">
        {item.dietaryTags.map((t) => (
          <Badge key={t} tone={item.inferredFields.includes("dietaryTags") ? "warn" : "neutral"}>
            {DIETARY_LABELS[t]}
          </Badge>
        ))}
        {item.allergens.length ? <span className="text-[11.5px] text-muted">Allergens: {item.allergens.map((a) => ALLERGEN_LABELS[a]).join(", ")}</span> : null}
        {!item.available ? <Badge tone="danger">86'd</Badge> : null}
      </div>
      {open ? (
        <div className="mt-3 grid gap-4 rounded-md bg-paper px-4 py-3 pl-7 sm:grid-cols-2">
          <Inferred item={item} field="dietaryTags" doc={doc}>
            <div className="text-[11.5px] font-medium text-ink-2">Dietary</div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {DIETARY_TAGS.map((t) => (
                <Chip key={t} active={item.dietaryTags.includes(t)} onClick={() => toggleTag(t)}>
                  {DIETARY_LABELS[t]}
                </Chip>
              ))}
            </div>
          </Inferred>
          <Inferred item={item} field="allergens" doc={doc}>
            <div className="text-[11.5px] font-medium text-ink-2">Allergens (EU 14)</div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {ALLERGENS.map((a) => (
                <Chip key={a} active={item.allergens.includes(a)} onClick={() => toggleAllergen(a)}>
                  {ALLERGEN_LABELS[a]}
                </Chip>
              ))}
            </div>
          </Inferred>
          {isDrink(item) || item.attributes.glassware ? (
            <>
              <Inferred item={item} field="attributes.glassware" doc={doc}>
                <label className="flex items-center justify-between gap-3 text-[12.5px]">
                  <span className="text-ink-2">Glassware</span>
                  <select value={item.attributes.glassware ?? ""} onChange={(e) => commit(setItemAttribute(doc, item.id, "glassware", e.target.value || undefined), "Set glassware")} className="h-8 rounded-md border border-line bg-card px-2">
                    <option value="">None</option>
                    {GLASSWARE_TYPES.map((g) => (
                      <option key={g} value={g}>
                        {g.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </label>
              </Inferred>
              <Inferred item={item} field="attributes.colorHex" doc={doc}>
                <label className="flex items-center justify-between gap-3 text-[12.5px]">
                  <span className="text-ink-2">Liquid colour</span>
                  <input type="color" value={item.attributes.colorHex ?? "#cccccc"} onChange={(e) => commit(setItemAttribute(doc, item.id, "colorHex", e.target.value.toUpperCase()), "Set drink colour")} className="h-8 w-14 rounded border border-line" />
                </label>
              </Inferred>
              <Inferred item={item} field="attributes.baseSpirit" doc={doc}>
                <label className="flex items-center justify-between gap-3 text-[12.5px]">
                  <span className="text-ink-2">Base spirit</span>
                  <input defaultValue={item.attributes.baseSpirit ?? ""} onBlur={(e) => commit(setItemAttribute(doc, item.id, "baseSpirit", e.target.value.trim() || undefined), "Set base spirit")} className="h-8 w-32 rounded-md border border-line bg-card px-2" />
                </label>
              </Inferred>
            </>
          ) : null}
          <div className="flex flex-wrap items-center gap-4 text-[12.5px] text-ink-2">
            {(["featured", "isSignature", "isNew", "available"] as const).map((flag) => (
              <label key={flag} className="flex items-center gap-2">
                <Switch checked={item[flag]} onChange={(v) => commit(setItemFields(doc, item.id, { [flag]: v }), "Updated item flags")} label={flag} />
                {{ featured: "Featured", isSignature: "Signature", isNew: "New", available: "Available" }[flag]}
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SectionCard({ section, doc, index }: { section: MenuSection; doc: MenuDocument; index: number }) {
  const commit = useCommit();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const onDragEnd = (event: DragEndEvent) => {
    const overIndex = section.items.findIndex((i) => i.id === event.over?.id);
    if (event.over && event.active.id !== event.over.id && overIndex >= 0) commit(moveItem(doc, String(event.active.id), section.id, overIndex), "Reordered items");
  };
  const toggleDay = (day: (typeof WEEKDAYS)[number]) => {
    const current = section.availability ?? { days: [], startTime: "12:00", endTime: "15:00" };
    const days = current.days.includes(day) ? current.days.filter((d) => d !== day) : [...current.days, day];
    commit(setSectionFields(doc, section.id, { availability: days.length ? { ...current, days } : undefined }), "Updated availability");
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line bg-paper px-4 py-3">
        <div className="min-w-0 flex-1">
          <BlurInput value={section.title} onCommit={(v) => v.trim() && commit(setSectionFields(doc, section.id, { title: v.trim() }), "Renamed a section")} className="display text-[24px] text-ink" />
          <BlurInput value={section.subtitle ?? ""} placeholder="Subtitle (optional)" onCommit={(v) => commit(setSectionFields(doc, section.id, { subtitle: v.trim() || undefined }), "Edited a subtitle")} className="text-[13px] text-muted" />
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" disabled={index === 0} onClick={() => commit(moveSection(doc, section.id, index - 1), "Moved a section")}>
            Up
          </Button>
          <Button size="sm" variant="ghost" disabled={index === doc.sections.length - 1} onClick={() => commit(moveSection(doc, section.id, index + 1), "Moved a section")}>
            Down
          </Button>
          <button aria-label={`Delete ${section.title}`} className="rounded p-1.5 text-faint hover:bg-danger-soft hover:text-danger" onClick={() => commit(removeSection(doc, section.id), `Removed ${section.title}`)}>
            <IconTrash size={15} />
          </button>
        </div>
        <div className="flex w-full flex-wrap items-center gap-1.5 text-[12px] text-muted">
          <span className="mr-1">Served</span>
          {WEEKDAYS.map((d) => (
            <Chip key={d} active={Boolean(section.availability?.days.includes(d))} onClick={() => toggleDay(d)}>
              {d.slice(0, 1).toUpperCase() + d.slice(1)}
            </Chip>
          ))}
          {section.availability ? (
            <span className="ml-2 flex items-center gap-1">
              <input type="time" value={section.availability.startTime} onChange={(e) => section.availability && commit(setSectionFields(doc, section.id, { availability: { ...section.availability, startTime: e.target.value } }), "Updated hours")} className="rounded border border-line bg-card px-1" />
              –
              <input type="time" value={section.availability.endTime} onChange={(e) => section.availability && commit(setSectionFields(doc, section.id, { availability: { ...section.availability, endTime: e.target.value } }), "Updated hours")} className="rounded border border-line bg-card px-1" />
            </span>
          ) : (
            <span className="ml-1 text-faint">all day, every day</span>
          )}
        </div>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={section.items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          {section.items.map((item) => (
            <ItemRow key={item.id} item={item} doc={doc} />
          ))}
        </SortableContext>
      </DndContext>
      <div className="border-t border-line px-4 py-2">
        <Button size="sm" variant="ghost" icon={<IconPlus size={14} />} onClick={() => commit(addItem(doc, section.id), "Added an item")}>
          Add item
        </Button>
      </div>
    </Card>
  );
}

export function Review() {
  const { projectId = "" } = useParams();
  const project = useProject(projectId);
  const { load, document: doc, saveState, error, clearError } = useEditor();
  const navigate = useNavigate();
  const [warnings, setWarnings] = useState<ExtractionWarning[]>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(`menu-studio.warnings.${projectId}`) ?? "[]") as ExtractionWarning[];
    } catch {
      return [];
    }
  });
  // A drafted menu is suggestions, not a reading of something real, and it says so louder.
  const [drafted] = useState(() => {
    try {
      return sessionStorage.getItem(`menu-studio.drafted.${projectId}`) === "1";
    } catch {
      return false;
    }
  });
  const [notes] = useState<string[]>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(`menu-studio.notes.${projectId}`) ?? "[]") as string[];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (project.data?.head) load(projectId, project.data.head);
  }, [project.data, projectId, load]);

  const retry = useMutation({
    mutationFn: async () => {
      const stored = JSON.parse(sessionStorage.getItem(`menu-studio.retry.${projectId}`) ?? "{}") as { uploadIds?: string[]; text?: string | null };
      return api<ExtractResponse>("/extract", { method: "POST", body: stored.text ? { projectId, text: stored.text } : { projectId, uploadIds: stored.uploadIds ?? [] } });
    },
    onSuccess: (result) => {
      sessionStorage.setItem(`menu-studio.warnings.${projectId}`, JSON.stringify(result.warnings));
      setWarnings(result.warnings);
      void project.refetch();
    },
  });
  const elapsed = useElapsed(retry.isPending);

  if (project.isLoading) return <div className="flex justify-center py-24 text-muted"><Spinner /></div>;
  if (project.error) return <ErrorNotice error={project.error} onRetry={() => void project.refetch()} />;
  if (!project.data?.head) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <h1 className="display text-[36px]">We didn't finish reading your menu</h1>
        <p className="mt-2 text-muted">Your upload is saved. Try reading it again.</p>
        <div className="mt-6 flex flex-col items-center gap-4">
          <Button variant="primary" size="lg" loading={retry.isPending} onClick={() => retry.mutate()}>
            Read my menu again
          </Button>
          {retry.isPending ? <ProgressSteps steps={["Reading every section", "Matching prices", "Checking dietary marks"]} elapsed={elapsed} /> : null}
          {retry.error ? <ErrorNotice error={retry.error} onRetry={() => retry.mutate()} /> : null}
        </div>
      </div>
    );
  }
  if (!doc) return null;

  const guesses = unconfirmedCount(doc);
  const items = doc.sections.reduce((n, s) => n + s.items.length, 0);

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow={project.data.venue.name}
        title="Check what we read"
        description={`${items} items in ${doc.sections.length} sections. Fix anything that's off. Highlighted details were guessed and won't be printed until you confirm them.`}
        actions={
          <>
            {guesses ? (
              <Button onClick={() => { const e = confirmAllInferred(doc); if (e) void useEditor.getState().commit([e], "Confirmed all guessed details"); }}>
                Confirm all {guesses} guesses
              </Button>
            ) : null}
            <Button variant="primary" icon={<IconArrowRight size={15} />} onClick={() => navigate(`/projects/${projectId}/brief`)}>
              Continue to brief
            </Button>
          </>
        }
      />
      <div className="mb-6 flex flex-wrap items-center gap-3 text-[12.5px] text-muted">
        <span>{saveState === "saving" ? "Saving…" : saveState === "error" ? "Not saved" : "All changes saved"}</span>
        {guesses ? <Badge tone="warn">{guesses} guessed details to review</Badge> : <Badge tone="ok">Everything confirmed</Badge>}
      </div>
      {error ? (
        <div className="mb-6">
          <ErrorNotice error={new Error(error)} onRetry={clearError} />
        </div>
      ) : null}
      {drafted ? (
        <Notice className="mb-6">
          <div className="mb-1 font-medium">This is a draft, not your menu</div>
          <p>
            Every dish below was suggested from your description and is marked as a guess. Keep the ones you actually cook, bin the rest, and add your
            prices — nothing was priced for you.
          </p>
          {notes.length ? (
            <ul className="mt-2 list-disc space-y-0.5 pl-5">
              {notes.slice(0, 6).map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
          ) : null}
        </Notice>
      ) : null}
      {warnings.length && !drafted ? (
        <Notice tone="warn" className="mb-6">
          <div className="mb-1 font-medium">Worth a look</div>
          <ul className="list-disc space-y-0.5 pl-5">
            {warnings.slice(0, 8).map((w, i) => (
              <li key={i}>{w.message}</li>
            ))}
          </ul>
        </Notice>
      ) : null}
      <div className="flex flex-col gap-5">
        {doc.sections.map((section, i) => (
          <SectionCard key={section.id} section={section} doc={doc} index={i} />
        ))}
      </div>
      <div className="mt-6 flex items-center justify-between">
        <Button icon={<IconPlus size={14} />} onClick={() => void useEditor.getState().commit([addSection(doc)], "Added a section")}>
          Add section
        </Button>
        <Link to={`/projects/${projectId}/brief`}>
          <Button variant="primary" size="lg">
            Continue to brief
          </Button>
        </Link>
      </div>
    </div>
  );
}
