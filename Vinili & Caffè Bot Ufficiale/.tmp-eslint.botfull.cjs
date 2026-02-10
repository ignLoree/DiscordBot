module.exports = {
  root: true,
  env: { node: true, es2022: true },
  parserOptions: { ecmaVersion: 'latest' },
  rules: {
    'no-undef': 'error',
    'no-unreachable': 'error',
    'no-dupe-keys': 'error',
    'no-constant-condition': ['error', { checkLoops: false }],
    'no-unsafe-finally': 'error'
  }
};
