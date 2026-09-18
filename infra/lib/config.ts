/** Per-environment deployment settings. Everything secret lives in Secrets Manager, never here. */

export const ENVIRONMENTS = ["staging", "production"] as const;
export type EnvironmentName = (typeof ENVIRONMENTS)[number];

export interface DomainConfig {
  /** Hosted zone that already exists in this account, e.g. menustudio.app. */
  zoneName: string;
  /** Owner app, e.g. app.menustudio.app. */
  webHost: string;
  /** Public QR menus, e.g. menu.menustudio.app. */
  menuHost: string;
  /** API, e.g. api.menustudio.app. */
  apiHost: string;
  /** ACM certificate in us-east-1 for the CloudFront distributions. */
  cloudfrontCertificateArn: string;
  /** ACM certificate in the app region for the API load balancer. */
  regionalCertificateArn: string;
}

export interface EnvironmentConfig {
  name: EnvironmentName;
  /** AWS account id. Left undefined in CI so `cdk synth` works without credentials. */
  account: string | undefined;
  region: string;
  /** Undefined until a hosted zone exists: distributions then keep their *.cloudfront.net names. */
  domain: DomainConfig | undefined;
  api: { cpu: number; memoryMiB: number; desiredCount: number; maxCount: number };
  /** The worker runs Chromium for PDF export, so it is memory-hungry and scales on queue depth, not CPU. */
  worker: { cpu: number; memoryMiB: number; desiredCount: number; maxCount: number };
  natGateways: number;
  /** Keep deleted menus and exports recoverable for this long. */
  logRetentionDays: number;
}

const DEFAULT_REGION = "eu-west-2";

function domainFromContext(value: unknown): DomainConfig | undefined {
  if (!value || typeof value !== "object") return undefined;
  const d = value as Partial<DomainConfig>;
  if (!d.zoneName || !d.webHost || !d.menuHost || !d.apiHost || !d.cloudfrontCertificateArn || !d.regionalCertificateArn) {
    throw new Error("domain context needs zoneName, webHost, menuHost, apiHost, cloudfrontCertificateArn and regionalCertificateArn");
  }
  return d as DomainConfig;
}

export function environmentConfig(name: EnvironmentName, context: (key: string) => unknown): EnvironmentConfig {
  const region = (context(`${name}:region`) as string | undefined) || DEFAULT_REGION;
  // An empty string is "no account" — CI synthesises environment-agnostic templates with no
  // credentials, and passing "" as an account makes CloudFormation lookups fail confusingly.
  const account = ((context(`${name}:account`) as string | undefined) || process.env.CDK_DEFAULT_ACCOUNT) || undefined;
  const domain = domainFromContext(context(`${name}:domain`));
  const production = name === "production";
  return {
    name,
    account,
    region,
    domain,
    api: production ? { cpu: 1024, memoryMiB: 2048, desiredCount: 2, maxCount: 8 } : { cpu: 512, memoryMiB: 1024, desiredCount: 1, maxCount: 2 },
    worker: production ? { cpu: 2048, memoryMiB: 4096, desiredCount: 2, maxCount: 10 } : { cpu: 1024, memoryMiB: 2048, desiredCount: 1, maxCount: 2 },
    natGateways: production ? 2 : 1,
    logRetentionDays: production ? 90 : 14,
  };
}

export function isEnvironmentName(value: string): value is EnvironmentName {
  return (ENVIRONMENTS as readonly string[]).includes(value);
}
