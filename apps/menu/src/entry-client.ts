/**
 * QR menu behaviour without a framework: the page is fully server-rendered; this script only
 * filters, highlights section tabs, applies serving hours at view time and sends anonymous
 * analytics beacons. Keeps the JS budget tiny.
 */
import "@menu-studio/renderer/renderer.css";
import "./menu.css";

interface MenuConfig {
  m: string;
  api: string;
  tz: string;
  lang: string;
}

declare global {
  interface Window {
    __MENU__?: MenuConfig;
  }
}

const config = window.__MENU__;
const $$ = <T extends Element>(selector: string, root: ParentNode = document) => Array.from(root.querySelectorAll<T>(selector));

// ---------- Search and dietary filters ----------
const search = document.querySelector<HTMLInputElement>("[data-qr-search]");
const filterButtons = $$<HTMLButtonElement>("[data-qr-filter]");
const empty = document.querySelector<HTMLElement>("[data-qr-empty]");

function applyFilters(): void {
  const query = (search?.value ?? "").trim().toLowerCase();
  const active = filterButtons.filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => (b.dataset.qrFilter ?? "").split(" "));
  let visible = 0;
  for (const item of $$<HTMLElement>("[data-ms-item][data-search]")) {
    const text = item.dataset.search ?? "";
    const diet = (item.dataset.diet ?? "").split(" ");
    const matchesQuery = !query || text.includes(query);
    const matchesDiet = active.every((tags) => tags.some((t) => diet.includes(t)));
    const show = matchesQuery && matchesDiet;
    item.toggleAttribute("data-ms-hidden", !show);
    item.setAttribute("data-ms-hidden", show ? "false" : "true");
    if (show) visible++;
  }
  for (const section of $$<HTMLElement>("[data-ms-section]")) {
    const anyVisible = $$<HTMLElement>("[data-ms-item]", section).some((i) => i.dataset.msHidden !== "true");
    section.setAttribute("data-ms-hidden", anyVisible ? "false" : "true");
    if (query || active.length) (section as HTMLDetailsElement).open = true;
  }
  if (empty) empty.hidden = visible > 0;
}

search?.addEventListener("input", applyFilters);
for (const button of filterButtons) {
  button.addEventListener("click", () => {
    button.setAttribute("aria-pressed", button.getAttribute("aria-pressed") === "true" ? "false" : "true");
    applyFilters();
  });
}

// ---------- Serving hours, evaluated now in the venue's time zone ----------
const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
function availableNow(window: { days: string[]; startTime: string; endTime: string }, tz: string): boolean {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const day = (parts.find((p) => p.type === "weekday")?.value ?? "").slice(0, 3).toLowerCase();
  const minutes = Number(parts.find((p) => p.type === "hour")?.value ?? 0) * 60 + Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  const [sh = 0, sm = 0] = window.startTime.split(":").map(Number);
  const [eh = 0, em = 0] = window.endTime.split(":").map(Number);
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  if (start <= end) return window.days.includes(day) && minutes >= start && minutes < end;
  const previous = DAYS[(DAYS.indexOf(day) + 6) % 7] ?? day;
  return (window.days.includes(day) && minutes >= start) || (window.days.includes(previous) && minutes < end);
}

if (config) {
  for (const list of $$<HTMLElement>("[data-ms-availability]")) {
    try {
      const w = JSON.parse(list.dataset.msAvailability ?? "{}") as { days: string[]; startTime: string; endTime: string };
      const open = availableNow(w, config.tz);
      list.closest("[data-ms-section]")?.classList.toggle("ms-section--unavailable", !open);
      list.toggleAttribute("inert", !open);
      if (!open && !list.parentElement?.querySelector(".qr-closed")) {
        const note = document.createElement("p");
        note.className = "qr-closed";
        note.textContent = `Served ${w.startTime}–${w.endTime}. Not available right now.`;
        list.before(note);
        list.hidden = true;
      }
    } catch {
      // Malformed availability: show the section.
    }
  }
}

// ---------- Sticky section tabs ----------
const tabs = $$<HTMLAnchorElement>("[data-ms-tab]");
if (tabs.length && "IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const id = (entry.target as HTMLElement).dataset.msSection;
        for (const tab of tabs) {
          const current = tab.dataset.msTab === id;
          tab.setAttribute("aria-current", current ? "true" : "false");
          if (current) tab.scrollIntoView({ inline: "center", block: "nearest" });
        }
      }
    },
    { rootMargin: "-45% 0px -50% 0px" },
  );
  for (const section of $$<HTMLElement>("[data-ms-section]")) observer.observe(section);
}

// ---------- Anonymous analytics ----------
function beacon(path: string, body: Record<string, unknown>): void {
  if (!config) return;
  const payload = JSON.stringify({ m: config.m, ...body });
  if (!navigator.sendBeacon?.(`${config.api}${path}`, new Blob([payload], { type: "text/plain" }))) {
    void fetch(`${config.api}${path}`, { method: "POST", body: payload, keepalive: true, mode: "cors" }).catch(() => undefined);
  }
}

if (config) {
  const width = window.innerWidth;
  const device = width < 700 ? "mobile" : width < 1100 ? "tablet" : "desktop";
  const referrer = document.referrer ? (/google|bing|duckduckgo/.test(document.referrer) ? "search" : /instagram|facebook|t\.co|tiktok/.test(document.referrer) ? "social" : "other") : new URLSearchParams(location.search).has("qr") ? "qr" : "direct";
  beacon("/analytics/view", { lang: config.lang, device, ref: referrer });
  const opened = new Set<string>();
  document.addEventListener("click", (event) => {
    const item = (event.target as Element).closest<HTMLElement>("[data-ms-item]");
    const id = item?.dataset.msItem;
    if (!id || opened.has(id)) return;
    opened.add(id);
    beacon("/analytics/item", { item: id });
  });
}
