import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@gayi/shared': path.resolve(__dirname, '../shared/src/index.ts'),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    globals: false,
  },
});
