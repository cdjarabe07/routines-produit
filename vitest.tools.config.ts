import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

// Outils d'exploitation exécutés à la demande contre le serveur de test (jamais la production : tests/stagingEnv.ts)
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { environment: 'node', include: ['tests/tools/**/*.tool.ts'], testTimeout: 120_000 },
});
