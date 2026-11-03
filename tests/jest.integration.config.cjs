const path = require('node:path');

module.exports = {
  rootDir: path.join(__dirname, '..', 'src', 'api'),
  roots: [path.join(__dirname, 'integration')],
  testEnvironment: 'node',
  testMatch: ['<rootDir>/../../tests/integration/**/*.spec.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '../../tests/tsconfig.json' }],
  },
  moduleNameMapper: {
    '^src/(.*)$': '<rootDir>/src/$1',
    '^@nestjs/cache-manager$': path.join(
      __dirname,
      'support',
      'nest-cache-manager.cjs',
    ),
  },
  moduleDirectories: ['node_modules', '<rootDir>/node_modules'],
  moduleFileExtensions: ['js', 'json', 'ts'],
  clearMocks: true,
};
