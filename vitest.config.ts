import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@gayi/domain': path.resolve(__dirname, 'packages/domain/src/index.ts'),
      '@gayi/shared': path.resolve(__dirname, 'packages/shared/src/index.ts'),
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    globals: false,
  },
});
