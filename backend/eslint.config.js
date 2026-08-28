import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // Клиент Prisma генерируется, править и линтить его бессмысленно.
    ignores: ['dist/**', 'src/generated/**', 'node_modules/**'],
  },
  js.configs.recommended,
  {
    // Служебные скрипты и конфиги выполняются в Node, а не в браузере.
    files: ['**/*.mjs', 'eslint.config.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
);
