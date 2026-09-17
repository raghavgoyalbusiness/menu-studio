import { applyEdits, findItem, type Edit, type MenuDocument } from "@menu-studio/shared";
import { SEEDS } from "@menu-studio/shared/seeds";
import { describe, expect, it } from "vitest";
import {
  addItem,
  addSection,
  clearInferred,
  confirmAllInferred,
  confirmInferred,
  moveItem,
  moveSection,
  newItem,
  removeItem,
  removeSection,
  setItemAttribute,
  setItemFields,
  setSectionFields,
} from "./doc-edits.ts";

const seed = SEEDS["bistro-paris"];

function doc(): MenuDocument {
  return structuredClone(seed.document);
}

/** Every builder's output has to survive the same pipeline the server runs. */
function apply(document: MenuDocument, edit: Edit | null): MenuDocument {
  expect(edit, "builder returned null").not.toBeNull();
  const result = applyEdits({ document, spec: null }, [edit]);
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message} ${result.error.issues.join("; ")}`);
  return result.docs.document as MenuDocument;
}

function firstItem(document: MenuDocument) {
  const item = document.sections[0]?.items[0];
  if (!item) throw new Error("seed has no items");
  return item;
}

describe("item edits", () => {
  it("guards every op with a test on the item id", () => {
    const document = doc();
    const edit = setItemFields(document, firstItem(document).id, { name: "Renamed" });
    expect(edit?.target).toBe("document");
    expect(edit?.ops[0]).toMatchObject({ op: "test", value: firstItem(document).id });
  });

  it("renames an item without touching anything else", () => {
    const document = doc();
    const item = firstItem(document);
    const after = apply(document, setItemFields(document, item.id, { name: "Renamed" }));
    const found = findItem(after, item.id);
    expect(found?.item.name).toBe("Renamed");
    expect(found?.item.price).toBe(item.price);
    // Zod rebuilds the object on validation, so compare by value rather than by serialisation.
    expect(after.sections.slice(1)).toEqual(document.sections.slice(1));
  });

  it("removes an optional field rather than writing undefined", () => {
    const document = doc();
    const described = document.sections.flatMap((s) => s.items).find((i) => i.description !== undefined);
    if (!described) throw new Error("seed has no described item");
    const after = apply(document, setItemFields(document, described.id, { description: undefined }));
    expect(findItem(after, described.id)?.item.description).toBeUndefined();
  });

  it("returns null when there is nothing to change", () => {
    const document = doc();
    expect(setItemFields(document, "itm_missing", { name: "x" })).toBeNull();
    expect(setItemFields(document, firstItem(document).id, {})).toBeNull();
  });

  it("adds, replaces and removes an attribute", () => {
    const document = doc();
    const item = firstItem(document);
    const added = apply(document, setItemAttribute(document, item.id, "baseSpirit", "Gin"));
    expect(findItem(added, item.id)?.item.attributes.baseSpirit).toBe("Gin");

    const replaced = apply(added, setItemAttribute(added, item.id, "baseSpirit", "Whisky"));
    expect(findItem(replaced, item.id)?.item.attributes.baseSpirit).toBe("Whisky");

    const cleared = apply(replaced, setItemAttribute(replaced, item.id, "baseSpirit", ""));
    expect(findItem(cleared, item.id)?.item.attributes.baseSpirit).toBeUndefined();
    // Clearing something that is already absent is not an edit.
    expect(setItemAttribute(cleared, item.id, "baseSpirit", "")).toBeNull();
  });
});

describe("inferred fields", () => {
  function withInference(): { document: MenuDocument; itemId: string } {
    const document = doc();
    const item = firstItem(document);
    item.inferredFields = ["dietaryTags", "description"];
    item.dietaryTags = ["veg"];
    item.description = "A guess";
    return { document, itemId: item.id };
  }

  it("confirming keeps the value and drops only the marker", () => {
    const { document, itemId } = withInference();
    const after = apply(document, confirmInferred(document, itemId, ["dietaryTags"]));
    const item = findItem(after, itemId)?.item;
    expect(item?.dietaryTags).toEqual(["veg"]);
    expect(item?.inferredFields).toEqual(["description"]);
  });

  it("rejecting removes the value as well as the marker", () => {
    const { document, itemId } = withInference();
    const after = apply(document, clearInferred(document, itemId, "dietaryTags"));
    const item = findItem(after, itemId)?.item;
    expect(item?.dietaryTags).toEqual([]);
    expect(item?.inferredFields).toEqual(["description"]);

    const cleared = apply(after, clearInferred(after, itemId, "description"));
    expect(findItem(cleared, itemId)?.item.description).toBeUndefined();
    expect(findItem(cleared, itemId)?.item.inferredFields).toEqual([]);
  });

  it("rejecting an inferred price leaves it unpriced rather than zero", () => {
    const document = doc();
    const item = firstItem(document);
    item.inferredFields = ["price"];
    const after = apply(document, clearInferred(document, item.id, "price"));
    expect(findItem(after, item.id)?.item.price).toBeNull();
  });

  it("confirming everything clears every marker in one edit", () => {
    const { document } = withInference();
    const edit = confirmAllInferred(document);
    const after = apply(document, edit);
    expect(after.sections.flatMap((s) => s.items).every((i) => i.inferredFields.length === 0)).toBe(true);
    // Nothing left to confirm the second time.
    expect(confirmAllInferred(after)).toBeNull();
  });

  it("does nothing when the field is not marked as inferred", () => {
    const document = doc();
    expect(confirmInferred(document, firstItem(document).id, ["price"])).toBeNull();
  });
});

describe("structure edits", () => {
  it("adds an item to the right section", () => {
    const document = doc();
    const section = document.sections[1]!;
    const item = newItem("Nouveau");
    const after = apply(document, addItem(document, section.id, item));
    expect(after.sections[1]?.items.at(-1)?.name).toBe("Nouveau");
    expect(after.sections[1]?.items.length).toBe(section.items.length + 1);
  });

  it("mints a fresh id for each new item and leaves it unpriced", () => {
    const a = newItem();
    const b = newItem();
    expect(a.id).not.toBe(b.id);
    expect(a.id).toMatch(/^itm_[a-z0-9]{8}$/);
    expect(a.price).toBeNull();
    expect(a.inferredFields).toEqual([]);
  });

  it("removes an item", () => {
    const document = doc();
    const item = firstItem(document);
    const after = apply(document, removeItem(document, item.id));
    expect(findItem(after, item.id)).toBeNull();
  });

  it("moves an item between sections", () => {
    const document = doc();
    const item = firstItem(document);
    const target = document.sections[2]!;
    const after = apply(document, moveItem(document, item.id, target.id, 0));
    expect(after.sections[2]?.items[0]?.id).toBe(item.id);
    expect(after.sections[0]?.items.some((i) => i.id === item.id)).toBe(false);
  });

  it("does not write a version for a move that changes nothing", () => {
    const document = doc();
    const section = document.sections[0]!;
    expect(moveItem(document, section.items[0]!.id, section.id, 0)).toBeNull();
    expect(moveSection(document, section.id, 0)).toBeNull();
  });

  it("clamps an out-of-range move instead of failing", () => {
    const document = doc();
    const item = firstItem(document);
    const target = document.sections[1]!;
    const after = apply(document, moveItem(document, item.id, target.id, 99));
    expect(after.sections[1]?.items.at(-1)?.id).toBe(item.id);
  });

  it("renames a section and drops an emptied subtitle", () => {
    const document = doc();
    const section = document.sections[0]!;
    const renamed = apply(document, setSectionFields(document, section.id, { title: "Pour commencer" }));
    expect(renamed.sections[0]?.title).toBe("Pour commencer");

    if (section.subtitle !== undefined) {
      const cleared = apply(renamed, setSectionFields(renamed, section.id, { subtitle: "" }));
      expect(cleared.sections[0]?.subtitle).toBeUndefined();
    }
  });

  it("adds and removes a section", () => {
    const document = doc();
    const added = apply(document, addSection(document, "Digestifs"));
    const section = added.sections.at(-1)!;
    expect(section.title).toBe("Digestifs");
    expect(section.items).toEqual([]);

    const removed = apply(added, removeSection(added, section.id));
    expect(removed.sections.some((s) => s.id === section.id)).toBe(false);
  });

  it("reorders sections", () => {
    const document = doc();
    const last = document.sections.at(-1)!;
    const after = apply(document, moveSection(document, last.id, 0));
    expect(after.sections[0]?.id).toBe(last.id);
  });
});

describe("guards", () => {
  it("refuses an edit written against a stale document", () => {
    const document = doc();
    const item = firstItem(document);
    const edit = setItemFields(document, item.id, { name: "Renamed" });

    // Someone else removed that item in the meantime, so index 0 now holds a different one.
    const moved = apply(document, removeItem(document, item.id));
    const result = applyEdits({ document: moved, spec: null }, [edit]);
    expect(result.ok).toBe(false);
  });
});
