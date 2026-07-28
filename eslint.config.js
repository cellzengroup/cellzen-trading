import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default [
  { ignores: ['**/dist/**', '**/node_modules/**'] },
  // Frontend — browser + React. `react/prop-types` is off: this codebase
  // never adopted the `prop-types` package, so enforcing it here would just
  // flag every component instead of catching a real issue.
  {
    files: ['frontend/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    settings: { react: { version: '19.1' } },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      'react/jsx-no-target-blank': 'off',
      'react/prop-types': 'off',
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  // Backend + standalone Node services — CommonJS (`require`/`module.exports`),
  // each with its own package.json declaring `"type": "commonjs"` (or, for
  // backend/, no "type" field at all, which defaults to commonjs).
  {
    files: ['backend/**/*.js', 'gtradea-bridge/**/*.js', 'print-bridge/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: globals.node,
    },
    rules: {
      ...js.configs.recommended.rules,
    },
  },
  // Root-level build/tooling config (Vite, Tailwind, PostCSS, this file). These
  // run under the repo's root `"type": "module"`, but Vite's config loader
  // shims `__dirname`/`__filename` for convenience, so Node globals are added
  // here purely so ESLint doesn't flag that as undefined.
  {
    files: ['*.config.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      ...js.configs.recommended.rules,
    },
  },
]
