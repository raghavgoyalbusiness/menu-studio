import { z } from "zod";

export const HexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Expected a #RRGGBB colour");
/** Money is always integer minor units (paise, pence, cents). */
export const MinorUnits = z.int().min(0).max(100_000_000_00);
export const LangCode = z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/, "Expected a BCP 47 language tag");
export const CurrencyCode = z.string().regex(/^[A-Z]{3}$/, "Expected an ISO 4217 code");
export const TimeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:MM");

export const SectionId = z.string().regex(/^sec_[a-z0-9]{8}$/, "Expected a section id");
export const ItemId = z.string().regex(/^itm_[a-z0-9]{8}$/, "Expected an item id");
export const BlockId = z.string().regex(/^blk_[a-z0-9]{8}$/, "Expected a block id");
export const PageId = z.string().regex(/^pg_[a-z0-9]{8}$/, "Expected a page id");

export const ORIENTATIONS = ["portrait", "landscape"] as const;
export const Orientation = z.enum(ORIENTATIONS);
export type Orientation = z.infer<typeof Orientation>;
