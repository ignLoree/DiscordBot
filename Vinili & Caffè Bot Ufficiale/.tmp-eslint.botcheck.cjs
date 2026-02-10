module.exports = [{
  files: ['**/*.js'],
  ignores: ['node_modules/**'],
  languageOptions: {
    ecmaVersion: 'latest',
    sourceType: 'commonjs',
    globals: {
      global:'readonly', process:'readonly', Buffer:'readonly',
      setTimeout:'readonly', clearTimeout:'readonly', setInterval:'readonly', clearInterval:'readonly',
      fetch:'readonly', URL:'readonly', URLSearchParams:'readonly',
      console:'readonly', __dirname:'readonly', __filename:'readonly', module:'readonly', require:'readonly'
    }
  },
  rules: {
    'no-undef': 'error',
    'no-unreachable': 'error',
    'no-dupe-keys': 'error',
    'no-constant-condition': 'warn',
    'no-unsafe-finally': 'error'
  }
}];
