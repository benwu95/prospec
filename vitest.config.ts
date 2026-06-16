import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    root: '.',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/templates/**'],
      reporter: ['text', 'text-summary', 'json-summary', 'html'],
    },
    unstubEnvs: true,
  },
});
