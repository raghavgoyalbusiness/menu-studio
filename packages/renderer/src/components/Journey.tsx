import type { MenuItem } from "@menu-studio/shared";
import { useRenderContext } from "../context.tsx";
import { MenuItemView } from "./Item.tsx";

export function JourneyView() {
  const ctx = useRenderContext();
  const journey = ctx.spec.journey;
  if (!journey) return null;
  return (
    <ol className={`ms-journey ms-journey--${journey.orientation}`} data-ms-block="journey">
      {journey.steps.map((step, i) => {
        const items = step.itemRefs
          .map((ref) => ctx.items.get(ref)?.item)
          .filter((item): item is MenuItem => Boolean(item) && (ctx.mode !== "qr" || Boolean(item?.available)));
        return (
          <li key={`${step.label}-${i}`} className="ms-journey__step">
            <div className="ms-journey__marker" aria-hidden>
              <span>{i + 1}</span>
            </div>
            <div className="ms-journey__body">
              <h2 className="ms-section__title">{step.label}</h2>
              <div className="ms-items">
                {items.map((item) => (
                  <MenuItemView key={item.id} item={item} variant="compact" />
                ))}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
