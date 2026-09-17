import type { MenuItem, MenuSection } from "../schemas/menu-document.ts";

type ItemExtras = Partial<Omit<MenuItem, "id" | "name" | "price">>;

export function item(id: string, name: string, price: number | null, extras: ItemExtras = {}): MenuItem {
  return {
    id,
    name,
    price,
    priceVariants: [],
    ingredients: [],
    dietaryTags: [],
    allergens: [],
    attributes: {},
    featured: false,
    isNew: false,
    isSignature: false,
    inferredFields: [],
    available: true,
    ...extras,
  };
}

export function section(id: string, title: string, items: MenuItem[], extras: Partial<Omit<MenuSection, "id" | "title" | "items">> = {}): MenuSection {
  return { id, title, items, ...extras };
}

/** Rupees, pounds or dollars → minor units, for readable seed data. */
export const major = (amount: number) => Math.round(amount * 100);
