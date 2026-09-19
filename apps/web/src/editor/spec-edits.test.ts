import { applyEdits, type Edit, type LayoutSpec, type MenuDocument } from "@menu-studio/shared";
import { SEEDS } from "@menu-studio/shared/seeds";
import { describe, expect, it } from "vitest";
import { clearToken, moveBlockBy, setBlockEmphasis, setToken } from "./spec-edits.ts";

const seed = SEEDS["bistro-paris"];
const doc = (): MenuDocument => structuredClone(seed.document);
const base = (): LayoutSpec => structuredClone(seed.spec);

function apply(spec: LayoutSpec, edit: Edit | null): LayoutSpec {
  expect(edit, "builder returned null").not.toBeNull();
  const result = applyEdits({ document: doc(), spec }, [edit]);
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message} ${result.error.issues.join("; ")}`);
  return result.docs.spec as LayoutSpec;
}

const BRAND = { background: "#FFFDF7", surface: "#F3EDE1", text: "#1A1A1A", muted: "#555148", accent: "#7A1F2B", accent2: "#1F3A5F" };

describe("design tokens", () => {
  it("changes a token and leaves the rest alone", () => {
    const spec = base();
    const after = apply(spec, setToken(spec, "density", "airy"));
    expect(after.tokens.density).toBe("airy");
    expect(after.tokens.fontPairingId).toBe(spec.tokens.fontPairingId);
    expect(after.archetype).toBe(spec.archetype);
  });

  it("does not write a version when the token is already that value", () => {
    const spec = base();
    expect(setToken(spec, "density", spec.tokens.density)).toBeNull();
  });

  it("never touches the document", () => {
    const spec = base();
    const edit = setToken(spec, "paletteId", "sumi-night");
    expect(edit?.target).toBe("spec");
    // A design change reaching the content would break the separation the whole app rests on.
    expect(JSON.stringify(edit?.ops)).not.toContain("/sections");
  });
});

describe("brand colours", () => {
  it("adds a custom palette the renderer will prefer over the catalog one", () => {
    const spec = base();
    const after = apply(spec, setToken(spec, "customPalette", BRAND));
    expect(after.tokens.customPalette).toEqual(BRAND);
    // The catalog id stays, so "reset" has something to go back to.
    expect(after.tokens.paletteId).toBe(spec.tokens.paletteId);
  });

  it("removes it again with a remove op, not a replace with nothing", () => {
    const withBrand = apply(base(), setToken(base(), "customPalette", BRAND));
    const edit = clearToken(withBrand, "customPalette");
    expect(edit?.ops[0]).toMatchObject({ op: "remove", path: "/tokens/customPalette" });
    const after = apply(withBrand, edit);
    expect(after.tokens.customPalette).toBeUndefined();
  });

  it("does nothing when there is no custom palette to clear", () => {
    expect(clearToken(base(), "customPalette")).toBeNull();
  });

  it("rejects a colour that is not a hex value, without blowing up", () => {
    const spec = base();
    const edit: Edit = { target: "spec", ops: [{ op: "add", path: "/tokens/customPalette", value: { ...BRAND, text: "rebeccapurple" } }] };
    // The contrast maths throws on a malformed hex, so the refinement has to skip it and let the
    // regex report. A thrown error here would be a 500 on the server instead of a 422.
    const result = applyEdits({ document: doc(), spec }, [edit]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("schema");
  });

  it("rejects a palette nobody could read", () => {
    const spec = base();
    const unreadable = { ...BRAND, background: "#FFFDF7", text: "#F0EDE6" };
    const result = applyEdits({ document: doc(), spec }, [setToken(spec, "customPalette", unreadable)]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.issues.join(" ")).toContain("WCAG AA");
  });
});

describe("blocks", () => {
  it("changes a block's emphasis", () => {
    const spec = base();
    const blockId = spec.pages[0]?.blocks[1]?.id;
    expect(blockId).toBeTruthy();
    const after = apply(spec, setBlockEmphasis(spec, blockId!, "high"));
    expect(after.pages[0]?.blocks[1]?.emphasis).toBe("high");
  });

  it("moves a block down and refuses to move the last one further", () => {
    const spec = base();
    // Order is gridArea.row, not array position, so a move rewrites rows rather than reordering.
    const order = (s: LayoutSpec) => [...(s.pages[0]?.blocks ?? [])].sort((a, b) => a.gridArea.row - b.gridArea.row).map((b) => b.id);
    const before = order(spec);
    const after = apply(spec, moveBlockBy(spec, before[0]!, 1));
    expect(order(after)[1]).toBe(before[0]);
    expect(order(after)[0]).toBe(before[1]);
    expect(moveBlockBy(spec, before.at(-1)!, 1)).toBeNull();
  });
});
