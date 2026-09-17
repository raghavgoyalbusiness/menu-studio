import { confirmedAllergens, confirmedDietaryTags, formatMoney, isDrink, type MenuDocument } from "@menu-studio/shared";

/** Compact, id-bearing text view of a menu for prompts. Cheaper than raw JSON and easier to reference. */
export function menuSummary(document: MenuDocument, options: { descriptions: boolean } = { descriptions: true }): string {
  const lines: string[] = [];
  lines.push(`Venue: ${document.venueName} (${document.venueType}); currency ${document.currency}; language ${document.primaryLanguage}`);
  if (document.taxNote) lines.push(`taxNote: ${document.taxNote}`);
  document.footerNotes.forEach((note, i) => lines.push(`footer:${i}: ${note}`));
  const anyAllergens = document.sections.some((s) => s.items.some((i) => confirmedAllergens(i).length > 0));
  const anyMarks = document.sections.some((s) => s.items.some((i) => confirmedDietaryTags(i).length > 0));
  lines.push(`Allergens listed: ${anyAllergens ? "yes" : "no"}. Dietary marks shown: ${anyMarks ? "yes" : "no"}.`);
  lines.push("");
  for (const section of document.sections) {
    const drinks = section.items.filter(isDrink).length;
    lines.push(`[${section.id}] ${section.title} (${section.items.length} items${drinks ? `, ${drinks} drinks` : ""})${section.subtitle ? `: ${section.subtitle}` : ""}`);
    for (const item of section.items) {
      const price =
        item.priceVariants.length > 0
          ? item.priceVariants.map((v) => `${v.label} ${formatMoney(v.price, { locale: document.locale, currency: document.currency, symbol: true, trimDecimals: true })}`).join(" / ")
          : item.price === null
            ? "no price"
            : formatMoney(item.price, { locale: document.locale, currency: document.currency, symbol: true, trimDecimals: true });
      const flags = [
        ...confirmedDietaryTags(item),
        item.featured ? "featured" : "",
        item.isSignature ? "signature" : "",
        item.isNew ? "new" : "",
        item.engineering?.quadrant ? `quadrant:${item.engineering.quadrant}` : "",
      ].filter(Boolean);
      let line = `  - ${item.id} "${item.name}" ${price}${flags.length ? ` | ${flags.join(", ")}` : ""}`;
      if (options.descriptions && item.description) line += ` | ${item.description.slice(0, 110)}`;
      const a = item.attributes;
      const drink = [
        a.baseSpirit ? `spirit=${a.baseSpirit}` : "",
        a.glassware ? `glass=${a.glassware}` : "",
        a.abvTier ? `abv=${a.abvTier}` : "",
        a.flavor ? `flavor=${a.flavor.sweetBitter},${a.flavor.refreshingBoozy}` : "",
        item.ingredients.length ? `ingredients=${item.ingredients.join(", ")}` : "",
      ].filter(Boolean);
      if (drink.length) line += ` | ${drink.join("; ")}`;
      lines.push(line);
    }
  }
  return lines.join("\n");
}
