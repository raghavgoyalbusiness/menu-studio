import { App, Tags } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import { ApiStack } from "../lib/api-stack.ts";
import { environmentConfig, type EnvironmentName } from "../lib/config.ts";
import { MenuStack } from "../lib/menu-stack.ts";
import { SecretsStack } from "../lib/secrets-stack.ts";
import { WebStack } from "../lib/web-stack.ts";
import { WorkerStack } from "../lib/worker-stack.ts";

function synth(name: EnvironmentName) {
  const app = new App();
  const config = environmentConfig(name, () => undefined);
  const env = { account: "123456789012", region: config.region };
  const stackProps = { env, config };
  const secrets = new SecretsStack(app, "Secrets", stackProps);
  const menu = new MenuStack(app, "Menu", stackProps);
  const web = new WebStack(app, "Web", { ...stackProps, apiOrigin: "https://api.example.test" });
  const api = new ApiStack(app, "Api", {
    ...stackProps,
    appSecret: secrets.appSecret,
    menuBucket: menu.bucket,
    menuDistributionId: "E123",
    webUrl: "https://web.example.test",
    menuUrl: "https://menu.example.test",
  });
  const worker = new WorkerStack(app, "Worker", {
    ...stackProps,
    appSecret: secrets.appSecret,
    vpc: api.vpc,
    cluster: api.cluster,
    menuBucket: menu.bucket,
    menuDistributionId: "E123",
    webUrl: "https://web.example.test",
    menuUrl: "https://menu.example.test",
    apiUrl: "https://api.example.test",
  });
  Tags.of(app).add("app", "menu-studio");
  return {
    app,
    config,
    templates: {
      secrets: Template.fromStack(secrets),
      menu: Template.fromStack(menu),
      web: Template.fromStack(web),
      api: Template.fromStack(api),
      worker: Template.fromStack(worker),
    },
  };
}

describe("infrastructure", () => {
  it("synthesises every stack for both environments", () => {
    for (const name of ["staging", "production"] as const) {
      const { templates } = synth(name);
      for (const template of Object.values(templates)) expect(Object.keys(template.toJSON().Resources as object).length).toBeGreaterThan(0);
    }
  });

  it("keeps both buckets private and encrypted", () => {
    const { templates } = synth("staging");
    for (const template of [templates.web, templates.menu]) {
      template.hasResourceProperties("AWS::S3::Bucket", {
        PublicAccessBlockConfiguration: { BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true },
        BucketEncryption: Match.objectLike({ ServerSideEncryptionConfiguration: Match.anyValue() }),
      });
    }
  });

  it("serves both sites over HTTPS only, with security headers", () => {
    const { templates } = synth("staging");
    for (const template of [templates.web, templates.menu]) {
      template.hasResourceProperties("AWS::CloudFront::Distribution", {
        DistributionConfig: Match.objectLike({ DefaultCacheBehavior: Match.objectLike({ ViewerProtocolPolicy: "redirect-to-https" }) }),
      });
      template.hasResourceProperties("AWS::CloudFront::ResponseHeadersPolicy", {
        ResponseHeadersPolicyConfig: Match.objectLike({
          SecurityHeadersConfig: Match.objectLike({
            StrictTransportSecurity: Match.objectLike({ AccessControlMaxAgeSec: 31536000 }),
            FrameOptions: { FrameOption: "DENY", Override: true },
          }),
        }),
      });
    }
  });

  it("rewrites SPA 404s to index.html only for the owner app", () => {
    const { templates } = synth("staging");
    templates.web.hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: Match.objectLike({
        CustomErrorResponses: Match.arrayWith([Match.objectLike({ ErrorCode: 404, ResponseCode: 200, ResponsePagePath: "/index.html" })]),
      }),
    });
    const menuErrors = templates.menu.toJSON() as { Resources: Record<string, { Type: string; Properties: Record<string, unknown> }> };
    const distribution = Object.values(menuErrors.Resources).find((r) => r.Type === "AWS::CloudFront::Distribution");
    const config = distribution?.Properties.DistributionConfig as { CustomErrorResponses?: { ResponseCode: number }[] };
    expect(config.CustomErrorResponses?.some((e) => e.ResponseCode === 200)).toBe(false);
  });

  it("never puts a secret value in a task definition", () => {
    const { templates } = synth("production");
    for (const template of [templates.api, templates.worker]) {
      const json = JSON.stringify(template.toJSON());
      expect(json).not.toContain("REPLACE_ME");
      template.hasResourceProperties("AWS::ECS::TaskDefinition", {
        ContainerDefinitions: Match.arrayWith([
          Match.objectLike({
            Secrets: Match.arrayWith([Match.objectLike({ Name: "DATABASE_URL", ValueFrom: Match.anyValue() })]),
            Environment: Match.arrayWith([{ Name: "NODE_ENV", Value: "production" }]),
          }),
        ]),
      });
    }
  });

  it("generates the print token secret instead of storing a placeholder", () => {
    const { templates } = synth("staging");
    templates.secrets.hasResourceProperties("AWS::SecretsManager::Secret", {
      GenerateSecretString: Match.objectLike({ GenerateStringKey: "PRINT_TOKEN_SECRET", PasswordLength: 48 }),
    });
  });

  it("gives the worker write access to the menu bucket and the API only read", () => {
    const { templates } = synth("staging");
    const workerPolicies = JSON.stringify(templates.worker.findResources("AWS::IAM::Policy"));
    expect(workerPolicies).toContain("s3:PutObject");
    expect(workerPolicies).toContain("cloudfront:CreateInvalidation");
    const apiPolicies = JSON.stringify(templates.api.findResources("AWS::IAM::Policy"));
    expect(apiPolicies).not.toContain("s3:PutObject");
  });

  it("scales the API and the worker, and rolls back a bad deploy", () => {
    const { templates } = synth("production");
    for (const template of [templates.api, templates.worker]) {
      template.hasResourceProperties("AWS::ECS::Service", {
        DeploymentConfiguration: Match.objectLike({ DeploymentCircuitBreaker: { Enable: true, Rollback: true } }),
      });
      template.resourceCountIs("AWS::ApplicationAutoScaling::ScalingPolicy", 1);
    }
  });

  it("keeps production data when a stack is deleted", () => {
    const { templates } = synth("production");
    for (const template of [templates.web, templates.menu, templates.secrets]) {
      for (const resource of Object.values(template.toJSON().Resources as Record<string, { Type: string; DeletionPolicy?: string }>)) {
        if (resource.Type === "AWS::S3::Bucket" || resource.Type === "AWS::SecretsManager::Secret") expect(resource.DeletionPolicy).toBe("Retain");
      }
    }
  });
});
