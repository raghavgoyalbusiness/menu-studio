import { App, Tags } from "aws-cdk-lib";
import { ApiStack } from "../lib/api-stack.ts";
import { environmentConfig, isEnvironmentName, type EnvironmentName } from "../lib/config.ts";
import { MenuStack } from "../lib/menu-stack.ts";
import { SecretsStack } from "../lib/secrets-stack.ts";
import { WebStack } from "../lib/web-stack.ts";
import { WorkerStack } from "../lib/worker-stack.ts";

const app = new App();
const requested = (app.node.tryGetContext("environment") as string | undefined) ?? "staging";
if (!isEnvironmentName(requested)) throw new Error(`Unknown environment "${requested}". Use staging or production.`);
const config = environmentConfig(requested satisfies EnvironmentName, (key) => app.node.tryGetContext(key));

const env = { account: config.account, region: config.region };
const prefix = `MenuStudio-${config.name}`;
const stackProps = { env, config };

const secrets = new SecretsStack(app, `${prefix}-Secrets`, stackProps);
const menu = new MenuStack(app, `${prefix}-Menu`, stackProps);

// The owner app's CSP needs the API origin, and the API's CORS needs the web origin. Without a
// custom domain both are generated names, so the web stack allows the region's load balancers
// rather than one host: that keeps the dependency one-way (api -> web) instead of circular.
const apiOrigin = config.domain ? `https://${config.domain.apiHost}` : `https://*.${config.region}.elb.amazonaws.com http://*.${config.region}.elb.amazonaws.com`;
const web = new WebStack(app, `${prefix}-Web`, { ...stackProps, apiOrigin });

const webUrl = config.domain ? `https://${config.domain.webHost}` : `https://${web.site.distribution.distributionDomainName}`;
const menuUrl = config.domain ? `https://${config.domain.menuHost}` : `https://${menu.site.distribution.distributionDomainName}`;

const api = new ApiStack(app, `${prefix}-Api`, {
  ...stackProps,
  appSecret: secrets.appSecret,
  menuBucket: menu.bucket,
  menuDistributionId: menu.site.distribution.distributionId,
  webUrl,
  menuUrl,
});

new WorkerStack(app, `${prefix}-Worker`, {
  ...stackProps,
  appSecret: secrets.appSecret,
  vpc: api.vpc,
  cluster: api.cluster,
  menuBucket: menu.bucket,
  menuDistributionId: menu.site.distribution.distributionId,
  webUrl,
  menuUrl,
  apiUrl: api.url,
});

Tags.of(app).add("app", "menu-studio");
Tags.of(app).add("environment", config.name);
