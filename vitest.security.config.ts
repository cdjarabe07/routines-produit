import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

// Tests de sécurité contre le serveur de démonstration Supabase (npm run test:security, docs/SECURITY_TESTS.md)
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'node',
    include: ['tests/security/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
