import {
  findItem,
  findSection,
  shortId,
  type Edit,
  type InferrableField,
  type JsonPatchOp,
  type MenuDocument,
  type MenuItem,
  type MenuSection,
} from "@menu-studio/shared";

/** Builders for MenuDocument edits. Every op on an array element is guarded by a test op on its id. */

function itemBase(doc: MenuDocument, itemId: string): { base: string; item: MenuItem } | null {
  const found = findItem(doc, itemId);
  return found ? { base: `/sections/${found.sectionIndex}/items/${found.itemIndex}`, item: found.item } : null;
}

const guard = (base: string, id: string): JsonPatchOp => ({ op: "test", path: `${base}/id`, value: id });

export function setItemFields(doc: MenuDocument, itemId: string, fields: Partial<Omit<MenuItem, "id">>): Edit | null {
  const found = itemBase(doc, itemId);
  if (!found) return null;
  const ops: JsonPatchOp[] = [guard(found.base, itemId)];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) {
      if (key in found.item) ops.push({ op: "remove", path: `${found.base}/${key}` });
    } else ops.push({ op: key in found.item ? "replace" : "add", path: `${found.base}/${key}`, value });
  }
  return ops.length > 1 ? { target: "document", ops } : null;
}

export function setItemAttribute(doc: MenuDocument, itemId: string, key: keyof MenuItem["attributes"], value: unknown): Edit | null {
  const found = itemBase(doc, itemId);
  if (!found) return null;
  const path = `${found.base}/attributes/${key}`;
  const exists = found.item.attributes[key] !== undefined;
  const op: JsonPatchOp = value === undefined || value === null || value === "" ? { op: "remove", path } : { op: exists ? "replace" : "add", path, value };
  if (op.op === "remove" && !exists) return null;
  return { target: "document", ops: [guard(found.base, itemId), op] };
}

/** Accept an inferred value as correct: it stays, but is no longer marked as a guess. */
export function confirmInferred(doc: MenuDocument, itemId: string, fields: InferrableField[]): Edit | null {
  const found = itemBase(doc, itemId);
  if (!found) return null;
  const remaining = found.item.inferredFields.filter((f) => !fields.includes(f));
  if (remaining.length === found.item.inferredFields.length) return null;
  return { target: "document", ops: [guard(found.base, itemId), { op: "replace", path: `${found.base}/inferredFields`, value: remaining }] };
}

/** Reject an inferred value: remove it and the marker. */
export function clearInferred(doc: MenuDocument, itemId: string, field: InferrableField): Edit | null {
  const found = itemBase(doc, itemId);
  if (!found) return null;
  const ops: JsonPatchOp[] = [guard(found.base, itemId), { op: "replace", path: `${found.base}/inferredFields`, value: found.item.inferredFields.filter((f) => f !== field) }];
  if (field === "dietaryTags" || field === "allergens" || field === "ingredients" || field === "priceVariants") ops.push({ op: "replace", path: `${found.base}/${field}`, value: [] });
  else if (field === "price") ops.push({ op: "replace", path: `${found.base}/price`, value: null });
  else if (field === "description" && found.item.description !== undefined) ops.push({ op: "remove", path: `${found.base}/description` });
  else if (field.startsWith("attributes.")) {
    const key = field.slice("attributes.".length) as keyof MenuItem["attributes"];
    if (found.item.attributes[key] !== undefined) ops.push({ op: "remove", path: `${found.base}/attributes/${key}` });
  }
  return { target: "document", ops };
}

export function confirmAllInferred(doc: MenuDocument): Edit | null {
  const ops: JsonPatchOp[] = [];
  doc.sections.forEach((section, si) =>
    section.items.forEach((item, ii) => {
      if (!item.inferredFields.length) return;
      const base = `/sections/${si}/items/${ii}`;
      ops.push(guard(base, item.id), { op: "replace", path: `${base}/inferredFields`, value: [] });
    }),
  );
  return ops.length ? { target: "document", ops } : null;
}

export function newItem(name = "New item"): MenuItem {
  return {
    id: shortId("itm"),
    name,
    price: null,
    priceVariants: [],
    ingredients: [],
    dietaryTags: [],
    allergens: [],
    attributes: {},
    featured: false,
    isNew: false,
    isSignature: false,
    inferredFields: [],
    available: true,
  };
}

export function addItem(doc: MenuDocument, sectionId: string, item: MenuItem = newItem()): Edit | null {
  const found = findSection(doc, sectionId);
  if (!found) return null;
  return {
    target: "document",
    ops: [
      { op: "test", path: `/sections/${found.index}/id`, value: sectionId },
      { op: "add", path: `/sections/${found.index}/items/-`, value: item },
    ],
  };
}

export function removeItem(doc: MenuDocument, itemId: string): Edit | null {
  const found = itemBase(doc, itemId);
  return found ? { target: "document", ops: [guard(found.base, itemId), { op: "remove", path: found.base }] } : null;
}

export function moveItem(doc: MenuDocument, itemId: string, toSectionId: string, toIndex: number): Edit | null {
  const from = findItem(doc, itemId);
  const to = findSection(doc, toSectionId);
  if (!from || !to) return null;
  const index = Math.max(0, Math.min(toIndex, to.section.items.length - (from.sectionIndex === to.index ? 1 : 0)));
  if (from.sectionIndex === to.index && index === from.itemIndex) return null;
  return {
    target: "document",
    ops: [
      guard(`/sections/${from.sectionIndex}/items/${from.itemIndex}`, itemId),
      { op: "test", path: `/sections/${to.index}/id`, value: toSectionId },
      { op: "move", from: `/sections/${from.sectionIndex}/items/${from.itemIndex}`, path: `/sections/${to.index}/items/${index}` },
    ],
  };
}

export function setSectionFields(doc: MenuDocument, sectionId: string, fields: Partial<Omit<MenuSection, "id" | "items">>): Edit | null {
  const found = findSection(doc, sectionId);
  if (!found) return null;
  const base = `/sections/${found.index}`;
  const ops: JsonPatchOp[] = [{ op: "test", path: `${base}/id`, value: sectionId }];
  for (const [key, value] of Object.entries(fields)) {
    const exists = key in found.section;
    if (value === undefined || value === "") {
      if (exists) ops.push({ op: "remove", path: `${base}/${key}` });
    } else ops.push({ op: exists ? "replace" : "add", path: `${base}/${key}`, value });
  }
  return ops.length > 1 ? { target: "document", ops } : null;
}

export function addSection(doc: MenuDocument, title = "New section"): Edit {
  return { target: "document", ops: [{ op: "add", path: "/sections/-", value: { id: shortId("sec"), title, items: [] } satisfies MenuSection }] };
}

export function removeSection(doc: MenuDocument, sectionId: string): Edit | null {
  const found = findSection(doc, sectionId);
  return found
    ? { target: "document", ops: [{ op: "test", path: `/sections/${found.index}/id`, value: sectionId }, { op: "remove", path: `/sections/${found.index}` }] }
    : null;
}

export function moveSection(doc: MenuDocument, sectionId: string, toIndex: number): Edit | null {
  const found = findSection(doc, sectionId);
  if (!found || found.index === toIndex) return null;
  return {
    target: "document",
    ops: [
      { op: "test", path: `/sections/${found.index}/id`, value: sectionId },
      { op: "move", from: `/sections/${found.index}`, path: `/sections/${Math.max(0, Math.min(toIndex, doc.sections.length - 1))}` },
    ],
  };
}
