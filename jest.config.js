/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "tsconfig.json" }],
  },
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  testMatch: [
    "<rootDir>/__tests__/**/*.test.ts",
    "<rootDir>/__tests__/**/*.test.tsx",
  ],
  collectCoverageFrom: [
    "lib/**/*.ts",
    "app/api/**/*.ts",
    "hooks/**/*.ts",
    "!lib/supabaseClient.ts",
    "!lib/supabaseAdmin.ts",
    "!lib/supabaseServer.ts",
    "!**/*.d.ts",
  ],
  coverageThreshold: {
    global: {
      statements: 50,
      branches: 40,
      functions: 50,
      lines: 50,
    },
  },
};
