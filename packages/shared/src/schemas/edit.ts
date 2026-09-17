import { z } from "zod";

/** RFC 6901 JSON Pointer. */
export const JsonPointer = z.string().regex(/^(\/([^/~]|~[01])*)*$/, "Expected a JSON Pointer");

const withValue = <T extends string>(op: T) =>
  z.strictObject({ op: z.literal(op), path: JsonPointer, value: z.unknown() });
const withFrom = <T extends string>(op: T) =>
  z.strictObject({ op: z.literal(op), from: JsonPointer, path: JsonPointer });

export const JsonPatchOp = z.discriminatedUnion("op", [
  withValue("add"),
  z.strictObject({ op: z.literal("remove"), path: JsonPointer }),
  withValue("replace"),
  withFrom("move"),
  withFrom("copy"),
  withValue("test"),
]);
export type JsonPatchOp = z.infer<typeof JsonPatchOp>;

export const EDIT_TARGETS = ["document", "spec"] as const;
export const EditTarget = z.enum(EDIT_TARGETS);
export type EditTarget = z.infer<typeof EditTarget>;

/** One edit targets exactly one document. Content and design never change in the same edit. */
export const Edit = z.strictObject({
  target: EditTarget,
  ops: z.array(JsonPatchOp).min(1).max(300),
});
export type Edit = z.infer<typeof Edit>;

export const VERSION_SOURCES = ["manual", "ai_concept", "ai_edit", "import", "restore"] as const;
export const VersionSource = z.enum(VERSION_SOURCES);
export type VersionSource = z.infer<typeof VersionSource>;
