import { signPrintToken, buildDefaultSpec, type ConceptsResponse, type EditResponse, type DraftResponse,
  type ExtractResponse, type OrgDto, type ProjectDetailDto, type UploadDto, type VenueDto, type VersionDto } from "@menu-studio/shared";
import { connectTestDb } from "@menu-studio/server-core/testing";
import type { Db } from "@menu-studio/server-core";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildTestApp, SECRET, specToWire } from "./helpers.ts";

let db: Db;
let t: Awaited<ReturnType<typeof buildTestApp>>;
let token: string;
let org: OrgDto;
let venue: VenueDto;
let project: ProjectDetailDto;

const draftItem = (name: string, description: string | null = null) => ({
  name,
  description,
  ingredients: [] as string[],
  dietaryTags: [] as string[],
  allergens: [] as string[],
  attributes: { baseSpirit: null, glassware: null, colorHex: null, abvTier: null, flavor: null, servingTemp: null, caffeine: null },
});

const draftWire = {
  venueType: "bar",
  primaryLanguage: "en",
  sections: [
    {
      title: "Small plates",
      subtitle: "To share",
      items: [draftItem("Padrón peppers", "Blistered, sea salt"), draftItem("Whipped cod roe", "Smoked roe, sourdough")],
    },
  ],
  notes: ["Decide whether you want a cheese board; it needs a supplier."],
};

const extractWire = {
  venueName: "Corner Cafe",
  venueType: "cafe",
  currency: "GBP",
  primaryLanguage: "en",
  taxNote: null,
  footerNotes: ["Open daily 8–5"],
  sections: [
    {
      title: "Coffee",
      subtitle: null,
      description: null,
      availability: null,
      items: [
        {
          name: "Flat White",
          description: "Double ristretto",
          priceText: "£3.40",
          priceMinor: 3400, // wrong on purpose: the printed text wins and the price is flagged
          priceVariants: [],
          ingredients: [],
          dietaryTags: ["veg"],
          allergens: ["milk"],
          attributes: { baseSpirit: null, glassware: "coffee_cup", colorHex: "#C8A27A", abvTier: null, flavor: null, servingTemp: "hot", caffeine: "high" },
          featured: false,
          isNew: false,
          isSignature: false,
          inferredFields: ["dietaryTags", "allergens", "attributes.glassware"],
          unreadable: false,
        },
        {
          name: "Banana Bread",
          description: null,
          priceText: null,
          priceMinor: null,
          priceVariants: [],
          ingredients: [],
          dietaryTags: [],
          allergens: [],
          attributes: { baseSpirit: null, glassware: null, colorHex: null, abvTier: null, flavor: null, servingTemp: null, caffeine: null },
          featured: false,
          isNew: false,
          isSignature: false,
          inferredFields: [],
          unreadable: false,
        },
      ],
    },
  ],
  notes: [],
};

beforeAll(async () => {
  db = connectTestDb(inject("databaseUrl"));
  t = await buildTestApp(db);
  token = await t.signIn(`owner-${Date.now()}@cafe.test`);
  org = (await t.request("POST", "/orgs", { token, body: { name: "Corner Group", type: "venue", country: "GB" } })).json;
  venue = (await t.request("POST", "/venues", { token, body: { orgId: org.id, name: "Corner Cafe", venueType: "cafe", city: "London", country: "GB" } })).json;
  project = (await t.request("POST", "/projects", { token, body: { venueId: venue.id, name: "Bistro", start: { kind: "seed", seedId: "bistro-paris" } } })).json;
});

afterAll(async () => {
  await db.close();
});

describe("auth and onboarding", () => {
  it("rejects requests without a session", async () => {
    expect((await t.request("GET", "/me")).status).toBe(401);
    expect((await t.request("GET", "/me", { token: "nope" })).status).toBe(401);
  });

  it("signs in with a local magic link and lists memberships", async () => {
    const me = await t.request("GET", "/me", { token });
    expect(me.status).toBe(200);
    expect((me.json as { orgs: OrgDto[] }).orgs.map((o) => o.name)).toContain("Corner Group");
  });

  it("derives currency, locale, timezone and a slug from the country", () => {
    expect(venue).toMatchObject({ currency: "GBP", locale: "en-GB", timezone: "Europe/London", slug: "corner-cafe-london" });
  });

  it("enforces the free plan's venue limit", async () => {
    const res = await t.request("POST", "/venues", { token, body: { orgId: org.id, name: "Second", venueType: "bar", city: null, country: "GB" } });
    expect(res.status).toBe(402);
    expect(res.json).toMatchObject({ error: { code: "plan_limit", upgradeTo: "multi_venue" } });
  });

  it("hides other organizations' projects", async () => {
    const stranger = await t.signIn(`stranger-${Date.now()}@elsewhere.test`);
    expect((await t.request("GET", `/projects/${project.project.id}`, { token: stranger })).status).toBe(404);
  });
});

describe("versions: edit, undo, restore, per-edit revert", () => {
  it("saves an inline edit as a new version and rejects stale bases", async () => {
    const head = project.head as VersionDto;
    const edit = { target: "document", ops: [{ op: "replace", path: "/sections/1/items/0/name", value: "Soupe du Jour" }] };
    const saved = await t.request("POST", `/projects/${project.project.id}/versions`, { token, body: { baseVersionId: head.id, edits: [edit] } });
    expect(saved.status).toBe(201);
    const v2 = saved.json as VersionDto;
    expect(v2.seq).toBe(2);
    expect(v2.document.sections[1]?.items[0]?.name).toBe("Soupe du Jour");
    expect(v2.spec).toEqual(head.spec);

    const stale = await t.request("POST", `/projects/${project.project.id}/versions`, { token, body: { baseVersionId: head.id, edits: [edit] } });
    expect(stale.status).toBe(409);

    const undo = await t.request("POST", `/projects/${project.project.id}/head`, { token, body: { versionId: head.id } });
    expect((undo.json as VersionDto).document.sections[1]?.items[0]?.name).toBe("Soupe à l'Oignon Gratinée");
    const redo = await t.request("POST", `/projects/${project.project.id}/head`, { token, body: { versionId: v2.id } });
    expect((redo.json as VersionDto).seq).toBe(2);

    const restored = await t.request("POST", `/projects/${project.project.id}/restore`, { token, body: { versionId: head.id, baseVersionId: v2.id } });
    expect(restored.status).toBe(201);
    expect((restored.json as VersionDto).source).toBe("restore");
  });

  it("rejects invalid edits with readable issues", async () => {
    const detail = (await t.request("GET", `/projects/${project.project.id}`, { token })).json as ProjectDetailDto;
    const res = await t.request("POST", `/projects/${project.project.id}/versions`, {
      token,
      body: { baseVersionId: detail.head?.id, edits: [{ target: "spec", ops: [{ op: "replace", path: "/tokens/paletteId", value: "neon" }] }] },
    });
    expect(res.status).toBe(422);
    expect((res.json as { error: { issues: string[] } }).error.issues.join(" ")).toMatch(/paletteId/);
  });

  it("undoes one earlier edit on top of later ones", async () => {
    let detail = (await t.request("GET", `/projects/${project.project.id}`, { token })).json as ProjectDetailDto;
    const paletteEdit = await t.request("POST", `/projects/${project.project.id}/versions`, {
      token,
      body: { baseVersionId: detail.head?.id, edits: [{ target: "spec", ops: [{ op: "replace", path: "/tokens/paletteId", value: "deco-noir" }] }] },
    });
    const paletteVersion = paletteEdit.json as VersionDto;
    const densityEdit = await t.request("POST", `/projects/${project.project.id}/versions`, {
      token,
      body: { baseVersionId: paletteVersion.id, edits: [{ target: "spec", ops: [{ op: "replace", path: "/tokens/density", value: "airy" }] }] },
    });
    detail = (await t.request("GET", `/projects/${project.project.id}`, { token })).json as ProjectDetailDto;
    const revert = await t.request("POST", `/projects/${project.project.id}/versions/${paletteVersion.id}/revert`, { token, body: { baseVersionId: (densityEdit.json as VersionDto).id } });
    expect(revert.status).toBe(201);
    const reverted = revert.json as VersionDto;
    expect(reverted.spec?.tokens.paletteId).toBe("bistro-cream");
    expect(reverted.spec?.tokens.density).toBe("airy");
    expect(detail.head?.id).toBe((densityEdit.json as VersionDto).id);
  });
});

describe("AI endpoints with a scripted model", () => {
  let importProject: ProjectDetailDto;

  beforeAll(async () => {
    importProject = (await t.request("POST", "/projects", { token, body: { venueId: venue.id, name: "Imported", start: { kind: "import" } } })).json;
  });

  it("extracts pasted text, retries once on invalid output, verifies prices and meters usage", async () => {
    t.ai.push("not json at all", extractWire);
    const res = await t.request("POST", "/extract", { token, body: { projectId: importProject.project.id, text: "Coffee\nFlat White £3.40\nDouble ristretto\nBanana Bread" } });
    expect(res.status).toBe(201);
    const body = res.json as ExtractResponse;
    const coffee = body.version.document.sections[0];
    expect(coffee?.items[0]).toMatchObject({ name: "Flat White", price: 340 });
    expect(coffee?.items[0]?.inferredFields).toContain("price");
    expect(coffee?.items[0]?.id).toMatch(/^itm_[a-z0-9]{8}$/);
    expect(body.warnings.map((w) => w.code)).toContain("missing_price");
    expect(t.ai.calls.at(-1)?.messages.at(-1)?.content).toEqual([expect.objectContaining({ text: expect.stringContaining("did not pass validation") })]);

    const usage = await db.asService((q) => q.query<{ attempt: number; status: string; prompt_version: string; cost_usd_micros: string }>(`select attempt, status, prompt_version, cost_usd_micros from ai_usage where project_id = $1 order by attempt`, [importProject.project.id]));
    expect(usage.rows.map((r) => [r.attempt, r.status, r.prompt_version])).toEqual([
      [1, "failed", "extract@1"],
      [2, "succeeded", "extract@1"],
    ]);
    expect(Number(usage.rows[1]?.cost_usd_micros)).toBeGreaterThan(0);
  });

it("drafts a menu from a description, with nothing priced and everything marked as a guess", async () => {
    t.ai.push(draftWire);
    const res = await t.request("POST", "/draft", {
      token,
      body: { projectId: importProject.project.id, description: "A small natural wine bar in Peckham. Snacky Mediterranean plates, about eight of them, lots of veg." },
    });
    expect(res.status).toBe(201);
    const body = res.json as DraftResponse;
    const items = body.version.document.sections.flatMap((s) => s.items);
    expect(items.map((i) => i.name)).toEqual(["Padrón peppers", "Whipped cod roe"]);

    // The two rules that make this endpoint safe.
    expect(items.every((i) => i.price === null)).toBe(true);
    expect(items.every((i) => i.inferredFields.includes("name") && i.inferredFields.includes("description"))).toBe(true);

    expect(body.warnings.filter((w) => w.code === "missing_price")).toHaveLength(2);
    expect(body.notes[0]).toContain("cheese board");
    expect(t.ai.calls.at(-1)?.messages.at(-1)?.content).toEqual([expect.objectContaining({ text: expect.stringContaining("natural wine bar in Peckham") })]);
  });

  it("refuses a price the model tried to smuggle into the text", async () => {
    const priced = structuredClone(draftWire);
    priced.sections[0]!.items[0]!.name = "Padrón peppers £7";
    priced.sections[0]!.items[1]!.description = "Smoked roe, sourdough — 9.50";
    t.ai.push(priced, priced);
    const res = await t.request("POST", "/draft", { token, body: { projectId: importProject.project.id, description: "A small natural wine bar in Peckham with snacky plates." } });
    expect(res.status).toBe(422);
    expect(res.json).toMatchObject({ error: { code: "ai_invalid_output" } });
    // The retry has to tell the model what it did wrong.
    expect(t.ai.calls.at(-1)?.messages.at(-1)?.content).toEqual([expect.objectContaining({ text: expect.stringContaining("a price appears in the name") })]);
  });

  it("asks for more detail instead of inventing a menu from nothing", async () => {
    t.ai.push({ venueType: "restaurant", primaryLanguage: "en", sections: [], notes: [] });
    const res = await t.request("POST", "/draft", { token, body: { projectId: importProject.project.id, description: "it is a place that serves things" } });
    expect(res.status).toBe(201);
    const body = res.json as DraftResponse;
    expect(body.version.document.sections).toHaveLength(0);
    expect(body.notes[0]).toContain("too general");
  });

  it("rejects a description too short to draft from", async () => {
    const res = await t.request("POST", "/draft", { token, body: { projectId: importProject.project.id, description: "a cafe" } });
    expect(res.status).toBe(400);
  });

  it("returns a typed, retryable error after two invalid responses", async () => {
    t.ai.push({ venueName: "x" }, "{}");
    const res = await t.request("POST", "/extract", { token, body: { projectId: importProject.project.id, text: "Tea £2" } });
    expect(res.status).toBe(422);
    expect(res.json).toMatchObject({ error: { code: "ai_invalid_output", retryable: true } });
  });

  it("generates three validated concepts and selects one", async () => {
    const detail = (await t.request("GET", `/projects/${project.project.id}`, { token })).json as ProjectDetailDto;
    const document = detail.head?.document;
    if (!document) throw new Error("no head");
    const specs = [
      buildDefaultSpec({ archetype: "classic_list", document, format: "A4", orientation: "portrait", tokens: { fontPairingId: "bistro-garamond", paletteId: "bistro-cream", density: "balanced" } }),
      buildDefaultSpec({ archetype: "two_column", document, format: "A4", orientation: "portrait", tokens: { fontPairingId: "editorial", paletteId: "washi", density: "airy" } }),
      buildDefaultSpec({ archetype: "classic_list", document, format: "A4", orientation: "portrait", tokens: { fontPairingId: "luxe-didone", paletteId: "deco-noir", density: "dense" } }),
    ];
    // First attempt repeats a concept's tokens; the distinctness rule must force a retry.
    const duplicate = [specToWire(specs[0] as never), specToWire(specs[1] as never), specToWire(specs[0] as never)];
    t.ai.push({ concepts: duplicate }, { concepts: specs.map((s) => specToWire(s)) });
    const res = await t.request("POST", "/concepts", { token, body: { projectId: project.project.id } });
    expect(res.status).toBe(201);
    const concepts = (res.json as ConceptsResponse).concepts;
    expect(concepts).toHaveLength(3);
    expect(t.ai.calls.at(-1)?.messages.at(-1)?.content).toEqual([expect.objectContaining({ text: expect.stringContaining("must differ") })]);

    const pick = concepts[1];
    const head = (await t.request("GET", `/projects/${project.project.id}`, { token })).json as ProjectDetailDto;
    const selected = await t.request("POST", `/projects/${project.project.id}/concepts/${pick?.id}/select`, { token, body: { baseVersionId: head.head?.id } });
    expect(selected.status).toBe(201);
    expect((selected.json as VersionDto)).toMatchObject({ source: "ai_concept", spec: { archetype: "two_column" } });
  });

  it("applies a chat edit as JSON Patch and refuses unrequested price changes", async () => {
    const head = ((await t.request("GET", `/projects/${project.project.id}`, { token })).json as ProjectDetailDto).head as VersionDto;
    const dessertsIndex = head.document.sections.findIndex((s) => s.title === "Desserts");
    const dessertsId = head.document.sections[dessertsIndex]?.id;
    const pageIndex = head.spec?.pages.findIndex((p) => p.blocks.some((b) => b.sectionRef === dessertsId)) ?? -1;
    const blockIndex = head.spec?.pages[pageIndex]?.blocks.findIndex((b) => b.sectionRef === dessertsId) ?? -1;
    const blockId = head.spec?.pages[pageIndex]?.blocks[blockIndex]?.id;
    const sneaky = {
      summary: "Made desserts prominent.",
      clarifyingQuestion: null,
      unsupported: null,
      patches: [{ target: "document", ops: [{ op: "replace", path: `/sections/${dessertsIndex}/items/0/price`, from: null, valueJson: "1" }] }],
    };
    const good = {
      summary: "Made the desserts section more prominent.",
      clarifyingQuestion: null,
      unsupported: null,
      patches: [
        {
          target: "spec",
          ops: [
            { op: "test", path: `/pages/${pageIndex}/blocks/${blockIndex}/id`, from: null, valueJson: JSON.stringify(blockId) },
            { op: "replace", path: `/pages/${pageIndex}/blocks/${blockIndex}/emphasis`, from: null, valueJson: '"high"' },
          ],
        },
      ],
    };
    t.ai.push(sneaky, good);
    const res = await t.request("POST", "/edit", { token, body: { projectId: project.project.id, versionId: head.id, instruction: "make the desserts section more prominent" } });
    expect(res.status).toBe(200);
    const body = res.json as Extract<EditResponse, { kind: "applied" }>;
    expect(body.kind).toBe("applied");
    expect(body.version.source).toBe("ai_edit");
    expect(body.version.spec?.pages[pageIndex]?.blocks[blockIndex]?.emphasis).toBe("high");
    expect(body.version.document.sections[dessertsIndex]?.items[0]?.price).toBe(head.document.sections[dessertsIndex]?.items[0]?.price);
    expect(t.ai.calls.at(-1)?.messages.at(-1)?.content).toEqual([expect.objectContaining({ text: expect.stringContaining("did not ask to change prices") })]);
  });

  it("returns clarifying questions without saving", async () => {
    const head = ((await t.request("GET", `/projects/${project.project.id}`, { token })).json as ProjectDetailDto).head as VersionDto;
    t.ai.push({ summary: "", clarifyingQuestion: "Which section should move?", unsupported: null, patches: [] });
    const res = await t.request("POST", "/edit", { token, body: { projectId: project.project.id, versionId: head.id, instruction: "move it up" } });
    expect(res.json).toEqual({ kind: "clarify", question: "Which section should move?" });
    const after = ((await t.request("GET", `/projects/${project.project.id}`, { token })).json as ProjectDetailDto).head;
    expect(after?.id).toBe(head.id);
  });

  it("explains when AI is not configured", async () => {
    const withoutAi = await buildTestApp(db);
    withoutAi.deps.ai = null;
    const other = await withoutAi.signIn(`noai-${Date.now()}@test.test`);
    const res = await withoutAi.request("POST", "/concepts", { token: other, body: { projectId: project.project.id } });
    expect([404, 503]).toContain(res.status);
  });
});

describe("uploads", () => {
  it("normalizes images (EXIF stripped, JPEG) and rejects oversize PDFs", async () => {
    const png = await sharp({ create: { width: 3000, height: 1200, channels: 3, background: "#ffffff" } }).withMetadata({ exif: { IFD0: { Copyright: "secret" } } }).png().toBuffer();
    const form = new FormData();
    form.set("file", new File([new Uint8Array(png)], "menu.png", { type: "image/png" }));
    form.set("orgId", org.id);
    form.set("kind", "menu_source");
    const res = await t.request("POST", "/uploads", { token, form });
    expect(res.status).toBe(201);
    const upload = res.json as UploadDto;
    expect(upload.mime).toBe("image/jpeg");
    const stored = await t.deps.storage.get("uploads", new URL(upload.url).pathname.replace("/files/uploads/", ""));
    const meta = await sharp(Buffer.from(stored?.body ?? [])).metadata();
    expect(meta.width).toBe(2400);
    expect(meta.exif).toBeUndefined();

    const pdf = await PDFDocument.create();
    for (let i = 0; i < 11; i++) pdf.addPage();
    const pdfForm = new FormData();
    pdfForm.set("file", new File([new Uint8Array(await pdf.save())], "menu.pdf", { type: "application/pdf" }));
    pdfForm.set("orgId", org.id);
    pdfForm.set("kind", "menu_source");
    const rejected = await t.request("POST", "/uploads", { token, form: pdfForm });
    expect(rejected.status).toBe(400);
    expect(JSON.stringify(rejected.json)).toContain("up to 10 pages");
  });
});

describe("export, print data, publish, quick edit", () => {
  it("queues a watermarked export on the free plan and serves print data by token", async () => {
    const head = ((await t.request("GET", `/projects/${project.project.id}`, { token })).json as ProjectDetailDto).head as VersionDto;
    const res = await t.request("POST", `/projects/${project.project.id}/exports`, { token, body: { versionId: head.id, kind: "pdf" } });
    expect(res.status).toBe(202);
    expect(res.json).toMatchObject({ status: "queued", watermarked: true });
    expect(t.jobs.sent.at(-1)).toMatchObject({ queue: "export" });

    const printToken = await signPrintToken({ projectId: project.project.id, versionId: head.id, purpose: "print" }, SECRET);
    const data = await t.request("GET", `/print-data?token=${encodeURIComponent(printToken)}`);
    expect(data.status).toBe(200);
    expect(data.json).toMatchObject({ spec: { id: head.spec?.id }, timezone: "Europe/London" });
    expect((await t.request("GET", "/print-data?token=forged")).status).toBe(401);
  });

  it("requires Pro to publish, then publishes and quick-edits the live menu", async () => {
    const head = ((await t.request("GET", `/projects/${project.project.id}`, { token })).json as ProjectDetailDto).head as VersionDto;
    const blocked = await t.request("POST", `/projects/${project.project.id}/publish`, { token, body: { versionId: head.id } });
    expect(blocked.status).toBe(402);

    await db.asService((q) => q.query(`update organizations set plan = 'pro' where id = $1`, [org.id]));
    const published = await t.request("POST", `/projects/${project.project.id}/publish`, { token, body: { versionId: head.id, languages: ["en"] } });
    expect(published.status).toBe(202);
    expect(published.json).toMatchObject({ slug: "main", url: `http://menu.test/${venue.slug}` });

    const item = head.document.sections[2]?.items[0];
    const quick = await t.request("POST", `/projects/${project.project.id}/quick-edit`, {
      token,
      body: { baseVersionId: head.id, changes: [{ itemId: item?.id, price: 2750 }, { itemId: head.document.sections[2]?.items[1]?.id, available: false }] },
    });
    expect(quick.status).toBe(200);
    const body = quick.json as { version: VersionDto; republished: { versionId: string }[] };
    expect(body.version.document.sections[2]?.items[0]?.price).toBe(2750);
    expect(body.version.document.sections[2]?.items[1]?.available).toBe(false);
    expect(body.republished[0]?.versionId).toBe(body.version.id);
    expect(t.jobs.sent.filter((j) => j.queue === "publish").length).toBeGreaterThanOrEqual(2);
    await db.asService((q) => q.query(`update organizations set plan = 'free' where id = $1`, [org.id]));
  });

  it("records anonymous analytics beacons", async () => {
    const published = (await t.request("GET", `/projects/${project.project.id}/published`, { token })).json as { id: string }[];
    const id = published[0]?.id;
    expect((await t.request("POST", "/analytics/view", { body: JSON.stringify({ m: id, lang: "en", device: "mobile", ref: "qr" }) })).status).toBe(204);
    expect((await t.request("POST", "/analytics/item", { body: JSON.stringify({ m: id, item: "itm_cl000006" }) })).status).toBe(204);
    const analytics = await t.request("GET", `/published/${id}/analytics`, { token });
    expect(analytics.json).toMatchObject({ topItems: [{ itemId: "itm_cl000006", name: "Steak Frites", opens: 1 }] });
  });
});

describe("billing webhooks", () => {
  it("rejects bad signatures, grants credits once and activates plans", async () => {
    expect((await t.request("POST", "/webhooks/stripe", { body: "{}" })).status).toBe(400);

    t.billing.stripe.next = { id: `evt_${Date.now()}`, type: "checkout.session.completed", payload: {}, effect: { kind: "credits", orgId: org.id, exportCredits: 1 } };
    const headers = { "x-test-signature": "valid" };
    expect((await t.request("POST", "/webhooks/stripe", { body: "{}", headers })).status).toBe(200);
    expect((await t.request("POST", "/webhooks/stripe", { body: "{}", headers })).status).toBe(200);
    const credits = await db.asService((q) => q.query<{ export_credits: number }>(`select export_credits from credits where org_id = $1`, [org.id]));
    expect(credits.rows[0]?.export_credits).toBe(1);

    t.billing.stripe.next = {
      id: `evt_sub_${Date.now()}`,
      type: "customer.subscription.updated",
      payload: {},
      effect: { kind: "subscription", orgId: org.id, providerSubscriptionId: "sub_1", plan: "pro", status: "active", currentPeriodEnd: new Date("2026-10-17"), customerId: "cus_1" },
    };
    await t.request("POST", "/webhooks/stripe", { body: "{}", headers });
    const usage = await t.request("GET", `/orgs/${org.id}/usage`, { token });
    expect(usage.json).toMatchObject({ plan: "pro", exportCredits: 1, billingProvider: "stripe", billingCurrency: "GBP", subscription: { status: "active" } });
    await db.asService((q) => q.query(`update organizations set plan = 'free' where id = $1`, [org.id]));
  });

  it("creates checkouts through the provider for the org's country", async () => {
    const res = await t.request("POST", "/billing/checkout", { token, body: { orgId: org.id, plan: "pro" } });
    expect(res.json).toEqual({ url: "https://pay.example/stripe/pro" });
    expect(t.billing.stripe.checkouts.at(-1)).toMatchObject({ currency: "GBP", plan: "pro" });
  });
});

describe("engineering guard and account export", () => {
  it("rejects engineering edits that remove items", async () => {
    const head = ((await t.request("GET", `/projects/${project.project.id}`, { token })).json as ProjectDetailDto).head as VersionDto;
    const res = await t.request("POST", "/engineering/apply", {
      token,
      body: { projectId: project.project.id, baseVersionId: head.id, summary: "remove dog", edits: [{ target: "document", ops: [{ op: "remove", path: "/sections/3/items/0" }] }] },
    });
    expect(res.status).toBe(422);
  });

  it("exports the account's data", async () => {
    const res = await t.request("GET", "/account/export", { token });
    expect(res.status).toBe(200);
    expect((res.json as { projects: unknown[] }).projects.length).toBeGreaterThan(0);
  });
});
