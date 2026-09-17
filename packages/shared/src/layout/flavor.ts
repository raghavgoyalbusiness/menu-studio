import type { Flavor, MenuItem } from "../schemas/menu-document.ts";

const SIGNALS: { re: RegExp; sweetBitter: number; refreshingBoozy: number }[] = [
  { re: /\b(lime|lemon|yuzu|grapefruit|citrus|sudachi|kalamansi)\b/i, sweetBitter: 0, refreshingBoozy: -0.35 },
  { re: /\b(soda|tonic|sparkling|fizz|highball|prosecco|champagne|ginger beer|ginger ale)\b/i, sweetBitter: 0, refreshingBoozy: -0.45 },
  { re: /\b(mint|cucumber|shiso|basil|tea|sencha)\b/i, sweetBitter: 0, refreshingBoozy: -0.15 },
  { re: /\b(campari|aperol|amaro|fernet|cynar|bitters?|gentian|suze)\b/i, sweetBitter: 0.45, refreshingBoozy: 0.1 },
  { re: /\b(coffee|espresso|cacao|cocoa|dark chocolate|hojicha|matcha)\b/i, sweetBitter: 0.25, refreshingBoozy: 0 },
  { re: /\b(vermouth|stirred|martini|negroni|manhattan|old fashioned|sazerac|neat)\b/i, sweetBitter: 0.1, refreshingBoozy: 0.45 },
  { re: /\b(whisky|whiskey|bourbon|rye|mezcal|cognac|brandy|armagnac|overproof)\b/i, sweetBitter: 0.05, refreshingBoozy: 0.3 },
  { re: /\b(syrup|honey|agave|liqueur|cordial|grenadine|orgeat|falernum|condensed milk)\b/i, sweetBitter: -0.35, refreshingBoozy: 0 },
  { re: /\b(pineapple|mango|passion ?fruit|peach|strawberry|raspberry|cherry|plum|umeshu|lychee|coconut|banana)\b/i, sweetBitter: -0.3, refreshingBoozy: -0.1 },
  { re: /\b(cream|egg white|vanilla|caramel)\b/i, sweetBitter: -0.2, refreshingBoozy: 0.05 },
];

const clamp = (n: number) => Math.max(-1, Math.min(1, Math.round(n * 100) / 100));

/**
 * Deterministic flavor estimate from name, description and ingredients. Used as a
 * fallback when the AI did not place an item and for default layouts; owner data wins.
 */
export function estimateFlavor(item: MenuItem): Flavor {
  if (item.attributes.flavor) return item.attributes.flavor;
  const text = [item.name, item.description ?? "", ...item.ingredients].join(" ");
  let sweetBitter = 0;
  let refreshingBoozy = 0;
  for (const signal of SIGNALS) {
    if (signal.re.test(text)) {
      sweetBitter += signal.sweetBitter;
      refreshingBoozy += signal.refreshingBoozy;
    }
  }
  if (item.attributes.abvTier === "zero") refreshingBoozy = Math.min(refreshingBoozy, -0.6);
  if (item.attributes.abvTier === "high") refreshingBoozy = Math.max(refreshingBoozy, 0.5);
  if (item.attributes.abvTier === "low") refreshingBoozy = Math.min(refreshingBoozy, -0.2);
  return { sweetBitter: clamp(sweetBitter), refreshingBoozy: clamp(refreshingBoozy) };
}
