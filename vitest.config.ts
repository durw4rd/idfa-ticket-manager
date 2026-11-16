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
    },
  },
});
