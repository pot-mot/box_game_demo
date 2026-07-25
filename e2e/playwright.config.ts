import {defineConfig} from '@playwright/test'

export default defineConfig({
    testDir: '.',
    testMatch: '*.spec.ts',
    fullyParallel: true,
    use: {
        baseURL: 'http://localhost:5173',
    },
    webServer: {
        command: 'pnpm dev',
        port: 5173,
        reuseExistingServer: true,
    },
})
