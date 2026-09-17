export type TextDirection = "ltr" | "rtl";
export type Script = "latin" | "devanagari" | "arabic" | "japanese";

const RTL_LANGUAGES = new Set(["ar", "arc", "dv", "fa", "he", "ku", "ps", "sd", "ug", "ur", "yi"]);

export function baseLanguage(tag: string): string {
  return tag.split("-")[0]?.toLowerCase() ?? tag;
}

export function textDirection(lang: string): TextDirection {
  return RTL_LANGUAGES.has(baseLanguage(lang)) ? "rtl" : "ltr";
}

const SCRIPT_BY_LANGUAGE: Record<string, Script> = {
  hi: "devanagari",
  mr: "devanagari",
  ne: "devanagari",
  sa: "devanagari",
  ar: "arabic",
  ur: "arabic",
  fa: "arabic",
  ps: "arabic",
  ja: "japanese",
};

export function scriptForLanguage(lang: string): Script {
  return SCRIPT_BY_LANGUAGE[baseLanguage(lang)] ?? "latin";
}

const SCRIPT_PATTERNS: [Script, RegExp][] = [
  ["devanagari", /\p{Script=Devanagari}/u],
  ["arabic", /\p{Script=Arabic}/u],
  ["japanese", /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u],
  ["latin", /\p{Script=Latin}/u],
];

/** Scripts present in a piece of text. */
export function detectScripts(text: string): Script[] {
  return SCRIPT_PATTERNS.filter(([, re]) => re.test(text)).map(([script]) => script);
}

export interface LanguageInfo {
  code: string;
  name: string;
  nativeName: string;
}

export const LANGUAGES: LanguageInfo[] = [
  { code: "en", name: "English", nativeName: "English" },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी" },
  { code: "fr", name: "French", nativeName: "Français" },
  { code: "es", name: "Spanish", nativeName: "Español" },
  { code: "de", name: "German", nativeName: "Deutsch" },
  { code: "it", name: "Italian", nativeName: "Italiano" },
  { code: "pt", name: "Portuguese", nativeName: "Português" },
  { code: "nl", name: "Dutch", nativeName: "Nederlands" },
  { code: "ar", name: "Arabic", nativeName: "العربية" },
  { code: "ur", name: "Urdu", nativeName: "اردو" },
  { code: "ja", name: "Japanese", nativeName: "日本語" },
  { code: "zh", name: "Chinese", nativeName: "中文" },
  { code: "ko", name: "Korean", nativeName: "한국어" },
  { code: "mr", name: "Marathi", nativeName: "मराठी" },
  { code: "ta", name: "Tamil", nativeName: "தமிழ்" },
  { code: "bn", name: "Bengali", nativeName: "বাংলা" },
  { code: "tr", name: "Turkish", nativeName: "Türkçe" },
  { code: "ru", name: "Russian", nativeName: "Русский" },
];

export function languageName(code: string, native = false): string {
  const info = LANGUAGES.find((l) => l.code === baseLanguage(code));
  return info ? (native ? info.nativeName : info.name) : code;
}

export interface CountryDefaults {
  code: string;
  name: string;
  currency: string;
  locale: string;
  timezone: string;
}

export const COUNTRIES: CountryDefaults[] = [
  { code: "GB", name: "United Kingdom", currency: "GBP", locale: "en-GB", timezone: "Europe/London" },
  { code: "IN", name: "India", currency: "INR", locale: "en-IN", timezone: "Asia/Kolkata" },
  { code: "US", name: "United States", currency: "USD", locale: "en-US", timezone: "America/New_York" },
  { code: "IE", name: "Ireland", currency: "EUR", locale: "en-IE", timezone: "Europe/Dublin" },
  { code: "FR", name: "France", currency: "EUR", locale: "fr-FR", timezone: "Europe/Paris" },
  { code: "DE", name: "Germany", currency: "EUR", locale: "de-DE", timezone: "Europe/Berlin" },
  { code: "ES", name: "Spain", currency: "EUR", locale: "es-ES", timezone: "Europe/Madrid" },
  { code: "IT", name: "Italy", currency: "EUR", locale: "it-IT", timezone: "Europe/Rome" },
  { code: "NL", name: "Netherlands", currency: "EUR", locale: "nl-NL", timezone: "Europe/Amsterdam" },
  { code: "AE", name: "United Arab Emirates", currency: "AED", locale: "en-AE", timezone: "Asia/Dubai" },
  { code: "SA", name: "Saudi Arabia", currency: "SAR", locale: "ar-SA", timezone: "Asia/Riyadh" },
  { code: "SG", name: "Singapore", currency: "SGD", locale: "en-SG", timezone: "Asia/Singapore" },
  { code: "JP", name: "Japan", currency: "JPY", locale: "ja-JP", timezone: "Asia/Tokyo" },
  { code: "AU", name: "Australia", currency: "AUD", locale: "en-AU", timezone: "Australia/Sydney" },
  { code: "CA", name: "Canada", currency: "CAD", locale: "en-CA", timezone: "America/Toronto" },
];

export function countryDefaults(code: string): CountryDefaults {
  return COUNTRIES.find((c) => c.code === code.toUpperCase()) ?? { code, name: code, currency: "USD", locale: "en-US", timezone: "UTC" };
}

/** Reverse lookup used by onboarding to preselect a country. */
export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
