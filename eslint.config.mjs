import neostandard from 'neostandard';

export default [
  ...neostandard({
    semi: true, // Overrides Standard's default no-semi rule
    env: ['jest', 'node']
  }),
  {
    rules: {
      'no-console': 'off',
      '@stylistic/quotes': ['error', 'single'],
      '@stylistic/comma-dangle': ['error', 'never'],
      'arrow-body-style': ['error', 'always'],
      'prefer-destructuring': ['error', { object: true, array: false }]
    }
  }
];
