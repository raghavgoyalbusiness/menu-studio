import { CloudFrontClient, CreateInvalidationCommand } from "@aws-sdk/client-cloudfront";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";

export interface PublishFile {
  key: string;
  body: string | Uint8Array;
  contentType: string;
  cacheControl: string;
}

/** Where pre-rendered QR menus are written. The static server or CDN serves them as files. */
export interface PublishTarget {
  write(files: PublishFile[]): Promise<void>;
}

/** Cache policy: HTML revalidates quickly so publishes go live within seconds without CDN invalidations. */
export const CACHE = {
  html: "public, max-age=0, s-maxage=5, stale-while-revalidate=30",
  immutable: "public, max-age=31536000, immutable",
  json: "public, max-age=0, s-maxage=5, stale-while-revalidate=30",
} as const;

export class LocalPublishTarget implements PublishTarget {
  private readonly dir: string;
  constructor(dir: string) {
    this.dir = dir;
  }
  async write(files: PublishFile[]): Promise<void> {
    for (const file of files) {
      const key = normalize(file.key);
      if (key.startsWith("..") || key.startsWith("/")) throw new Error(`Unsafe publish key ${file.key}`);
      const path = join(this.dir, key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, file.body);
      await writeFile(`${path}.headers.json`, JSON.stringify({ "content-type": file.contentType, "cache-control": file.cacheControl }));
    }
  }
}

export class S3PublishTarget implements PublishTarget {
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly distributionId: string | undefined;
  private readonly cloudfront: CloudFrontClient | undefined;

  constructor(options: { bucket: string; region: string; distributionId?: string }) {
    this.s3 = new S3Client({ region: options.region });
    this.bucket = options.bucket;
    this.distributionId = options.distributionId;
    this.cloudfront = options.distributionId ? new CloudFrontClient({ region: options.region }) : undefined;
  }

  async write(files: PublishFile[]): Promise<void> {
    for (const file of files) {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: file.key,
          Body: file.body,
          ContentType: file.contentType,
          CacheControl: file.cacheControl,
        }),
      );
    }
    // HTML uses a 5 s shared-cache TTL, so invalidation is a best-effort speed-up, not a requirement.
    if (this.cloudfront && this.distributionId) {
      const htmlPaths = files.filter((f) => f.contentType.startsWith("text/html")).map((f) => `/${f.key.replace(/index\.html$/, "")}`);
      if (htmlPaths.length) {
        await this.cloudfront
          .send(
            new CreateInvalidationCommand({
              DistributionId: this.distributionId,
              InvalidationBatch: { CallerReference: `publish-${Date.now()}`, Paths: { Quantity: htmlPaths.length, Items: htmlPaths } },
            }),
          )
          .catch(() => undefined);
      }
    }
  }
}
