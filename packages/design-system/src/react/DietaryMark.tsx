import type { ReactNode } from "react";
import { DIETARY_LABELS, type DietaryTagId } from "../catalog/dietary.ts";

const VEG_GREEN = "#1B7F3B";
const NONVEG_RED = "#A3261C";
const EGG_AMBER = "#B7791F";

function Square({ color, children }: { color: string; children: ReactNode }) {
  return (
    <>
      <rect x="1.5" y="1.5" width="21" height="21" rx="2" fill="none" stroke={color} strokeWidth="2" />
      {children}
    </>
  );
}

function Letters({ text, color = "currentColor" }: { text: string; color?: string }) {
  return (
    <>
      <circle cx="12" cy="12" r="10.5" fill="none" stroke={color} strokeWidth="1.5" />
      <text
        x="12"
        y="12"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={text.length > 1 ? 9 : 11}
        fontWeight={700}
        fontFamily="inherit"
        fill={color}
      >
        {text}
      </text>
    </>
  );
}

const CHILI = "M14.5 5.5 C17 6.7 18 9 17.4 12 C16.3 17 11 20.5 5 20 C8 18.4 11 15.2 12 11 C12.6 8.3 13 6.2 14.5 5.5 Z M14.5 5.5 C14.5 4 15.5 3 17 3";

function marks(tag: DietaryTagId): ReactNode {
  switch (tag) {
    case "veg":
      return (
        <Square color={VEG_GREEN}>
          <circle cx="12" cy="12" r="5.5" fill={VEG_GREEN} />
        </Square>
      );
    case "non_veg":
      return (
        <Square color={NONVEG_RED}>
          <circle cx="12" cy="12" r="5.5" fill={NONVEG_RED} />
        </Square>
      );
    case "egg":
      return (
        <Square color={EGG_AMBER}>
          <circle cx="12" cy="12" r="5.5" fill={EGG_AMBER} />
        </Square>
      );
    case "vegan":
      return (
        <path
          d="M4 20 C4 10 10 4 20 4 C20 13 14.5 20 4 20 Z M4 20 L14 10"
          fill="none"
          stroke={VEG_GREEN}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    case "gluten_free":
      return <Letters text="GF" />;
    case "dairy_free":
      return <Letters text="DF" />;
    case "contains_nuts":
      return <Letters text="N" />;
    case "jain":
      return <Letters text="J" color={VEG_GREEN} />;
    case "halal":
      return <Letters text="H" />;
    case "spicy_1":
    case "spicy_2":
    case "spicy_3":
      return <path d={CHILI} fill={NONVEG_RED} stroke="none" />;
  }
}

export function DietaryMark({ tag, size = "0.95em" }: { tag: DietaryTagId; size?: string }) {
  const count = tag === "spicy_3" ? 3 : tag === "spicy_2" ? 2 : 1;
  const width = tag.startsWith("spicy_") ? 24 + (count - 1) * 14 : 24;
  return (
    <svg
      viewBox={`0 0 ${width} 24`}
      height={size}
      width={`calc(${size} * ${width / 24})`}
      role="img"
      aria-label={DIETARY_LABELS[tag]}
      className={`ms-mark ms-mark--${tag}`}
    >
      <title>{DIETARY_LABELS[tag]}</title>
      {Array.from({ length: count }, (_, i) => (
        <g key={i} transform={`translate(${i * 14} 0)`}>
          {marks(tag)}
        </g>
      ))}
    </svg>
  );
}
