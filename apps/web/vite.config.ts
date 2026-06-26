import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');

function parseAllowedHosts(value: string | undefined): string[] | undefined {
  const hosts = value
    ?.split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return hosts && hosts.length > 0 ? hosts : undefined;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, projectRoot, '');
  const serverPort = Number(env.PORT || process.env.PORT || 3001);
  const webPort = Number(env.WEB_PORT || process.env.WEB_PORT || 5174);
  const allowedHosts = parseAllowedHosts(env.VITE_ALLOWED_HOSTS || process.env.VITE_ALLOWED_HOSTS);

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: webPort,
      strictPort: true,
      allowedHosts,
      proxy: {
        '/api': {
          target: `http://localhost:${serverPort}`,
          changeOrigin: true,
        },
      },
    },
  };
});
