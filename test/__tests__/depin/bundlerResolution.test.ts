/**
 * Guards the one failure this project's test setup cannot see by itself.
 *
 * `@neuraiproject/neurai-depin-msg` declares `"browser"` pointing at its
 * minified IIFE bundle, which assigns `globalThis.neuraiDepinMsg` and exports
 * nothing. Parcel prefers `browser`, so in the browser every named import from
 * the package resolved to `undefined` and blew up on first use — while Jest,
 * which resolves `main` (the CommonJS build), stayed green. Tests passing was
 * not evidence of anything here.
 *
 * The fix is a Parcel `alias` pointing the bundler at the ESM build. Types keep
 * coming from the package root, so no import site changes.
 *
 * When the library fixes its `browser` field, the second test below fails —
 * that is the signal to delete the alias, not a bug.
 */
import { createRequire } from "module";

const require_ = createRequire(__filename);
const appPackage = require_("../../../package.json") as {
  alias?: Record<string, string>;
};
const libPackage = require_("@neuraiproject/neurai-depin-msg/package.json") as {
  browser?: string;
  module?: string;
  exports?: Record<string, unknown>;
};

const PACKAGE = "@neuraiproject/neurai-depin-msg";

describe("bundler resolution of the DePIN library", () => {
  it("points the bundler at the ESM build", () => {
    expect(appPackage.alias?.[PACKAGE]).toBe(`${PACKAGE}/dist/neurai-depin-msg.mjs`);
  });

  it("is still needed: the library's `browser` entry is not a module", () => {
    // If this fails because `browser` now names an ESM build (or is gone), the
    // alias above has done its job and can be removed.
    expect(libPackage.browser).toBe("dist/neurai-depin-msg.min.js");
  });

  it("the aliased file really exports the names the app imports", () => {
    // A subpath that stopped existing would fail the build, but a subpath that
    // exists and exports nothing would fail only in the browser.
    const esm = require_.resolve(`${PACKAGE}/dist/neurai-depin-msg.mjs`);
    const source = require_("fs").readFileSync(esm, "utf8") as string;

    for (const name of [
      "validateDepinSectionToken",
      "isDepinTokenInScope",
      "getDepinPoolInfo",
      "createSoftwareIdentity",
      "requestDepinChallenge",
      "receiveDepinMessages",
      "buildDepinMessageForPool",
      "submitDepinMessage",
      "clearDepinMessages",
      "verifyDepinReply",
      "decodePlainReply",
      "poolKeyFingerprint",
    ]) {
      expect(source).toContain(`  ${name}`);
    }
  });
});
