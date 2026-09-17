import { describe, expect, it } from "vitest";
import { baseLanguage, COUNTRIES, countryDefaults, detectScripts, isValidTimeZone, languageName, LANGUAGES, scriptForLanguage, textDirection } from "./index.ts";

describe("language tags", () => {
  it("takes the base language from a regional tag", () => {
    expect(baseLanguage("pt-BR")).toBe("pt");
    expect(baseLanguage("AR-EG")).toBe("ar");
    expect(baseLanguage("ja")).toBe("ja");
  });

  it("puts Arabic, Hebrew and Urdu right to left, and everything else left to right", () => {
    for (const rtl of ["ar", "he", "ur", "fa", "ar-AE"]) expect(textDirection(rtl)).toBe("rtl");
    for (const ltr of ["en", "fr", "hi", "ja", "en-IN"]) expect(textDirection(ltr)).toBe("ltr");
  });
});

describe("scripts", () => {
  it("maps a language to the script its menu will be set in", () => {
    expect(scriptForLanguage("hi")).toBe("devanagari");
    expect(scriptForLanguage("ur-PK")).toBe("arabic");
    expect(scriptForLanguage("ja")).toBe("japanese");
    expect(scriptForLanguage("pt")).toBe("latin");
  });

  it("detects every script present in a mixed line", () => {
    expect(detectScripts("Paneer Tikka")).toEqual(["latin"]);
    expect(detectScripts("पनीर टिक्का")).toEqual(["devanagari"]);
    // A translated menu keeps the original name alongside, which is the case that needs two fonts.
    expect(detectScripts("Genko 玄狐")).toEqual(["japanese", "latin"]);
    expect(detectScripts("مرحبا Hummus")).toEqual(["arabic", "latin"]);
  });

  it("finds nothing in punctuation or digits", () => {
    expect(detectScripts("— 12.50 · £")).toEqual([]);
  });
});

describe("country defaults", () => {
  it("knows the currency, locale and time zone of a supported country", () => {
    expect(countryDefaults("IN")).toMatchObject({ currency: "INR", locale: "en-IN", timezone: "Asia/Kolkata" });
    expect(countryDefaults("jp")).toMatchObject({ currency: "JPY", timezone: "Asia/Tokyo" });
  });

  it("falls back without inventing a currency for an unknown country", () => {
    expect(countryDefaults("ZZ")).toMatchObject({ code: "ZZ", currency: "USD", timezone: "UTC" });
  });

  it("ships a valid time zone and a three-letter currency for every country", () => {
    for (const country of COUNTRIES) {
      expect(isValidTimeZone(country.timezone), `${country.code} time zone`).toBe(true);
      expect(country.currency, `${country.code} currency`).toMatch(/^[A-Z]{3}$/);
      expect(country.locale, `${country.code} locale`).toMatch(/^[a-z]{2}-[A-Z]{2}$/);
    }
  });

  it("rejects a time zone the browser cannot resolve", () => {
    expect(isValidTimeZone("Europe/Nowhere")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });
});

describe("language names", () => {
  it("names a language in English or in its own script", () => {
    expect(languageName("fr")).toBe("French");
    expect(languageName("fr", true)).toBe("Français");
  });

  it("falls back to the code it was given", () => {
    expect(languageName("zz")).toBe("zz");
  });

  it("has a native name for every offered language", () => {
    expect(LANGUAGES.length).toBeGreaterThan(0);
    for (const language of LANGUAGES) {
      expect(language.nativeName.length, language.code).toBeGreaterThan(0);
      expect(language.code).toMatch(/^[a-z]{2}$/);
    }
  });
});
