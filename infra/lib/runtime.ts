import * as ecs from "aws-cdk-lib/aws-ecs";
import * as logs from "aws-cdk-lib/aws-logs";
import type * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";

/** Environment shared by the API and the worker. Only non-secret values belong here. */
export function sharedRuntimeEnvironment(input: {
  region: string;
  webUrl: string;
  menuUrl: string;
  apiUrl: string;
  menuBucket: string;
  menuDistributionId: string;
}): Record<string, string> {
  return {
    NODE_ENV: "production",
    AUTH_MODE: "supabase",
    STORAGE_MODE: "supabase",
    PUBLISH_TARGET: "s3",
    WEB_URL: input.webUrl,
    MENU_URL: input.menuUrl,
    API_URL: input.apiUrl,
    S3_MENU_BUCKET: input.menuBucket,
    CLOUDFRONT_MENU_DISTRIBUTION_ID: input.menuDistributionId,
    AWS_REGION: input.region,
  };
}

/** Inject one Secrets Manager JSON field per environment variable, so nothing lands in the task definition. */
export function runtimeSecrets(secret: secretsmanager.ISecret, fields: string[]): Record<string, ecs.Secret> {
  return Object.fromEntries(fields.map((field) => [field, ecs.Secret.fromSecretsManager(secret, field)]));
}

const RETENTIONS: Record<number, logs.RetentionDays> = {
  14: logs.RetentionDays.TWO_WEEKS,
  30: logs.RetentionDays.ONE_MONTH,
  90: logs.RetentionDays.THREE_MONTHS,
};

export function logRetention(days: number): logs.RetentionDays {
  const retention = RETENTIONS[days];
  if (!retention) throw new Error(`No CloudWatch retention for ${days} days`);
  return retention;
}
