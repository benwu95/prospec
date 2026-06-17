import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    root: '.',
    include: ['tests/**/*.test.ts'],
    // Force picocolors off so formatter assertions are deterministic: GitHub
    // Actions sets CI, which makes picocolors emit ANSI even without a TTY,
    // breaking plain-text substring/regex checks that pass locally.
    env: { NO_COLOR: '1' },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/templates/**'],
      reporter: ['text', 'text-summary', 'json-summary', 'html'],
    },
    unstubEnvs: true,
  },
});
