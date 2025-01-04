// jest.config.mjs
export default {
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'mjs', 'json', 'node'], // Include 'mjs'
  testMatch: [
    '**/__tests__/**/*.[jt]s?(x)',
    '**/?(*.)+(spec|test).mjs', // Add this line to include .mjs test files
    '**/?(*.)+(spec|test).js' // Ensure .js test files are also matched
  ],
  transform: {
    '^.+\\.mjs$': 'babel-jest'
  } // Disable transformation for native ESM
};
