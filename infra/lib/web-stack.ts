import { CfnOutput, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import type { Construct } from "constructs";
import type { EnvironmentConfig } from "./config.ts";
import { StaticSite } from "./static-site.ts";

export interface WebStackProps extends StackProps {
  config: EnvironmentConfig;
  /** Origin the owner app is allowed to call, e.g. https://api.menustudio.app. */
  apiOrigin: string;
}

/** The owner app: a hashed Vite bundle synced to S3 by CI and served through CloudFront. */
export class WebStack extends Stack {
  readonly site: StaticSite;

  constructor(scope: Construct, id: string, props: WebStackProps) {
    super(scope, id, props);
    const { config } = props;

    this.site = new StaticSite(this, "Site", {
      spa: true,
      directoryIndex: false,
      // Tailwind and Radix inject style elements at runtime, so styles need 'unsafe-inline'.
      // Scripts do not: the bundle is hashed files only.
      contentSecurityPolicy: [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "font-src 'self'",
        "img-src 'self' data: blob:",
        `connect-src 'self' ${props.apiOrigin} https://*.ingest.sentry.io https://*.ingest.de.sentry.io`,
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
      ].join("; "),
      removalPolicy: config.name === "production" ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      ...(config.domain ? { domain: { zoneName: config.domain.zoneName, host: config.domain.webHost, certificateArn: config.domain.cloudfrontCertificateArn } } : {}),
    });

    new CfnOutput(this, "WebBucketName", { value: this.site.bucket.bucketName, description: "CI syncs apps/web/dist here" });
    new CfnOutput(this, "WebDistributionId", { value: this.site.distribution.distributionId });
    new CfnOutput(this, "WebUrl", { value: config.domain ? `https://${config.domain.webHost}` : `https://${this.site.distribution.distributionDomainName}` });
  }
}
