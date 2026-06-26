export interface PublicAppConfig {
  appName: string;
  orgName: string;
  accessControlEnabled: boolean;
}

const DEFAULT_ORG_NAME = '';

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

export function getPublicAppConfig(): PublicAppConfig {
  const orgName = clean(process.env.ORG_NAME) || DEFAULT_ORG_NAME;
  const appName = orgName || '组织雷达';

  return {
    appName,
    orgName,
    accessControlEnabled: Boolean(clean(process.env.ACCESS_CODE)),
  };
}
