import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  test: {
    include: ['**/*.test.ts'],
    exclude: ['node_modules/**', '.next/**'],
    env: {
      // lib/db.ts refuses to load without one; the tests only use its pure helpers and never connect
      DATABASE_URL: 'postgres://test:test@localhost:5432/test',
      TEST_DATE: '',
      // Unit tests stay offline even when the shell exports real credentials: with these empty, the
      // LaunchDarkly client and the model fallbacks are skipped instead of called
      LD_SDK_KEY: '',
      LAUNCHDARKLY_SDK_KEY: '',
      OPENAI_API_KEY: '',
      ANTHROPIC_API_KEY: '',
    },
  },
});
