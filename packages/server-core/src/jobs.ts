import { PgBoss } from "pg-boss";
import { z } from "zod";

export const QUEUES = {
  export: "export",
  publish: "publish",
  bulkExport: "bulk_export",
  aggregateAnalytics: "aggregate_analytics",
} as const;
export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export const ExportJob = z.object({
  exportId: z.string().uuid(),
  requestId: z.string().optional(),
});
export type ExportJob = z.infer<typeof ExportJob>;

export const PublishJob = z.object({
  publishedMenuId: z.string().uuid(),
  requestId: z.string().optional(),
});
export type PublishJob = z.infer<typeof PublishJob>;

export const BulkExportJob = z.object({
  orgId: z.string().uuid(),
  userId: z.string().uuid(),
  venueIds: z.array(z.string().uuid()).min(1).max(200),
  kind: z.enum(["pdf", "pdf_crop_marks", "png", "print_pack"]),
  requestId: z.string().optional(),
});
export type BulkExportJob = z.infer<typeof BulkExportJob>;

export async function createBoss(connectionString: string, onError: (error: unknown) => void): Promise<PgBoss> {
  const boss = new PgBoss({ connectionString, schema: "pgboss" });
  boss.on("error", onError);
  await boss.start();
  for (const name of Object.values(QUEUES)) {
    try {
      await boss.createQueue(name, { retryLimit: name === QUEUES.aggregateAnalytics ? 0 : 2, retryDelay: 5, expireInSeconds: 600 });
    } catch {
      // Queue already exists.
    }
  }
  return boss;
}

export interface JobSender {
  send(queue: QueueName, data: object, options?: { priority?: number; singletonKey?: string }): Promise<string | null>;
}

export function bossSender(boss: PgBoss): JobSender {
  return {
    send: (queue, data, options) => boss.send(queue, data, { ...(options?.priority !== undefined ? { priority: options.priority } : {}), ...(options?.singletonKey ? { singletonKey: options.singletonKey } : {}) }),
  };
}
