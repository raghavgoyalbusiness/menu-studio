/**
 * Active prompt versions. A behaviour change is a new versioned file, activated here;
 * shipped versions are never edited. The version is recorded with every ai_usage row.
 */
import { CONCEPTS_PROMPT_V1 } from "./concepts/v1.ts";
import { EDIT_PROMPT_V1 } from "./edit/v1.ts";
import { EXTRACT_PROMPT_V1 } from "./extract/v1.ts";
import { DESCRIBE_REFERENCE_PROMPT_V1, ENGINEERING_PROMPT_V1, TRANSLATE_PROMPT_V1 } from "./others.ts";

export const PROMPTS = {
  extract: EXTRACT_PROMPT_V1,
  concepts: CONCEPTS_PROMPT_V1,
  edit: EDIT_PROMPT_V1,
  translate: TRANSLATE_PROMPT_V1,
  engineering: ENGINEERING_PROMPT_V1,
  describeReference: DESCRIBE_REFERENCE_PROMPT_V1,
} as const;
