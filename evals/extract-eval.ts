/**
 * Extraction eval: how faithfully does /extract turn a real menu into a MenuDocument?
 *
 *   node evals/extract-eval.ts                 # every fixture
 *   node evals/extract-eval.ts --case bistro   # one fixture
 *   node evals/extract-eval.ts --report out.json
 *
 * Needs the local stack running (pnpm db:start, pnpm dev) and ANTHROPIC_API_KEY set for the API.
 * Fixtures are menus belonging to other people, so they are gitignored: see fixtures/README.md.
 *
 * Metrics, in the order they matter:
 *   item recall          items in the menu that came back        (missing items are the worst failure)
 *   invented items       items that came back but are not on the menu (must be zero)
 *   price accuracy       matched items whose price is exactly right  (money is integer minor units)
 *   false inference rate inferred fields whose value contradicts the source
 *   section recall       sections that survived
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { parseArgs } from "node:util";

const API = process.env.API_URL ?? "http://127.0.0.1:5323";
const EMAIL = process.env.SEED_EMAIL ?? "demo@menu-studio.local";
const FIXTURES = new URL("fixtures/", import.meta.url).pathname;

const THRESHOLDS = { itemRecall: 0.95, inventedItems: 0, priceAccuracy: 0.98, falseInferenceRate: 0.1, sectionRecall: 0.9 };

interface ExpectedItem {
  name: string;
  /** Integer minor units, or null when the menu shows no price. */
  price: number | null;
  dietaryTags?: string[];
}
interface Expected {
  venue: { name: string; country: string; currency: string };
  sections: { title: string; items: ExpectedItem[] }[];
}
interface ActualItem {
  name: string;
  price: number | null;
  dietaryTags: string[];
  inferredFields: string[];
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Menus rename things slightly between OCR and print, so match on tokens rather than equality. */
function similarity(a: string, b: string): number {
  const left = new Set(normalize(a).split(" ").filter(Boolean));
  const right = new Set(normalize(b).split(" ").filter(Boolean));
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared++;
  return (2 * shared) / (left.size + right.size);
}

function matchItems(expected: ExpectedItem[], actual: ActualItem[]): { pairs: { expected: ExpectedItem; actual: ActualItem }[]; missing: ExpectedItem[]; invented: ActualItem[] } {
  const remaining = [...actual];
  const pairs: { expected: ExpectedItem; actual: ActualItem }[] = [];
  const missing: ExpectedItem[] = [];
  for (const want of expected) {
    let bestIndex = -1;
    let best = 0;
    remaining.forEach((candidate, index) => {
      const score = similarity(want.name, candidate.name);
      if (score > best) {
        best = score;
        bestIndex = index;
      }
    });
    if (best >= 0.7 && bestIndex >= 0) pairs.push({ expected: want, actual: remaining.splice(bestIndex, 1)[0]! });
    else missing.push(want);
  }
  return { pairs, missing, invented: remaining };
}

interface CaseResult {
  name: string;
  itemRecall: number;
  inventedItems: number;
  priceAccuracy: number;
  falseInferenceRate: number;
  sectionRecall: number;
  missing: string[];
  wrongPrices: { item: string; expected: number | null; actual: number | null }[];
  falseInferences: { item: string; field: string }[];
  elapsedMs: number;
}

function score(name: string, expected: Expected, document: { sections: { title: string; items: ActualItem[] }[] }, elapsedMs: number): CaseResult {
  const expectedItems = expected.sections.flatMap((s) => s.items);
  const actualItems = document.sections.flatMap((s) => s.items);
  const { pairs, missing, invented } = matchItems(expectedItems, actualItems);

  const priced = pairs.filter((p) => p.expected.price !== null);
  const wrongPrices = priced.filter((p) => p.actual.price !== p.expected.price).map((p) => ({ item: p.expected.name, expected: p.expected.price, actual: p.actual.price }));

  // An inference is false when the model marked a field as inferred and the fixture disagrees.
  // Fields the fixture does not describe are not counted either way.
  const falseInferences: { item: string; field: string }[] = [];
  for (const pair of pairs) {
    for (const field of pair.actual.inferredFields) {
      if (field === "price" && pair.expected.price !== null && pair.actual.price !== pair.expected.price) falseInferences.push({ item: pair.expected.name, field });
      if (field === "dietaryTags" && pair.expected.dietaryTags) {
        const wanted = new Set(pair.expected.dietaryTags);
        if (pair.actual.dietaryTags.some((tag) => !wanted.has(tag))) falseInferences.push({ item: pair.expected.name, field });
      }
    }
  }
  const inferredCount = pairs.reduce((total, pair) => total + pair.actual.inferredFields.length, 0);

  const matchedSections = expected.sections.filter((section) => document.sections.some((actual) => similarity(section.title, actual.title) >= 0.7));

  return {
    name,
    itemRecall: expectedItems.length ? pairs.length / expectedItems.length : 1,
    inventedItems: invented.length,
    priceAccuracy: priced.length ? (priced.length - wrongPrices.length) / priced.length : 1,
    falseInferenceRate: inferredCount ? falseInferences.length / inferredCount : 0,
    sectionRecall: expected.sections.length ? matchedSections.length / expected.sections.length : 1,
    missing: missing.map((m) => m.name),
    wrongPrices,
    falseInferences,
    elapsedMs,
  };
}

async function signIn(): Promise<string> {
  const link = (await (await fetch(`${API}/auth/local/magic-link`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: EMAIL }) })).json()) as {
    devLink?: string;
  };
  const token = link.devLink ? new URL(link.devLink).searchParams.get("token") : null;
  if (!token) throw new Error("Local sign-in is disabled on this API; run it with AUTH_MODE=local.");
  const verified = (await (await fetch(`${API}/auth/local/verify`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) })).json()) as {
    accessToken: string;
  };
  return verified.accessToken;
}

async function call<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, { ...init, headers: { authorization: `Bearer ${token}`, ...(init.body instanceof FormData ? {} : { "content-type": "application/json" }), ...init.headers } });
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

async function runCase(token: string, venueId: string, orgId: string, dir: string, name: string): Promise<CaseResult> {
  const expected = JSON.parse(await readFile(join(dir, "expected.json"), "utf8")) as Expected;
  const files = (await readdir(dir)).filter((f) => f.startsWith("source"));
  const project = await call<{ project: { id: string } }>(token, "/projects", { method: "POST", body: JSON.stringify({ venueId, name: `eval ${name}`, start: { kind: "import" } }) });
  const projectId = project.project.id;

  const uploadIds: string[] = [];
  let text: string | undefined;
  for (const file of files) {
    if (extname(file) === ".txt") {
      text = await readFile(join(dir, file), "utf8");
      continue;
    }
    const form = new FormData();
    form.set("file", new Blob([await readFile(join(dir, file))]), file);
    form.set("orgId", orgId);
    form.set("projectId", projectId);
    form.set("kind", "menu_source");
    const upload = await call<{ id: string }>(token, "/uploads", { method: "POST", body: form });
    uploadIds.push(upload.id);
  }

  const started = Date.now();
  const result = await call<{ version: { document: { sections: { title: string; items: ActualItem[] }[] } } }>(token, "/extract", {
    method: "POST",
    body: JSON.stringify(uploadIds.length ? { projectId, uploadIds } : { projectId, text }),
  });
  return score(name, expected, result.version.document, Date.now() - started);
}

const { values } = parseArgs({ options: { case: { type: "string" }, report: { type: "string" } }, allowPositionals: false });

const entries = await readdir(FIXTURES, { withFileTypes: true }).catch(() => []);
const cases = entries.filter((e) => e.isDirectory() && (!values.case || e.name === values.case)).map((e) => join(FIXTURES, e.name));
if (!cases.length) {
  process.stdout.write(`No fixtures in ${FIXTURES}. See evals/fixtures/README.md for the layout.\n`);
  process.exit(0);
}

const token = await signIn();
const me = await call<{ venues: { id: string; orgId: string }[] }>(token, "/me");
const venue = me.venues[0];
if (!venue) throw new Error("No venue on the eval account. Run pnpm db:seed.");

const results: CaseResult[] = [];
for (const dir of cases) {
  const name = basename(dir);
  process.stdout.write(`· ${name} … `);
  try {
    const result = await runCase(token, venue.id, venue.orgId, dir, name);
    results.push(result);
    process.stdout.write(`${(result.itemRecall * 100).toFixed(1)}% recall, ${(result.priceAccuracy * 100).toFixed(1)}% prices, ${(result.elapsedMs / 1000).toFixed(1)}s\n`);
  } catch (error) {
    process.stdout.write(`failed: ${(error as Error).message}\n`);
  }
}

const mean = (pick: (r: CaseResult) => number) => (results.length ? results.reduce((total, r) => total + pick(r), 0) / results.length : 0);
const summary = {
  cases: results.length,
  itemRecall: mean((r) => r.itemRecall),
  inventedItems: results.reduce((total, r) => total + r.inventedItems, 0),
  priceAccuracy: mean((r) => r.priceAccuracy),
  falseInferenceRate: mean((r) => r.falseInferenceRate),
  sectionRecall: mean((r) => r.sectionRecall),
};

process.stdout.write("\n");
process.stdout.write(`item recall          ${(summary.itemRecall * 100).toFixed(1)}%  (threshold ${THRESHOLDS.itemRecall * 100}%)\n`);
process.stdout.write(`invented items       ${summary.inventedItems}  (threshold ${THRESHOLDS.inventedItems})\n`);
process.stdout.write(`price accuracy       ${(summary.priceAccuracy * 100).toFixed(1)}%  (threshold ${THRESHOLDS.priceAccuracy * 100}%)\n`);
process.stdout.write(`false inference rate ${(summary.falseInferenceRate * 100).toFixed(1)}%  (threshold ${THRESHOLDS.falseInferenceRate * 100}%)\n`);
process.stdout.write(`section recall       ${(summary.sectionRecall * 100).toFixed(1)}%  (threshold ${THRESHOLDS.sectionRecall * 100}%)\n`);

for (const result of results) {
  if (result.missing.length) process.stdout.write(`\n${result.name} missed: ${result.missing.join(", ")}\n`);
  for (const price of result.wrongPrices) process.stdout.write(`${result.name} price ${price.item}: expected ${price.expected}, got ${price.actual}\n`);
  for (const inference of result.falseInferences) process.stdout.write(`${result.name} false inference ${inference.item}.${inference.field}\n`);
}

if (values.report) await writeFile(values.report, JSON.stringify({ summary, results }, null, 2));

const failed =
  summary.itemRecall < THRESHOLDS.itemRecall ||
  summary.inventedItems > THRESHOLDS.inventedItems ||
  summary.priceAccuracy < THRESHOLDS.priceAccuracy ||
  summary.falseInferenceRate > THRESHOLDS.falseInferenceRate ||
  summary.sectionRecall < THRESHOLDS.sectionRecall;
process.exit(failed ? 1 : 0);
