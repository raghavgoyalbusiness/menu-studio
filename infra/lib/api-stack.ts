import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as logs from "aws-cdk-lib/aws-logs";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as targets from "aws-cdk-lib/aws-route53-targets";
import type * as s3 from "aws-cdk-lib/aws-s3";
import type * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import type { Construct } from "constructs";
import type { EnvironmentConfig } from "./config.ts";
import { logRetention, runtimeSecrets, sharedRuntimeEnvironment } from "./runtime.ts";

export interface ApiStackProps extends StackProps {
  config: EnvironmentConfig;
  appSecret: secretsmanager.ISecret;
  menuBucket: s3.IBucket;
  menuDistributionId: string;
  webUrl: string;
  menuUrl: string;
}

/** The Hono API on Fargate behind an application load balancer. */
export class ApiStack extends Stack {
  readonly vpc: ec2.Vpc;
  readonly cluster: ecs.Cluster;
  readonly repository: ecr.Repository;
  readonly service: ecs.FargateService;
  readonly url: string;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);
    const { config } = props;
    const imageTag = (this.node.tryGetContext("imageTag") as string | undefined) ?? "latest";

    this.vpc = new ec2.Vpc(this, "Vpc", { maxAzs: 2, natGateways: config.natGateways });
    this.cluster = new ecs.Cluster(this, "Cluster", { vpc: this.vpc, containerInsightsV2: ecs.ContainerInsights.ENABLED });

    this.repository = new ecr.Repository(this, "Repository", {
      repositoryName: `menu-studio-${config.name}-api`,
      imageScanOnPush: true,
      lifecycleRules: [{ maxImageCount: 20 }],
      removalPolicy: config.name === "production" ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      emptyOnDelete: config.name !== "production",
    });

    const apiUrl = config.domain ? `https://${config.domain.apiHost}` : "";

    const taskDefinition = new ecs.FargateTaskDefinition(this, "TaskDefinition", { cpu: config.api.cpu, memoryLimitMiB: config.api.memoryMiB });
    taskDefinition.addContainer("api", {
      image: ecs.ContainerImage.fromEcrRepository(this.repository, imageTag),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: "api",
        logGroup: new logs.LogGroup(this, "LogGroup", { retention: logRetention(config.logRetentionDays), removalPolicy: RemovalPolicy.DESTROY }),
      }),
      environment: {
        ...sharedRuntimeEnvironment({
          region: config.region,
          webUrl: props.webUrl,
          menuUrl: props.menuUrl,
          apiUrl: apiUrl || props.webUrl,
          menuBucket: props.menuBucket.bucketName,
          menuDistributionId: props.menuDistributionId,
        }),
        PORT: "5323",
        CORS_ORIGINS: [props.webUrl, props.menuUrl].join(","),
      },
      secrets: runtimeSecrets(props.appSecret, ["DATABASE_URL", "SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "PRINT_TOKEN_SECRET", "ANTHROPIC_API_KEY", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET", "SENTRY_DSN_API"]),
      portMappings: [{ containerPort: 5323 }],
      healthCheck: {
        command: ["CMD-SHELL", "node -e \"fetch('http://127.0.0.1:5323/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""],
        interval: Duration.seconds(30),
        retries: 3,
        startPeriod: Duration.seconds(30),
      },
    });
    // Uploads and exports live in Supabase Storage; the API only needs the menu bucket for reads.
    props.menuBucket.grantRead(taskDefinition.taskRole);

    this.service = new ecs.FargateService(this, "Service", {
      cluster: this.cluster,
      taskDefinition,
      desiredCount: config.api.desiredCount,
      circuitBreaker: { rollback: true },
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
    });
    this.service.autoScaleTaskCount({ minCapacity: config.api.desiredCount, maxCapacity: config.api.maxCount }).scaleOnCpuUtilization("Cpu", {
      targetUtilizationPercent: 60,
      scaleInCooldown: Duration.minutes(5),
      scaleOutCooldown: Duration.minutes(1),
    });

    const loadBalancer = new elbv2.ApplicationLoadBalancer(this, "LoadBalancer", { vpc: this.vpc, internetFacing: true });
    const certificate = config.domain ? acm.Certificate.fromCertificateArn(this, "Certificate", config.domain.regionalCertificateArn) : undefined;
    const listener = loadBalancer.addListener("Listener", {
      port: certificate ? 443 : 80,
      protocol: certificate ? elbv2.ApplicationProtocol.HTTPS : elbv2.ApplicationProtocol.HTTP,
      ...(certificate ? { certificates: [certificate] } : {}),
      open: true,
    });
    listener.addTargets("ApiTargets", {
      port: 5323,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [this.service],
      deregistrationDelay: Duration.seconds(30),
      healthCheck: { path: "/health", interval: Duration.seconds(15), healthyThresholdCount: 2, unhealthyThresholdCount: 3 },
    });
    if (certificate) {
      loadBalancer.addListener("HttpRedirect", { port: 80, protocol: elbv2.ApplicationProtocol.HTTP, defaultAction: elbv2.ListenerAction.redirect({ protocol: "HTTPS", port: "443", permanent: true }) });
    }

    if (config.domain) {
      const zone = route53.HostedZone.fromLookup(this, "Zone", { domainName: config.domain.zoneName });
      new route53.ARecord(this, "AliasRecord", { zone, recordName: config.domain.apiHost, target: route53.RecordTarget.fromAlias(new targets.LoadBalancerTarget(loadBalancer)) });
    }

    this.url = apiUrl || `http://${loadBalancer.loadBalancerDnsName}`;
    new CfnOutput(this, "ApiUrl", { value: this.url });
    new CfnOutput(this, "ApiRepositoryUri", { value: this.repository.repositoryUri });
    new CfnOutput(this, "ApiServiceName", { value: this.service.serviceName });
    new CfnOutput(this, "ApiClusterName", { value: this.cluster.clusterName });
  }
}
