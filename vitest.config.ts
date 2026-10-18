import {defineConfig} from 'vitest/config'

export default defineConfig({
    test: {
        environment: 'happy-dom',
        include: ['src/**/*.test.ts'],
        setupFiles: ['./src/test_setup.ts'],
        globals: true,
    },
})
