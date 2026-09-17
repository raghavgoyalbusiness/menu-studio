import { Duration, RemovalPolicy } from "aws-cdk-lib";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as targets from "aws-cdk-lib/aws-route53-targets";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";

export interface StaticSiteProps {
  /** Single-page app: 403/404 are rewritten to /index.html so client routing works. */
  spa: boolean;
  /** Rewrites /path and /path/ to /path/index.html. Needed for pre-rendered directories on S3. */
  directoryIndex: boolean;
  contentSecurityPolicy: string;
  domain?: { zoneName: string; host: string; certificateArn: string };
  removalPolicy: RemovalPolicy;
}

/**
 * A private S3 bucket behind CloudFront with origin access control. Nothing is uploaded at synth
 * time: CI syncs the owner app, and the worker writes published menus straight to the bucket.
 */
export class StaticSite extends Construct {
  readonly bucket: s3.Bucket;
  readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: StaticSiteProps) {
    super(scope, id);

    this.bucket = new s3.Bucket(this, "Bucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: props.removalPolicy,
      autoDeleteObjects: props.removalPolicy === RemovalPolicy.DESTROY,
      versioned: true,
      lifecycleRules: [{ noncurrentVersionExpiration: Duration.days(30) }],
    });

    const securityHeaders = new cloudfront.ResponseHeadersPolicy(this, "SecurityHeaders", {
      securityHeadersBehavior: {
        contentSecurityPolicy: { contentSecurityPolicy: props.contentSecurityPolicy, override: true },
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
        referrerPolicy: { referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN, override: true },
        strictTransportSecurity: { accessControlMaxAge: Duration.days(365), includeSubdomains: true, override: true },
      },
    });

    // The origin sets Cache-Control (5 s s-maxage for HTML, a year for hashed assets), so the
    // cache policy only has to stay out of the way. A publish goes live without an invalidation.
    const cachePolicy = new cloudfront.CachePolicy(this, "CachePolicy", {
      minTtl: Duration.seconds(0),
      defaultTtl: Duration.seconds(5),
      maxTtl: Duration.days(365),
      enableAcceptEncodingBrotli: true,
      enableAcceptEncodingGzip: true,
    });

    const functionAssociations: cloudfront.FunctionAssociation[] = [];
    if (props.directoryIndex) {
      const rewrite = new cloudfront.Function(this, "DirectoryIndex", {
        runtime: cloudfront.FunctionRuntime.JS_2_0,
        comment: "Map /slug and /slug/ to the pre-rendered /slug/index.html",
        code: cloudfront.FunctionCode.fromInline(
          [
            "function handler(event) {",
            "  var request = event.request;",
            "  var uri = request.uri;",
            "  if (uri.endsWith('/')) request.uri = uri + 'index.html';",
            "  else if (!uri.split('/').pop().includes('.')) request.uri = uri + '/index.html';",
            "  return request;",
            "}",
          ].join("\n"),
        ),
      });
      functionAssociations.push({ function: rewrite, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST });
    }

    const certificate = props.domain ? acm.Certificate.fromCertificateArn(this, "Certificate", props.domain.certificateArn) : undefined;

    this.distribution = new cloudfront.Distribution(this, "Distribution", {
      defaultRootObject: "index.html",
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachePolicy,
        responseHeadersPolicy: securityHeaders,
        compress: true,
        functionAssociations,
      },
      errorResponses: props.spa
        ? [
            { httpStatus: 403, responseHttpStatus: 200, responsePagePath: "/index.html", ttl: Duration.minutes(5) },
            { httpStatus: 404, responseHttpStatus: 200, responsePagePath: "/index.html", ttl: Duration.minutes(5) },
          ]
        : [{ httpStatus: 404, responseHttpStatus: 404, responsePagePath: "/404.html", ttl: Duration.minutes(5) }],
      ...(certificate && props.domain ? { certificate, domainNames: [props.domain.host] } : {}),
    });

    if (props.domain) {
      const zone = route53.HostedZone.fromLookup(this, "Zone", { domainName: props.domain.zoneName });
      new route53.ARecord(this, "AliasRecord", {
        zone,
        recordName: props.domain.host,
        target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(this.distribution)),
      });
    }
  }
}
