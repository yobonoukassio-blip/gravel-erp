/**
 * Gravel ERP — root ESLint config
 * Custom rules enforce:
 *  - D-16: no float literals in money/** (must use bigint minor units + dinero.js)
 *  - D-20: no `created_at::date` in reports/** (must query via operational_day_id)
 */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  ignorePatterns: [
    'node_modules/',
    'dist/',
    'build/',
    'coverage/',
    '**/*.d.ts',
    'apps/mobile/**',
    'infra/tofu/**',
  ],
  overrides: [
    {
      // D-16 — Money float literal ban
      files: ['**/money/**/*.ts', '**/src/**/money/**/*.ts'],
      rules: {
        'no-restricted-syntax': [
          'error',
          {
            selector: "Literal[raw=/^\\d+\\.\\d+$/]",
            message:
              'D-16: float literals are forbidden in money modules. Use bigint minor units + dinero.js.',
          },
        ],
      },
    },
    {
      // D-20 — Reports must query via operational_day_id, not created_at::date
      files: ['**/reports/**/*.ts', '**/src/**/reports/**/*.ts'],
      rules: {
        'no-restricted-syntax': [
          'error',
          {
            selector: "Literal[value=/created_at::date/]",
            message:
              "D-20: do not bucket reports by `created_at::date`. Query via `operational_day_id`.",
          },
          {
            selector: "TemplateElement[value.raw=/created_at::date/]",
            message:
              "D-20: do not bucket reports by `created_at::date`. Query via `operational_day_id`.",
          },
        ],
      },
    },
  ],
};
