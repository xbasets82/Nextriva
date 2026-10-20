import sonarjs from 'eslint-plugin-sonarjs';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/*.tsbuildinfo',
      '**/*.log',
      'apps/api/generated/**',
      // Tipos generados íntegramente desde OpenAPI, sin lógica ejecutable.
      'apps/web/src/api/schema.d.ts',
    ],
  },
  ...tseslint.configs.recommended,
  sonarjs.configs.recommended,
  {
    files: ['apps/api/**/*.ts', 'apps/web/**/*.ts', 'apps/web/**/*.tsx'],
  },
];
