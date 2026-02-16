/** Jest config for bunker test suite and coverage (no vessel-selection thresholds). */
const base = require('./jest.config.js');

module.exports = {
  ...base,
  collectCoverageFrom: [
    'lib/services/bunker-data-service.ts',
    'lib/engines/rob-calculator.ts',
    'lib/engines/fleet-optimizer.ts',
    'lib/engines/multi-port-optimizer.ts',
  ],
  coverageThreshold: {
    'lib/services/bunker-data-service.ts': { statements: 80, branches: 65, functions: 80, lines: 80 },
    'lib/engines/rob-calculator.ts': { statements: 90, branches: 80, functions: 100, lines: 90 },
    'lib/engines/fleet-optimizer.ts': { statements: 80, branches: 70, functions: 100, lines: 80 },
    'lib/engines/multi-port-optimizer.ts': { statements: 80, branches: 70, functions: 100, lines: 80 },
  },
};
