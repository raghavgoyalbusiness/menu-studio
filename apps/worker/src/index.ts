import * as Sentry from "@sentry/node";
import {
  aggregateViews,
  BulkExportJob,
  createBoss,
  createDb,
  createLogger,
  createPublishTarget,
  createStorage,
  ExportJob,
  getHead,
  hardenPgBossSchema,
  insertExport,
  PublishJob,
  QUEUES,
  ServerEnv,
  waitForDatabase,
} from "@menu-studio/server-core";
import { PLANS } from "@menu-studio/shared";
import { createServer } from "node:http";
import { chromium, type Browser } from "playwright";
import { z } from "zod";
import { runExport } from "./jobs/export.ts";
import { runPublish } from "./jobs/publish.ts";

const env = z
  .intersection(
    ServerEnv,
    z.object({
      SENTRY_DSN_WORKER: z.string().optional(),
      EXPORT_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),
      WORKER_HEALTH_PORT: z.coerce.number().int().default(5324),
    }),
  )
  .parse(process.env);
const logger = createLogger("worker");
if (env.SENTRY_DSN_WORKER) Sentry.init({ dsn: env.SENTRY_DSN_WORKER, environment: env.NODE_ENV });

const db = createDb(env.DATABASE_URL);
await waitForDatabase(db);
const storage = createStorage(env);
const target = createPublishTarget(env);
const boss = await createBoss(env.DATABASE_URL, (error) => logger.error("pg-boss", { error }));
await hardenPgBossSchema(db.pool);

let browserPromise: Promise<Browser> | null = null;
function browser(): Promise<Browser> {
  browserPromise ??= chromium.launch({ args: ["--font-render-hinting=none", "--disable-dev-shm-usage"] }).then((b) => {
    b.on("disconnected", () => {
      browserPromise = null;
    });
    return b;
  });
  return browserPromise;
}

const exportDeps = { db, storage, browser, logger, webUrl: env.WEB_URL, printSecret: env.PRINT_TOKEN_SECRET };
const publishDeps = { db, storage, target, logger, apiUrl: env.API_URL, menuUrl: env.MENU_URL };

await boss.work(QUEUES.export, { localConcurrency: env.EXPORT_CONCURRENCY }, async ([job]) => {
  if (!job) return;
  const data = ExportJob.parse(job.data);
  await runExport({ ...exportDeps, logger: logger.child({ requestId: data.requestId, jobId: job.id }) }, data.exportId);
});

await boss.work(QUEUES.publish, async ([job]) => {
  if (!job) return;
  const data = PublishJob.parse(job.data);
  await runPublish({ ...publishDeps, logger: logger.child({ requestId: data.requestId, jobId: job.id }) }, data.publishedMenuId);
});

await boss.work(QUEUES.bulkExport, async ([job]) => {
  if (!job) return;
  const data = BulkExportJob.parse(job.data);
  const created = await db.asService(async (q) => {
    const { rows } = await q.query<{ plan: keyof typeof PLANS }>(`select plan from organizations where id = $1`, [data.orgId]);
    const watermarked = PLANS[rows[0]?.plan ?? "free"].watermark;
    const ids: string[] = [];
    for (const venueId of data.venueIds) {
      const { rows: projects } = await q.query<{ id: string }>(`select id from projects where venue_id = $1 and status <> 'archived' order by updated_at desc limit 1`, [venueId]);
      const projectId = projects[0]?.id;
      if (!projectId) continue;
      const head = await getHead(q, projectId);
      if (!head?.spec) continue;
      const row = await insertExport(q, { projectId, versionId: head.id, kind: data.kind, watermarked, createdBy: data.userId });
      ids.push(row.id);
    }
    return ids;
  });
  for (const exportId of created) await boss.send(QUEUES.export, { exportId, requestId: data.requestId });
  logger.info("bulk export queued", { orgId: data.orgId, exports: created.length });
});

await boss.work(QUEUES.aggregateAnalytics, async () => {
  const moved = await db.asService((q) => aggregateViews(q));
  logger.info("analytics aggregated", { rows: moved });
});
await boss.schedule(QUEUES.aggregateAnalytics, "15 3 * * *", {}, { tz: "UTC" });

// The worker has no public surface; this exists so ECS, and the e2e harness, can tell it is up.
const health = createServer((req, res) => {
  if (req.url !== "/health") {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true, concurrency: env.EXPORT_CONCURRENCY }));
});
health.listen(env.WORKER_HEALTH_PORT, "127.0.0.1");

logger.info("worker ready", { web: env.WEB_URL, publishTarget: env.PUBLISH_TARGET, concurrency: env.EXPORT_CONCURRENCY, healthPort: env.WORKER_HEALTH_PORT });

const shutdown = async () => {
  logger.info("shutting down");
  health.close();
  await boss.stop({ graceful: true, timeout: 30_000 }).catch(() => undefined);
  const b = await browserPromise?.catch(() => null);
  await b?.close().catch(() => undefined);
  await db.close().catch(() => undefined);
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
