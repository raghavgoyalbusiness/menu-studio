import type { MenuDocument } from "../schemas/menu-document.ts";
import { item, major, section } from "./builders.ts";

export const cocktailBarLondon: MenuDocument = {
  schemaVersion: 1,
  id: "seed-cocktail-bar-london",
  projectId: "seed",
  venueName: "Yoru Niwa",
  venueType: "bar",
  currency: "GBP",
  locale: "en-GB",
  primaryLanguage: "en",
  additionalLanguages: [],
  taxNote: "A discretionary 12.5% service charge is added to your bill.",
  allergenDisclaimer: "Please tell your bartender about any allergies before ordering.",
  footerNotes: ["Tuesday to Sunday, 6pm until late", "Shoreditch, London"],
  sections: [
    section(
      "sec_ya000001",
      "Signatures",
      [
        item("itm_ya000001", "Genko", major(16), {
          description: "Japanese whisky stirred with hojicha vermouth, bitter orange and cacao.",
          ingredients: ["Japanese whisky", "hojicha vermouth", "bitter orange", "cacao bitters"],
          attributes: { baseSpirit: "whisky", glassware: "nick_and_nora", colorHex: "#6B3A1E", abvTier: "high", flavor: { sweetBitter: 0.45, refreshingBoozy: 0.8 } },
          isSignature: true,
          featured: true,
        }),
        item("itm_ya000002", "Yuzu Highball", major(13), {
          description: "Japanese whisky, fresh yuzu and hard-carbonated soda.",
          ingredients: ["Japanese whisky", "yuzu", "soda"],
          attributes: { baseSpirit: "whisky", glassware: "highball", colorHex: "#E8D98A", abvTier: "low", flavor: { sweetBitter: -0.1, refreshingBoozy: -0.8 } },
        }),
        item("itm_ya000003", "Shiso Gimlet", major(14), {
          description: "London dry gin, shiso leaf cordial and lime.",
          ingredients: ["gin", "shiso cordial", "lime"],
          attributes: { baseSpirit: "gin", glassware: "coupe", colorHex: "#A8C98A", abvTier: "mid", flavor: { sweetBitter: -0.2, refreshingBoozy: 0.15 } },
        }),
        item("itm_ya000004", "Umeshu Sour", major(14), {
          description: "Plum wine, rice shochu, lemon and a silky egg-white foam.",
          ingredients: ["umeshu", "shochu", "lemon", "egg white"],
          allergens: ["eggs"],
          attributes: { baseSpirit: "shochu", glassware: "coupe", colorHex: "#E6B8A2", abvTier: "mid", flavor: { sweetBitter: -0.5, refreshingBoozy: -0.1 } },
        }),
        item("itm_ya000005", "Sakura Spritz", major(13), {
          description: "Junmai sake, cherry blossom cordial, sparkling wine and soda.",
          ingredients: ["sake", "cherry blossom cordial", "sparkling wine", "soda"],
          allergens: ["sulphites"],
          attributes: { baseSpirit: "sake", glassware: "wine", colorHex: "#F2C6CF", abvTier: "low", flavor: { sweetBitter: -0.6, refreshingBoozy: -0.7 } },
          isNew: true,
        }),
        item("itm_ya000006", "Kuro Negroni", major(15), {
          description: "Gin, black sesame Campari and sweet vermouth, stirred over a clear block.",
          ingredients: ["gin", "black sesame Campari", "sweet vermouth"],
          allergens: ["sesame"],
          attributes: { baseSpirit: "gin", glassware: "rocks", colorHex: "#7A1E1E", abvTier: "high", flavor: { sweetBitter: 0.85, refreshingBoozy: 0.7 } },
          isSignature: true,
        }),
        item("itm_ya000007", "Matcha Colada", major(14), {
          description: "White rum, ceremonial matcha, coconut and pineapple.",
          ingredients: ["white rum", "matcha", "coconut", "pineapple"],
          attributes: { baseSpirit: "rum", glassware: "tiki", colorHex: "#9DBF6B", abvTier: "mid", flavor: { sweetBitter: -0.55, refreshingBoozy: -0.3 }, caffeine: "low" },
        }),
        item("itm_ya000008", "Sencha Martini", major(15), {
          description: "Vodka and sencha-infused dry vermouth, very cold.",
          ingredients: ["vodka", "sencha dry vermouth"],
          attributes: { baseSpirit: "vodka", glassware: "martini", colorHex: "#D9E3B8", abvTier: "high", flavor: { sweetBitter: 0.2, refreshingBoozy: 0.9 } },
        }),
        item("itm_ya000009", "Kinmokusei Fizz", major(13), {
          description: "Gin, osmanthus blossom, lemon and soda.",
          ingredients: ["gin", "osmanthus", "lemon", "soda"],
          attributes: { baseSpirit: "gin", glassware: "collins", colorHex: "#F4D58D", abvTier: "low", flavor: { sweetBitter: -0.35, refreshingBoozy: -0.75 } },
        }),
        item("itm_ya000010", "Ginger Mule", major(13), {
          description: "Barley shochu, fresh ginger, lime and ginger beer.",
          ingredients: ["barley shochu", "ginger", "lime", "ginger beer"],
          allergens: ["cereals_gluten"],
          attributes: { baseSpirit: "shochu", glassware: "copper_mug", colorHex: "#D7B377", abvTier: "low", flavor: { sweetBitter: -0.2, refreshingBoozy: -0.6 } },
        }),
        item("itm_ya000011", "Hojicha Espresso Martini", major(15), {
          description: "Vodka, roasted hojicha, coffee liqueur and cold brew.",
          ingredients: ["vodka", "hojicha", "coffee liqueur", "cold brew"],
          attributes: { baseSpirit: "vodka", glassware: "coupe", colorHex: "#3B2418", abvTier: "mid", flavor: { sweetBitter: 0.4, refreshingBoozy: 0.3 }, caffeine: "high" },
        }),
        item("itm_ya000012", "Plum Blossom Royale", major(16), {
          description: "Umeshu topped with sparkling sake.",
          ingredients: ["umeshu", "sparkling sake"],
          allergens: ["sulphites"],
          attributes: { baseSpirit: "sake", glassware: "flute", colorHex: "#E9C9A8", abvTier: "low", flavor: { sweetBitter: -0.7, refreshingBoozy: -0.4 } },
        }),
      ],
      { subtitle: "Twelve drinks from the night garden" },
    ),
    section("sec_ya000002", "Zero Proof", [
      item("itm_ya000013", "Yuzu Tonic", major(8), {
        description: "Yuzu, sansho pepper and Indian tonic.",
        ingredients: ["yuzu", "sansho", "tonic"],
        dietaryTags: ["vegan"],
        attributes: { glassware: "highball", colorHex: "#EFE7B0", abvTier: "zero", flavor: { sweetBitter: -0.1, refreshingBoozy: -0.95 } },
      }),
      item("itm_ya000014", "Hojicha Cold Brew Soda", major(8), {
        description: "Roasted green tea cold brew, demerara and soda.",
        ingredients: ["hojicha", "demerara", "soda"],
        dietaryTags: ["vegan"],
        attributes: { glassware: "collins", colorHex: "#8A5A36", abvTier: "zero", caffeine: "medium", flavor: { sweetBitter: 0.2, refreshingBoozy: -0.7 } },
      }),
    ]),
    section(
      "sec_ya000003",
      "Small Plates",
      [
        item("itm_ya000015", "Edamame", major(6), {
          description: "Sea salt and yuzu kosho.",
          dietaryTags: ["vegan", "gluten_free"],
          allergens: ["soybeans"],
        }),
        item("itm_ya000016", "Chicken Karaage", major(9), {
          description: "Soy and ginger marinated thigh, kewpie and lemon.",
          allergens: ["cereals_gluten", "soybeans", "eggs"],
        }),
        item("itm_ya000017", "Tuna Tataki", major(12), {
          description: "Seared yellowfin, ponzu, spring onion and toasted sesame.",
          allergens: ["fish", "soybeans", "sesame"],
          dietaryTags: ["spicy_1"],
        }),
        item("itm_ya000018", "Miso Aubergine", major(8), {
          description: "Glazed with white miso and finished with sesame.",
          dietaryTags: ["vegan"],
          allergens: ["soybeans", "sesame"],
        }),
      ],
      { availability: { days: ["tue", "wed", "thu", "fri", "sat", "sun"], startTime: "18:00", endTime: "23:00" } },
    ),
  ],
};
