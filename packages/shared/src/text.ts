/** Cut prose to at most `max` sentences. Prompting alone does not hold length limits. */
export function limitSentences(text: string, max: number): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  const sentences = trimmed.match(/[^.!?]+(?:[.!?]+["')\]]*|$)/g) ?? [trimmed];
  return sentences
    .slice(0, max)
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");
}

export function limitChars(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

export function applyTextCase(text: string, mode: "as_written" | "lowercase" | "uppercase"): string {
  if (mode === "lowercase") return text.toLocaleLowerCase();
  if (mode === "uppercase") return text.toLocaleUpperCase();
  return text;
}
