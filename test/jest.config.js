module.exports = {
  testEnvironment: "node",
  rootDir: "..",
  testMatch: ["<rootDir>/test/__tests__/**/*.test.ts"],
  moduleNameMapper: {
    "\\.(css|less|sass|scss)$": "<rootDir>/test/__mocks__/styleMock.js",
    "^@/(.*)$": "<rootDir>/src/$1"
  },
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "test/tsconfig.json" }]
  },
  collectCoverageFrom: [
    "src/utils/**/*.ts",
    "src/utils/**/*.tsx",
    "!src/utils/**/*.d.ts"
  ]
};
