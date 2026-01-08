module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: "..",
  testMatch: ["<rootDir>/test/__tests__/**/*.test.ts"],
  moduleNameMapper: {
    "\\.(css|less|sass|scss)$": "<rootDir>/test/__mocks__/styleMock.js"
  },
  collectCoverageFrom: [
    "src/utils/**/*.ts",
    "src/utils/**/*.tsx",
    "!src/utils/**/*.d.ts"
  ],
  globals: {
    "ts-jest": {
      tsconfig: "test/tsconfig.jest.json"
    }
  }
};
