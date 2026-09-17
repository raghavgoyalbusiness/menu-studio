import { AppError, badRequest, getHead, insertVersion, type Db } from "@menu-studio/server-core";
import { applyEdits, type Docs, type Edit, type VersionDto, type VersionSource } from "@menu-studio/shared";
import type { RequestUser } from "../deps.ts";
import { requireProject } from "./access.ts";

export interface CommitInput {
  projectId: string;
  baseVersionId: string;
  edits: Edit[];
  source: VersionSource;
  instruction?: string | null;
  summary?: string | null;
  strictRefs?: boolean;
  /** Extra checks on the result (for example the engineering emphasis-only guard). */
  verify?: (before: Docs, after: Docs) => string[];
}

/**
 * The server half of the mutation pipeline: re-apply the edits to the server's own head,
 * validate both documents, and insert an immutable version that becomes the new head.
 */
export async function commitEdits(db: Db, user: RequestUser, input: CommitInput): Promise<VersionDto> {
  if (!input.edits.length) throw badRequest("Nothing to save.");
  return db.asUser(user, async (q) => {
    await requireProject(q, input.projectId, "editor");
    const head = await getHead(q, input.projectId);
    if (!head) throw badRequest("This project has no menu yet.");
    if (head.id !== input.baseVersionId) {
      throw new AppError(409, "stale_version", "This menu changed in another window. Reload to see the latest version.", { retryable: true });
    }
    const before: Docs = { document: head.document, spec: head.spec };
    const result = applyEdits(before, input.edits, { strictRefs: input.strictRefs ?? false });
    if (!result.ok) {
      throw new AppError(422, "invalid_edit", result.error.message, { issues: result.error.issues });
    }
    const violations = input.verify?.(before, result.docs) ?? [];
    if (violations.length) throw new AppError(422, "invalid_edit", "That change is not allowed here.", { issues: violations });
    return insertVersion(q, {
      projectId: input.projectId,
      baseVersionId: head.id,
      document: result.docs.document,
      brief: head.brief,
      spec: result.docs.spec,
      source: input.source,
      instruction: input.instruction ?? null,
      edits: input.edits,
      summary: input.summary ?? null,
      createdBy: user.sub,
    });
  });
}
