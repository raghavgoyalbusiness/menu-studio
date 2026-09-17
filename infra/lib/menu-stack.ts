import { CfnOutput, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import type * as s3 from "aws-cdk-lib/aws-s3";
import type { Construct } from "constructs";
import type { EnvironmentConfig } from "./config.ts";
import { StaticSite } from "./static-site.ts";

export interface MenuStackProps extends StackProps {
  config: EnvironmentConfig;
}

/**
 * Public QR menus. The worker writes pre-rendered HTML, CSS, subsetted fonts and images straight
 * into this bucket; CloudFront serves them. HTML carries a 5 s s-maxage, so a publish is live in
 * seconds without an invalidation.
 */
export class MenuStack extends Stack {
  readonly site: StaticSite;
  readonly bucket: s3.IBucket;

  constructor(scope: Construct, id: string, props: MenuStackProps) {
    super(scope, id, props);
    const { config } = props;

    this.site = new StaticSite(this, "Site", {
      spa: false,
      directoryIndex: true,
      // The pre-rendered page inlines its font CSS, its JSON-LD and a JSON config blob, and the
      // CSP header is per-distribution, so per-page hashes are not an option. Owner text is always
      // rendered as text (no dangerouslySetInnerHTML anywhere) and injected JSON is escaped, so
      // the mitigation is at the source rather than in the header.
      contentSecurityPolicy: [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "font-src 'self'",
        "img-src 'self' data:",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
        "frame-ancestors 'none'",
      ].join("; "),
      removalPolicy: config.name === "production" ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      ...(config.domain ? { domain: { zoneName: config.domain.zoneName, host: config.domain.menuHost, certificateArn: config.domain.cloudfrontCertificateArn } } : {}),
    });
    this.bucket = this.site.bucket;

    new CfnOutput(this, "MenuBucketName", { value: this.site.bucket.bucketName, description: "S3_MENU_BUCKET for the worker" });
    new CfnOutput(this, "MenuDistributionId", { value: this.site.distribution.distributionId, description: "CLOUDFRONT_MENU_DISTRIBUTION_ID for the worker" });
    new CfnOutput(this, "MenuUrl", { value: config.domain ? `https://${config.domain.menuHost}` : `https://${this.site.distribution.distributionDomainName}` });
  }
}
