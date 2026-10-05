module.exports = {
  testEnvironment: "node",
  rootDir: "..",
  testMatch: ["<rootDir>/test/__tests__/**/*.test.ts", "<rootDir>/test/__tests__/**/*.test.tsx"],
  moduleNameMapper: {
    "\\.(css|less|sass|scss)$": "<rootDir>/test/__mocks__/styleMock.js",
    "^@/(.*)$": "<rootDir>/src/$1"
  },
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "test/tsconfig.json" }],
    // The neurai-privacy browser entries are ES modules; compile them to CommonJS for Jest.
    "^.+/(?:node_modules/@neuraiproject/|librerias-neurai/)neurai-privacy/.+\\.js$": "<rootDir>/test/esm-package-transformer.cjs"
  },
  transformIgnorePatterns: ["/node_modules/(?!@neuraiproject/neurai-privacy/)"],
  collectCoverageFrom: [
    "src/utils/**/*.ts",
    "src/utils/**/*.tsx",
    "!src/utils/**/*.d.ts"
  ]
};
