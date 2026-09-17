import type { MenuDocument } from "../schemas/menu-document.ts";
import { item, major, section } from "./builders.ts";

const glassBottle = (glassLabel: string, glass: number, bottle: number) => [
  { label: glassLabel, price: major(glass) },
  { label: "Bouteille", price: major(bottle) },
];

export const bistroParis: MenuDocument = {
  schemaVersion: 1,
  id: "seed-bistro-paris",
  projectId: "seed",
  venueName: "Chez Lucette",
  venueType: "restaurant",
  currency: "GBP",
  locale: "en-GB",
  primaryLanguage: "en",
  additionalLanguages: ["fr"],
  footerNotes: ["A discretionary 12.5% service charge will be added to your bill."],
  sections: [
    section(
      "sec_cl000001",
      "Menu du Jour",
      [
        item("itm_cl000001", "Prix Fixe", major(24), {
          description: "Soupe à l'oignon or pâté de campagne; steak haché or ratatouille; crème caramel.",
          priceVariants: [
            { label: "Deux plats", price: major(24) },
            { label: "Trois plats", price: major(29) },
          ],
          featured: true,
        }),
      ],
      { subtitle: "Monday to Friday, 12 to 3pm", availability: { days: ["mon", "tue", "wed", "thu", "fri"], startTime: "12:00", endTime: "15:00" } },
    ),
    section("sec_cl000002", "Entrées", [
      item("itm_cl000002", "Soupe à l'Oignon Gratinée", major(9), {
        description: "Slow-cooked onions, beef stock, Comté crouton.",
        allergens: ["milk", "cereals_gluten", "celery"],
      }),
      item("itm_cl000003", "Escargots de Bourgogne", major(12), {
        description: "Six snails in parsley and garlic butter.",
        allergens: ["molluscs", "milk"],
      }),
      item("itm_cl000004", "Salade Lyonnaise", major(11), {
        description: "Frisée, lardons, croutons and a soft poached egg.",
        allergens: ["eggs", "mustard", "cereals_gluten"],
      }),
      item("itm_cl000005", "Pâté de Campagne", major(10), {
        description: "Cornichons, Dijon mustard and toasted sourdough.",
        allergens: ["mustard", "cereals_gluten", "sulphites"],
      }),
    ]),
    section("sec_cl000003", "Plats", [
      item("itm_cl000006", "Steak Frites", major(26), {
        description: "Bavette, sauce béarnaise and hand-cut frites.",
        allergens: ["milk", "eggs"],
        isSignature: true,
      }),
      item("itm_cl000007", "Moules Marinières", major(21), {
        description: "Cornish mussels, white wine, shallots and cream.",
        allergens: ["molluscs", "milk", "celery", "sulphites"],
      }),
      item("itm_cl000008", "Confit de Canard", major(24), {
        description: "Duck leg, pommes sarladaises and frisée.",
      }),
      item("itm_cl000009", "Ratatouille Provençale", major(17), {
        description: "Summer vegetables slow-cooked with thyme and olive oil.",
        dietaryTags: ["vegan", "gluten_free"],
      }),
    ]),
    section("sec_cl000004", "Desserts", [
      item("itm_cl000010", "Crème Brûlée", major(8), { dietaryTags: ["veg", "gluten_free"], allergens: ["eggs", "milk"] }),
      item("itm_cl000011", "Tarte Tatin", major(9), {
        description: "Caramelised apple, crème fraîche.",
        dietaryTags: ["veg"],
        allergens: ["cereals_gluten", "milk", "eggs"],
      }),
      item("itm_cl000012", "Mousse au Chocolat", major(8), { dietaryTags: ["veg", "gluten_free"], allergens: ["eggs", "milk"] }),
    ]),
    section("sec_cl000005", "Vins", [
      item("itm_cl000013", "Côtes du Rhône Rouge", major(9), {
        description: "Domaine selection, grenache and syrah.",
        priceVariants: glassBottle("175ml", 9, 34),
        allergens: ["sulphites"],
        attributes: { glassware: "wine", colorHex: "#6E1423", abvTier: "mid" },
      }),
      item("itm_cl000014", "Sancerre Blanc", major(12), {
        priceVariants: glassBottle("175ml", 12, 48),
        allergens: ["sulphites"],
        attributes: { glassware: "wine", colorHex: "#E8DFA8", abvTier: "mid" },
      }),
      item("itm_cl000015", "Champagne Brut", major(14), {
        priceVariants: glassBottle("125ml", 14, 72),
        allergens: ["sulphites"],
        attributes: { glassware: "flute", colorHex: "#EEDC9A", abvTier: "mid" },
      }),
      item("itm_cl000016", "Kir Royal", major(13), {
        description: "Crème de cassis and champagne.",
        allergens: ["sulphites"],
        attributes: { glassware: "flute", colorHex: "#9E2A3F", abvTier: "mid", baseSpirit: "champagne" },
      }),
    ]),
  ],
};
