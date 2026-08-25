import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './e2e',
    timeout: 30_000,
    retries: process.env.CI ? 2 : 0,
    use: {
        baseURL: 'http://localhost:5173',
        headless: true,
        screenshot: 'only-on-failure',
        // Escape hatch for environments with a system-provided Chromium
        // instead of Playwright-managed browser downloads.
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
            ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
            : {},
    },
    projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
    webServer: {
        // The web app runs fully in the browser via @fpd-editor/core — no
        // backend server is needed for e2e.
        command: 'pnpm --filter @fpd-editor/core build && pnpm --filter fpd-editor-frontend dev',
        port: 5173,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
    },
});
