import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html'],
      include: ['src/services/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/services/metrics.service.ts', // câblage prom-client (infra, pas de logique métier)
        'src/services/openapi.ts',         // spec OpenAPI statique
      ],
      // Quality Gate réel : `test:coverage` échoue sous 80 % (statements/lines/functions).
      thresholds: {
        statements: 80,
        lines: 80,
        functions: 80,
      },
    },
  },
});
