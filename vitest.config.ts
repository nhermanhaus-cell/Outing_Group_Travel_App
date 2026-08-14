import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'tests/unit/**/*.test.ts',
      'packages/**/tests/**/*.test.ts',
      'packages/domain/**/*.test.ts',
    ],
    environment: 'node',
  },
  resolve: {
    alias: {
      '@gayi/shared': path.resolve(__dirname, 'packages/shared/src'),
      '@gayi/domain': path.resolve(__dirname, 'packages/domain/src'),
      '@gayi/providers': path.resolve(__dirname, 'packages/providers/src'),
      '@gayi/db': path.resolve(__dirname, 'packages/db/src'),
    },
  },
});
