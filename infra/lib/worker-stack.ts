import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import type * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import type * as s3 from "aws-cdk-lib/aws-s3";
import type * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import type { Construct } from "constructs";
import type { EnvironmentConfig } from "./config.ts";
import { logRetention, runtimeSecrets, sharedRuntimeEnvironment } from "./runtime.ts";

export interface WorkerStackProps extends StackProps {
  config: EnvironmentConfig;
  appSecret: secretsmanager.ISecret;
  vpc: ec2.IVpc;
  cluster: ecs.ICluster;
  menuBucket: s3.IBucket;
  menuDistributionId: string;
  webUrl: string;
  menuUrl: string;
  apiUrl: string;
}

/**
 * The pg-boss consumer: PDF/PNG export and QR publishing. It runs headless Chromium, so it gets
 * more memory than the API and no load balancer — it pulls work from the queue.
 */
export class WorkerStack extends Stack {
  readonly repository: ecr.Repository;
  readonly service: ecs.FargateService;

  constructor(scope: Construct, id: string, props: WorkerStackProps) {
    super(scope, id, props);
    const { config } = props;
    const imageTag = (this.node.tryGetContext("imageTag") as string | undefined) ?? "latest";

    this.repository = new ecr.Repository(this, "Repository", {
      repositoryName: `menu-studio-${config.name}-worker`,
      imageScanOnPush: true,
      lifecycleRules: [{ maxImageCount: 20 }],
      removalPolicy: config.name === "production" ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      emptyOnDelete: config.name !== "production",
    });

    const taskDefinition = new ecs.FargateTaskDefinition(this, "TaskDefinition", { cpu: config.worker.cpu, memoryLimitMiB: config.worker.memoryMiB });
    taskDefinition.addContainer("worker", {
      image: ecs.ContainerImage.fromEcrRepository(this.repository, imageTag),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: "worker",
        logGroup: new logs.LogGroup(this, "LogGroup", { retention: logRetention(config.logRetentionDays), removalPolicy: RemovalPolicy.DESTROY }),
      }),
      environment: sharedRuntimeEnvironment({
        region: config.region,
        webUrl: props.webUrl,
        menuUrl: props.menuUrl,
        apiUrl: props.apiUrl,
        menuBucket: props.menuBucket.bucketName,
        menuDistributionId: props.menuDistributionId,
      }),
      secrets: runtimeSecrets(props.appSecret, ["DATABASE_URL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "PRINT_TOKEN_SECRET", "SENTRY_DSN_WORKER"]),
      // Chromium needs a bigger shared memory segment than Fargate's 64 MB default.
      linuxParameters: new ecs.LinuxParameters(this, "LinuxParameters", { sharedMemorySize: 1024 }),
      stopTimeout: Duration.seconds(120),
      healthCheck: {
        command: ["CMD-SHELL", "node -e \"fetch('http://127.0.0.1:5324/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""],
        interval: Duration.seconds(30),
        retries: 3,
        startPeriod: Duration.seconds(60),
      },
    });

    props.menuBucket.grantReadWrite(taskDefinition.taskRole);
    taskDefinition.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ["cloudfront:CreateInvalidation"],
        resources: [`arn:aws:cloudfront::${this.account}:distribution/${props.menuDistributionId}`],
      }),
    );

    this.service = new ecs.FargateService(this, "Service", {
      cluster: props.cluster,
      taskDefinition,
      desiredCount: config.worker.desiredCount,
      circuitBreaker: { rollback: true },
      // A rolling deploy must not leave exports unattended, and two workers may overlap safely:
      // jobs are claimed one at a time through pg-boss.
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      healthCheckGracePeriod: undefined,
    });

    const scaling = this.service.autoScaleTaskCount({ minCapacity: config.worker.desiredCount, maxCapacity: config.worker.maxCount });
    scaling.scaleOnCpuUtilization("Cpu", { targetUtilizationPercent: 65, scaleInCooldown: Duration.minutes(10), scaleOutCooldown: Duration.minutes(1) });

    new cloudwatch.Alarm(this, "NoRunningTasks", {
      alarmDescription: "The export/publish worker has no running tasks: exports will queue up.",
      metric: this.service.metricCpuUtilization({ statistic: "SampleCount", period: Duration.minutes(5) }),
      threshold: 1,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING,
    });

    new CfnOutput(this, "WorkerRepositoryUri", { value: this.repository.repositoryUri });
    new CfnOutput(this, "WorkerServiceName", { value: this.service.serviceName });
  }
}
