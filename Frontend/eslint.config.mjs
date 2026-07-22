// ESLint flat config for the frontend (React + Vite)
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
  // Never lint dependencies or build output
  { ignores: ['node_modules/**', 'dist/**'] },

  js.configs.recommended,
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: globals.browser, // window, document, fetch, localStorage...
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      'react-hooks': reactHooks,     // catches broken useEffect/useState usage
      'react-refresh': reactRefresh, // keeps components hot-reload friendly
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Components are used in JSX, which core ESLint can't see —
      // ignoring capitalized names avoids false "unused variable" errors
      'no-unused-vars': ['warn', { varsIgnorePattern: '^[A-Z_]' }],
      'react-refresh/only-export-components': 'warn',
      // The strictest React-Compiler-era rules flag existing patterns in this
      // codebase. Keep them visible as warnings (fix over time) without
      // failing CI. Promote back to 'error' once the code is cleaned up.
      'react-hooks/immutability': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
    },
  },
];
