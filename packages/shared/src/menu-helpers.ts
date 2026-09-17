import type { Allergen, DietaryTag, MenuDocument, MenuItem, MenuSection, SectionAvailability, Weekday } from "./schemas/menu-document.ts";

export function allItems(document: MenuDocument): MenuItem[] {
  return document.sections.flatMap((s) => s.items);
}

export function findItem(document: MenuDocument, itemId: string): { section: MenuSection; item: MenuItem; sectionIndex: number; itemIndex: number } | null {
  for (const [sectionIndex, section] of document.sections.entries()) {
    const itemIndex = section.items.findIndex((i) => i.id === itemId);
    if (itemIndex !== -1) {
      const item = section.items[itemIndex];
      if (item) return { section, item, sectionIndex, itemIndex };
    }
  }
  return null;
}

export function findSection(document: MenuDocument, sectionId: string): { section: MenuSection; index: number } | null {
  const index = document.sections.findIndex((s) => s.id === sectionId);
  const section = document.sections[index];
  return section ? { section, index } : null;
}

export function isDrink(item: MenuItem): boolean {
  const a = item.attributes;
  return Boolean(a.glassware || a.baseSpirit || a.abvTier || a.flavor || a.caffeine);
}

export function drinkItems(document: MenuDocument): MenuItem[] {
  return allItems(document).filter(isDrink);
}

/**
 * Dietary tags and allergens that are safe to print. Inferred values stay out of
 * outputs until the owner confirms them (PLAN decision D9).
 */
export function confirmedDietaryTags(item: MenuItem): DietaryTag[] {
  return item.inferredFields.includes("dietaryTags") ? [] : item.dietaryTags;
}

export function confirmedAllergens(item: MenuItem): Allergen[] {
  return item.inferredFields.includes("allergens") ? [] : item.allergens;
}

export function unconfirmedCount(document: MenuDocument): number {
  return allItems(document).reduce((n, item) => n + item.inferredFields.length, 0);
}

const WEEKDAY_FROM_INTL: Record<string, Weekday> = {
  Mon: "mon",
  Tue: "tue",
  Wed: "wed",
  Thu: "thu",
  Fri: "fri",
  Sat: "sat",
  Sun: "sun",
};

/** Whether a section's availability window includes `now` in the venue's timezone. */
export function isAvailableAt(availability: SectionAvailability | undefined, now: Date, timeZone: string): boolean {
  if (!availability) return true;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const weekday = WEEKDAY_FROM_INTL[parts.find((p) => p.type === "weekday")?.value ?? ""];
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  if (!weekday) return true;
  const minutes = Number(hour) * 60 + Number(minute);
  const [sh = 0, sm = 0] = availability.startTime.split(":").map(Number);
  const [eh = 0, em = 0] = availability.endTime.split(":").map(Number);
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  if (start <= end) {
    return availability.days.includes(weekday) && minutes >= start && minutes < end;
  }
  // Window crosses midnight: evening part belongs to the listed day, early part to the next day.
  const order: Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const previous = order[(order.indexOf(weekday) + 6) % 7] ?? weekday;
  return (availability.days.includes(weekday) && minutes >= start) || (availability.days.includes(previous) && minutes < end);
}

export function itemDisplayName(item: MenuItem, lang: string | undefined): string {
  if (!lang) return item.name;
  return item.translations?.[lang]?.name ?? item.name;
}

export function itemDisplayDescription(item: MenuItem, lang: string | undefined): string | undefined {
  if (!lang) return item.description;
  return item.translations?.[lang]?.description ?? item.description;
}

export function sectionDisplayTitle(section: MenuSection, lang: string | undefined): string {
  if (!lang) return section.title;
  return section.translations?.[lang]?.title ?? section.title;
}

export function sectionDisplaySubtitle(section: MenuSection, lang: string | undefined): string | undefined {
  if (!lang) return section.subtitle;
  return section.translations?.[lang]?.subtitle ?? section.subtitle;
}
