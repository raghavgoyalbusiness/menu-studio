/**
 * Money helpers. Amounts are integer minor units; conversion to display strings goes
 * through decimal strings, never floating-point division.
 */

const EXPONENT_OVERRIDES: Record<string, number> = {
  BHD: 3,
  IQD: 3,
  JOD: 3,
  KWD: 3,
  LYD: 3,
  OMR: 3,
  TND: 3,
  BIF: 0,
  CLP: 0,
  DJF: 0,
  GNF: 0,
  ISK: 0,
  JPY: 0,
  KMF: 0,
  KRW: 0,
  PYG: 0,
  RWF: 0,
  UGX: 0,
  VND: 0,
  VUV: 0,
  XAF: 0,
  XOF: 0,
  XPF: 0,
};

export function currencyExponent(currency: string): number {
  return EXPONENT_OVERRIDES[currency] ?? 2;
}

/** Integer minor units → canonical decimal string ("1250" GBP → "12.50"). */
export function minorToDecimalString(minor: number, currency: string): string {
  if (!Number.isSafeInteger(minor)) throw new Error(`Minor units must be a safe integer, got ${minor}`);
  const exp = currencyExponent(currency);
  const negative = minor < 0;
  const digits = String(Math.abs(minor));
  if (exp === 0) return `${negative ? "-" : ""}${digits}`;
  const padded = digits.padStart(exp + 1, "0");
  const whole = padded.slice(0, -exp);
  const frac = padded.slice(-exp);
  return `${negative ? "-" : ""}${whole}.${frac}`;
}

/**
 * Parse a human price string into minor units. Handles symbols, codes, grouping
 * ("1,250", "1,00,000", "1.250,00") and decimal commas ("12,50"). Returns null when
 * the string is not a single unambiguous amount.
 */
export function parseMoney(input: string, currency: string): number | null {
  const exp = currencyExponent(currency);
  const cleaned = input
    .normalize("NFKC")
    .replace(/[\s\u00a0\u202f\u2009']/g, "")
    .replace(/^[^\d.,-]+|[^\d.,]+$/g, "");
  if (!/^\d[\d.,]*$/.test(cleaned)) return null;

  const lastDot = cleaned.lastIndexOf(".");
  const lastComma = cleaned.lastIndexOf(",");
  let wholePart = cleaned;
  let fracPart = "";

  if (lastDot !== -1 && lastComma !== -1) {
    const decimalIndex = Math.max(lastDot, lastComma);
    const groupChar = lastDot > lastComma ? "," : ".";
    wholePart = cleaned.slice(0, decimalIndex).split(groupChar).join("");
    fracPart = cleaned.slice(decimalIndex + 1);
  } else {
    const sep = lastDot !== -1 ? "." : lastComma !== -1 ? "," : null;
    if (sep) {
      const parts = cleaned.split(sep);
      const tail = parts[parts.length - 1] ?? "";
      // "1.250" is ambiguous (European grouping or a typo); "1,250" is conventional grouping.
      if (sep === "." && parts.length === 2 && tail.length === 3 && exp < 3) return null;
      const looksLikeGrouping = parts.length > 2 || (tail.length === 3 && exp < 3);
      if (looksLikeGrouping) {
        if (parts.slice(1).some((p) => p.length !== 3 && p.length !== 2)) return null;
        wholePart = parts.join("");
      } else {
        wholePart = parts.slice(0, -1).join("");
        fracPart = tail;
      }
    }
  }

  if (!/^\d+$/.test(wholePart) || !/^\d*$/.test(fracPart)) return null;
  if (fracPart.length > exp) {
    if (/^0*$/.test(fracPart.slice(exp))) fracPart = fracPart.slice(0, exp);
    else return null;
  }
  const minor = Number(wholePart) * 10 ** exp + Number(fracPart.padEnd(exp, "0") || "0");
  return Number.isSafeInteger(minor) ? minor : null;
}

export interface FormatMoneyOptions {
  locale: string;
  currency: string;
  /** Show the currency symbol. */
  symbol: boolean;
  /** Drop ".00" and trailing zeros ("12", "12.5"). */
  trimDecimals: boolean;
}

export function formatMoney(minor: number, options: FormatMoneyOptions): string {
  const exp = currencyExponent(options.currency);
  let decimal = minorToDecimalString(minor, options.currency);
  let fractionDigits = exp;
  if (options.trimDecimals && exp > 0) {
    decimal = decimal.replace(/\.?0+$/, "");
    const dot = decimal.indexOf(".");
    fractionDigits = dot === -1 ? 0 : decimal.length - dot - 1;
  }
  const formatter = new Intl.NumberFormat(options.locale, {
    style: options.symbol ? "currency" : "decimal",
    currency: options.currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
  // Intl.NumberFormat accepts decimal strings, which keeps the value exact.
  return formatter.format(decimal as unknown as number);
}

export function currencySymbol(currency: string, locale: string): string {
  const parts = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
  }).formatToParts(0);
  return parts.find((p) => p.type === "currency")?.value ?? currency;
}

/** Integer micro-USD cost of a Claude call. */
export function tokensCostMicros(tokens: number, usdPerMillion: number): number {
  // usdPerMillion is a price table constant; micros per token = usdPerMillion.
  return Math.round(tokens * usdPerMillion);
}
