import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: '.',
    testMatch: 'release-smoke.spec.mjs',
    reporter: 'list',
    use: { browserName: 'chromium', screenshot: 'only-on-failure', trace: 'off' }
});
