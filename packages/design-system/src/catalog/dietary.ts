export type DietaryTagId =
  | "veg"
  | "non_veg"
  | "egg"
  | "vegan"
  | "gluten_free"
  | "dairy_free"
  | "contains_nuts"
  | "spicy_1"
  | "spicy_2"
  | "spicy_3"
  | "jain"
  | "halal";

export const DIETARY_LABELS: Record<DietaryTagId, string> = {
  veg: "Vegetarian",
  non_veg: "Non-vegetarian",
  egg: "Contains egg",
  vegan: "Vegan",
  gluten_free: "Gluten free",
  dairy_free: "Dairy free",
  contains_nuts: "Contains nuts",
  spicy_1: "Mildly spicy",
  spicy_2: "Spicy",
  spicy_3: "Very spicy",
  jain: "Jain",
  halal: "Halal",
};

export const ALLERGEN_LABELS: Record<string, string> = {
  celery: "Celery",
  cereals_gluten: "Cereals containing gluten",
  crustaceans: "Crustaceans",
  eggs: "Eggs",
  fish: "Fish",
  lupin: "Lupin",
  milk: "Milk",
  molluscs: "Molluscs",
  mustard: "Mustard",
  tree_nuts: "Tree nuts",
  peanuts: "Peanuts",
  sesame: "Sesame",
  soybeans: "Soya",
  sulphites: "Sulphites",
};

/** Legend order: diet first, then spice, then the rest. */
export const DIETARY_LEGEND_ORDER: DietaryTagId[] = [
  "veg",
  "non_veg",
  "egg",
  "vegan",
  "jain",
  "halal",
  "gluten_free",
  "dairy_free",
  "contains_nuts",
  "spicy_1",
  "spicy_2",
  "spicy_3",
];
