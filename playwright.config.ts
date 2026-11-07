import { defineConfig } from '@playwright/test';

const PORT = 8899;
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}`, trace: 'off' },
  webServer: {
    command: `rm -rf .local-data/e2e && PORT=${PORT} LOCAL_DATA_DIR=.local-data/e2e npx tsx scripts/local-server.ts`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
