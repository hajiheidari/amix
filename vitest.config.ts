import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const pkgs = ['domain', 'calculators', 'sessions', 'journal', 'storage', 'i18n', 'ui', 'data-contracts'];
const alias = Object.fromEntries(pkgs.map((p) => [`@tc/${p}`, fileURLToPath(new URL(`./packages/${p}/src/index.ts`, import.meta.url))]));

export default defineConfig({
  resolve: { alias },
  test: {
    include: ['packages/*/test/**/*.test.{ts,tsx}', 'apps/client/src/**/*.test.{ts,tsx}'],
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
  },
});
