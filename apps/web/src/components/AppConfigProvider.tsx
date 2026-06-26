import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '../api';
import type { PublicAppConfig } from '../types';

const defaultConfig: PublicAppConfig = {
  appName: '组织雷达',
  orgName: '',
  accessControlEnabled: true,
};

const AppConfigContext = createContext<PublicAppConfig>(defaultConfig);

export function AppConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<PublicAppConfig>(defaultConfig);

  useEffect(() => {
    let mounted = true;
    api.getPublicConfig()
      .then((value) => {
        if (!mounted) return;
        setConfig({
          appName: value.appName || defaultConfig.appName,
          orgName: value.orgName || defaultConfig.orgName,
          accessControlEnabled: value.accessControlEnabled ?? defaultConfig.accessControlEnabled,
        });
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    document.title = config.appName;
  }, [config.appName]);

  return (
    <AppConfigContext.Provider value={config}>
      {children}
    </AppConfigContext.Provider>
  );
}

export function useAppConfig() {
  return useContext(AppConfigContext);
}
