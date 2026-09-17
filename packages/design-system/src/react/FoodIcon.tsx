import type { FoodIcon as FoodIconType } from "../catalog/index.ts";

export const FOOD_ICON_PATHS: Record<FoodIconType, string> = {
  bowl: "M8 22 H40 C40 32 33 39 24 39 C15 39 8 32 8 22 Z M18 39 H30 M17 15 C15.6 13.2 18.4 11.8 17 10 M24 15 C22.6 13.2 25.4 11.8 24 10 M31 15 C29.6 13.2 32.4 11.8 31 10",
  plate:
    "M24 38 A14 14 0 1 0 24 10 A14 14 0 1 0 24 38 Z M24 32 A8 8 0 1 0 24 16 A8 8 0 1 0 24 32 Z M6 10 V19 C6 21 7.5 22 7.5 22 V38 M9 10 V19 C9 21 7.5 22 7.5 22 M42 10 C39 12 39 20 42 23 V38",
  bread:
    "M9 20 C9 13 16 10 24 10 C32 10 39 13 39 20 C39 22.5 37.5 24 36 24 V37 C36 38.1 35.1 39 34 39 H14 C12.9 39 12 38.1 12 37 V24 C10.5 24 9 22.5 9 20 Z M19 17 L22 20 M26 15 L29 18",
  dessert: "M12 24 H36 L33 39 H15 Z M12 24 C12 17 17 13 24 13 C31 13 36 17 36 24 M24 13 V8 M20 28 L21.2 39 M28 28 L26.8 39",
  leaf: "M10 38 C10 20 22 10 38 10 C38 26 28 38 10 38 Z M10 38 L28 20",
  chili: "M31 13 C35 15 37 19 36 24 C34 33 24 40 12 39 C18 36 24 30 26 22 C27 17 28 14 31 13 Z M31 13 C31 10 33 8 36 8",
  fish: "M6 24 C12 15 24 13 33 20 L41 14 V34 L33 28 C24 35 12 33 6 24 Z M15 22.5 H15.1",
  meat: "M29 9 C36 9 40 14 39 20 C38 26 32 29 27 28 L20 35 C21 37 20 39 18 39 C16 39 15.5 37.5 16 36 C14.5 36.5 13 36 13 34 C13 32 15 31 17 32 L24 25 C23 19 24 9 29 9 Z",
};

export function FoodIcon({ type, size = "1em", strokeWidth = 1.5, title }: { type: FoodIconType; size?: string; strokeWidth?: number; title?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
      className="ms-food-icon"
    >
      {title ? <title>{title}</title> : null}
      <path d={FOOD_ICON_PATHS[type]} />
    </svg>
  );
}
