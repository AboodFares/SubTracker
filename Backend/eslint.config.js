// ESLint flat config for the backend (Node.js, CommonJS)
const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  // Never lint dependencies, the Python ML workspace, or generated data
  { ignores: ['node_modules/**', 'ml/**'] },

  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: {
        ...globals.node, // require, module, process, console, fetch...
      },
    },
    rules: {
      // Unused function args are common in Express middleware signatures
      // (err, req, res, next) — only flag unused args after the last used one
      'no-unused-vars': ['warn', { args: 'after-used', argsIgnorePattern: '^_' }],
    },
  },
];
