import { DietaryMark, FoodIcon, GlassIcon } from "@menu-studio/design-system/react";
import { ALLERGEN_LABELS, type FoodIcon as FoodIconType } from "@menu-studio/design-system/catalog";
import {
  confirmedAllergens,
  confirmedDietaryTags,
  formatMoney,
  itemDisplayDescription,
  itemDisplayName,
  type MenuItem,
} from "@menu-studio/shared";
import { useRenderContext, type RenderContextValue } from "../context.tsx";
import { Editable } from "./Editable.tsx";

export type ItemVariant = "row" | "card" | "feature" | "editorial" | "mobile" | "matrix" | "compact";

function itemPointer(ctx: RenderContextValue, item: MenuItem): string | null {
  const loc = ctx.items.get(item.id);
  return loc ? `/sections/${loc.sectionIndex}/items/${loc.itemIndex}` : null;
}

export function formatPrice(ctx: RenderContextValue, minor: number): string {
  const t = ctx.spec.tokens;
  return formatMoney(minor, {
    locale: ctx.document.locale,
    currency: ctx.document.currency,
    symbol: t.pricePlacement !== "no_currency_symbol",
    trimDecimals: t.priceStyle !== "plain",
  });
}

export function PriceView({ item, className }: { item: MenuItem; className?: string }) {
  const ctx = useRenderContext();
  const base = itemPointer(ctx, item);
  if (item.priceVariants.length > 0) {
    return (
      <span className={`ms-price ms-price--variants ${className ?? ""}`}>
        {item.priceVariants.map((variant, i) => (
          <span className="ms-price__variant" key={`${variant.label}-${i}`}>
            <Editable className="ms-price__label" pointer={base ? `${base}/priceVariants/${i}/label` : null} value={variant.label} />
            <Editable className="ms-price__amount" kind="price" pointer={base ? `${base}/priceVariants/${i}/price` : null} value={formatPrice(ctx, variant.price)} />
          </span>
        ))}
      </span>
    );
  }
  if (item.price === null) return null;
  return (
    <span className={`ms-price ${className ?? ""}`}>
      <Editable className="ms-price__amount" kind="price" pointer={base ? `${base}/price` : null} value={formatPrice(ctx, item.price)} />
    </span>
  );
}

function foodIconFor(item: MenuItem, sectionTitle: string): FoodIconType {
  const text = `${sectionTitle} ${item.name}`.toLowerCase();
  if (/dessert|sweet|cake|pudding|brûlée|mousse|jamun|phirni|cookie|bun/.test(text)) return "dessert";
  if (/bread|naan|roti|paratha|croissant|toast|bakery/.test(text)) return "bread";
  if (item.allergens.includes("fish") || /fish|salmon|tuna|prawn|mussel|moules/.test(text)) return "fish";
  if (/chilli|chili|spicy/.test(text) || item.dietaryTags.some((t) => t === "spicy_2" || t === "spicy_3")) return "chili";
  if (item.dietaryTags.includes("non_veg") || /chicken|mutton|lamb|beef|steak|duck|pork/.test(text)) return "meat";
  if (item.dietaryTags.includes("vegan") || /salad|green/.test(text)) return "leaf";
  if (/soup|bowl|curry|dal|biryani|rice/.test(text)) return "bowl";
  return "plate";
}

export function Marks({ item }: { item: MenuItem }) {
  const ctx = useRenderContext();
  if (ctx.spec.tokens.iconSet === "none") return null;
  const tags = confirmedDietaryTags(item);
  if (!tags.length) return null;
  return (
    <span className="ms-marks">
      {tags.map((tag) => (
        <DietaryMark key={tag} tag={tag} />
      ))}
    </span>
  );
}

export function MenuItemView({ item, variant }: { item: MenuItem; variant: ItemVariant }) {
  const ctx = useRenderContext();
  const t = ctx.spec.tokens;
  const loc = ctx.items.get(item.id);
  const base = itemPointer(ctx, item);
  const name = itemDisplayName(item, ctx.lang);
  const description = itemDisplayDescription(item, ctx.lang);
  const quadrant = ctx.spec.engineeringApplied ? item.engineering?.quadrant : undefined;
  const boosted = quadrant === "star" || quadrant === "puzzle";
  const showGlass = t.iconSet === "glassware" && item.attributes.glassware;
  const showFood = t.iconSet === "food_minimal";
  const leaders = t.priceStyle === "dot_leaders";
  const placement = t.pricePlacement;
  const selected = ctx.selectedItemId === item.id;

  const classes = [
    "ms-item",
    `ms-item--${variant}`,
    item.featured ? "ms-item--featured" : "",
    boosted ? "ms-item--boosted" : "",
    !item.available ? "ms-item--unavailable" : "",
    selected ? "ms-item--selected" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const badges = (
    <>
      {item.isSignature ? <span className="ms-badge">Signature</span> : null}
      {item.isNew ? <span className="ms-badge">New</span> : null}
      {boosted ? <span className="ms-badge ms-badge--boost" aria-label="House favourite">◆</span> : null}
    </>
  );

  const nameEl = <Editable className="ms-item__name" pointer={base ? `${base}/name` : null} value={name} />;
  const price = <PriceView item={item} />;
  const icon = showGlass ? (
    <span className="ms-item__icon">
      <GlassIcon type={item.attributes.glassware ?? "rocks"} colorHex={item.attributes.colorHex} />
    </span>
  ) : showFood ? (
    <span className="ms-item__icon">
      <FoodIcon type={foodIconFor(item, loc?.section.title ?? "")} />
    </span>
  ) : null;

  const allergens = ctx.mode === "qr" ? confirmedAllergens(item) : [];
  const attributes =
    ctx.mode === "qr"
      ? {
          "data-ms-item": item.id,
          "data-diet": confirmedDietaryTags(item).join(" "),
          "data-search": `${name} ${description ?? ""} ${item.ingredients.join(" ")}`.toLowerCase(),
        }
      : { "data-ms-item": item.id };

  const onClick = ctx.editing?.selectItem
    ? () => {
        ctx.editing?.selectItem?.(item.id);
      }
    : undefined;

  return (
    <div className={classes} {...attributes} onClick={onClick}>
      {icon}
      <div className="ms-item__body">
        <div className="ms-item__head">
          {nameEl}
          {badges}
          <Marks item={item} />
          {placement === "right_aligned" || placement === "no_currency_symbol" ? (
            <>
              <span className={leaders ? "ms-leaders" : "ms-spacer"} aria-hidden />
              {price}
            </>
          ) : null}
          {placement === "inline_after_desc" && !description ? <span className="ms-price-inline">{price}</span> : null}
        </div>
        {placement === "below_name" ? <div className="ms-item__price-line">{price}</div> : null}
        {description ? (
          <p className="ms-item__desc">
            <Editable pointer={base && ctx.lang === ctx.document.primaryLanguage ? `${base}/description` : null} value={description} multiline />
            {placement === "inline_after_desc" ? <span className="ms-price-inline"> {price}</span> : null}
          </p>
        ) : null}
        {allergens.length ? (
          <details className="ms-allergens">
            <summary>Allergens</summary>
            <span>{allergens.map((a) => ALLERGEN_LABELS[a] ?? a).join(", ")}</span>
          </details>
        ) : null}
      </div>
    </div>
  );
}
