import { formatMoney, parseMoney, unconfirmedCount } from "@menu-studio/shared";
import { Link } from "react-router";
import { Badge, cx, Switch } from "../components/ui.tsx";
import { setItemFields } from "../lib/doc-edits.ts";
import { useEditor } from "../stores/editor.ts";

export function ContentPanel({ projectId }: { projectId: string }) {
  const { document: doc, commit, selectedItemId, select } = useEditor();
  if (!doc) return null;
  const guesses = unconfirmedCount(doc);
  return (
    <div className="scroll-quiet h-full overflow-y-auto">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="text-[12.5px] text-muted">{doc.sections.reduce((n, s) => n + s.items.length, 0)} items</div>
        <Link to={`/projects/${projectId}/review`} className="text-[12.5px] font-medium text-ink underline underline-offset-4">
          Full content review
        </Link>
      </div>
      {guesses ? (
        <div className="border-b border-line bg-warn-soft px-4 py-2.5 text-[12.5px] text-warn">
          {guesses} guessed details are hidden from print until confirmed. <Link to={`/projects/${projectId}/review`} className="font-medium underline">Review</Link>
        </div>
      ) : null}
      {doc.sections.map((section) => (
        <section key={section.id} className="border-b border-line px-4 py-3">
          <h3 className="display mb-2 text-[19px]">{section.title}</h3>
          <ul className="space-y-1">
            {section.items.map((item) => (
              <li
                key={item.id}
                className={cx("grid grid-cols-[minmax(0,1fr)_78px_auto] items-center gap-2 rounded-md px-1.5 py-1", selectedItemId === item.id && "bg-paper-2")}
                onClick={() => select(null, item.id)}
              >
                <input
                  key={item.name}
                  defaultValue={item.name}
                  onBlur={(e) => e.target.value.trim() && e.target.value !== item.name && void commit([setItemFields(doc, item.id, { name: e.target.value.trim() })].filter((x) => x !== null), "Renamed an item")}
                  className={cx("min-w-0 rounded border border-transparent bg-transparent px-1.5 py-1 text-[13px] hover:border-line focus:border-line-strong focus:bg-card focus:outline-none", !item.available && "text-muted line-through")}
                  aria-label="Item name"
                />
                {item.priceVariants.length ? (
                  <Badge className="justify-self-end">{item.priceVariants.length} prices</Badge>
                ) : (
                  <input
                    key={item.price ?? "none"}
                    defaultValue={item.price === null ? "" : formatMoney(item.price, { locale: doc.locale, currency: doc.currency, symbol: false, trimDecimals: true })}
                    onBlur={(e) => {
                      const minor = e.target.value.trim() ? parseMoney(e.target.value, doc.currency) : null;
                      if (minor !== item.price && (minor !== null || !e.target.value.trim())) {
                        const edit = setItemFields(doc, item.id, { price: minor });
                        if (edit) void commit([edit], "Edited a price");
                      }
                    }}
                    className="w-full rounded border border-line bg-card px-1.5 py-1 text-right text-[12.5px] tabular-nums"
                    aria-label={`${item.name} price`}
                  />
                )}
                <span title={item.available ? "Available" : "86'd"}>
                  <Switch
                    checked={item.available}
                    label={`${item.name} available`}
                    onChange={(v) => {
                      const edit = setItemFields(doc, item.id, { available: v });
                      if (edit) void commit([edit], v ? `${item.name} back on` : `86'd ${item.name}`);
                    }}
                  />
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
