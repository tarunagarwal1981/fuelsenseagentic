/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: ['**/tests/**/*.test.ts', '**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  setupFiles: ['<rootDir>/jest.setup.js'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { useESM: false }],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  collectCoverageFrom: [
    'lib/engines/vessel-selection-engine.ts',
    'lib/utils/vessel-selection-parser.ts',
  ],
  coverageThreshold: {
    'lib/engines/vessel-selection-engine.ts': { statements: 80, branches: 65, functions: 90, lines: 80 },
    'lib/utils/vessel-selection-parser.ts': { statements: 70, branches: 60, functions: 100, lines: 70 },
  },
};
