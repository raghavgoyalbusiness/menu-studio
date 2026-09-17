import type { MenuDocument } from "../schemas/menu-document.ts";
import { item, major, section } from "./builders.ts";

const regularLarge = (regular: number, large: number) => [
  { label: "Regular", price: major(regular) },
  { label: "Large", price: major(large) },
];

export const cafeBangalore: MenuDocument = {
  schemaVersion: 1,
  id: "seed-cafe-bangalore",
  projectId: "seed",
  venueName: "Filter & Fold",
  venueType: "cafe",
  currency: "INR",
  locale: "en-IN",
  primaryLanguage: "en",
  additionalLanguages: [],
  taxNote: "All prices include GST.",
  footerNotes: ["Open daily, 8am to 9pm", "Oat milk available on request"],
  sections: [
    section("sec_fb000001", "Coffee", [
      item("itm_fb000001", "South Indian Filter Coffee", major(120), {
        description: "Chicory-blend decoction with frothed milk, served in a davara.",
        dietaryTags: ["veg"],
        allergens: ["milk"],
        attributes: { servingTemp: "hot", caffeine: "high", glassware: "coffee_cup" },
        isSignature: true,
      }),
      item("itm_fb000002", "Cappuccino", major(180), {
        priceVariants: regularLarge(180, 220),
        dietaryTags: ["veg"],
        allergens: ["milk"],
        attributes: { servingTemp: "hot", caffeine: "high", glassware: "coffee_cup" },
      }),
      item("itm_fb000003", "Flat White", major(210), {
        description: "Double ristretto from Chikmagalur estates.",
        dietaryTags: ["veg"],
        allergens: ["milk"],
        attributes: { servingTemp: "hot", caffeine: "high", glassware: "coffee_cup" },
      }),
      item("itm_fb000004", "Cold Brew", major(190), {
        description: "Steeped for eighteen hours.",
        priceVariants: regularLarge(190, 240),
        dietaryTags: ["vegan"],
        attributes: { servingTemp: "iced", caffeine: "high", glassware: "highball" },
      }),
      item("itm_fb000005", "Vietnamese Iced Coffee", major(230), {
        description: "Dark roast over condensed milk and ice.",
        dietaryTags: ["veg"],
        allergens: ["milk"],
        attributes: { servingTemp: "iced", caffeine: "high", glassware: "rocks" },
        isNew: true,
      }),
    ]),
    section("sec_fb000002", "Tea", [
      item("itm_fb000006", "Masala Chai", major(90), {
        description: "Assam leaf simmered with ginger, cardamom and clove.",
        dietaryTags: ["veg"],
        allergens: ["milk"],
        attributes: { servingTemp: "hot", caffeine: "medium", glassware: "teacup" },
      }),
      item("itm_fb000007", "Ginger Lemon Honey", major(140), {
        dietaryTags: ["veg", "gluten_free"],
        attributes: { servingTemp: "hot", caffeine: "none", glassware: "teacup" },
      }),
      item("itm_fb000008", "Kashmiri Kahwa", major(160), {
        description: "Green tea with saffron, cinnamon and slivered almonds.",
        dietaryTags: ["vegan", "contains_nuts"],
        allergens: ["tree_nuts"],
        attributes: { servingTemp: "hot", caffeine: "low", glassware: "teacup" },
      }),
    ]),
    section(
      "sec_fb000003",
      "All-Day Breakfast",
      [
        item("itm_fb000009", "Akki Roti", major(220), {
          description: "Rice flour flatbread with coconut chutney and gunpowder.",
          dietaryTags: ["vegan", "gluten_free", "spicy_1"],
        }),
        item("itm_fb000010", "Masala Omelette", major(240), {
          description: "Three eggs, green chilli, onion, coriander, toasted pav.",
          dietaryTags: ["egg", "spicy_1"],
          allergens: ["eggs", "cereals_gluten", "milk"],
        }),
        item("itm_fb000011", "Shakshuka", major(320), {
          description: "Eggs baked in spiced tomato with sourdough.",
          dietaryTags: ["egg", "spicy_2"],
          allergens: ["eggs", "cereals_gluten"],
        }),
        item("itm_fb000012", "Avocado Toast", major(340), {
          description: "Sourdough, smashed avocado, pickled onion and chilli oil.",
          priceVariants: [
            { label: "Classic", price: major(340) },
            { label: "With poached egg", price: major(390) },
          ],
          dietaryTags: ["veg"],
          allergens: ["cereals_gluten"],
        }),
        item("itm_fb000013", "Ragi Banana Pancakes", major(290), {
          description: "Finger millet pancakes, jaggery syrup and whipped curd.",
          dietaryTags: ["veg"],
          allergens: ["milk", "eggs"],
        }),
      ],
      { availability: { days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], startTime: "08:00", endTime: "16:00" } },
    ),
    section("sec_fb000004", "Bakery", [
      item("itm_fb000014", "Butter Croissant", major(160), {
        dietaryTags: ["veg"],
        allergens: ["cereals_gluten", "milk", "eggs"],
      }),
      item("itm_fb000015", "Cardamom Bun", major(140), {
        description: "Swedish-style knot with green cardamom sugar.",
        dietaryTags: ["veg"],
        allergens: ["cereals_gluten", "milk", "eggs"],
        featured: true,
      }),
      item("itm_fb000016", "Banana Walnut Bread", major(150), {
        dietaryTags: ["veg", "contains_nuts"],
        allergens: ["cereals_gluten", "eggs", "tree_nuts"],
      }),
      item("itm_fb000017", "Egg Puff", major(80), {
        description: "Flaky pastry with masala egg.",
        dietaryTags: ["egg"],
        allergens: ["cereals_gluten", "eggs"],
      }),
      item("itm_fb000018", "Chocolate Chip Cookie", major(110), {
        dietaryTags: ["veg"],
        allergens: ["cereals_gluten", "milk", "eggs"],
      }),
    ]),
  ],
};
