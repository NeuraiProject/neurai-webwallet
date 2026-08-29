import { DepinRpcUrlNotSupportedError, depinServiceId } from "@/depin/serviceId";

// The pool key is pinned against this identifier. Getting it wrong in either
// direction breaks the pin: too loose and one server's pin covers another, too
// specific and the pin is dropped whenever something irrelevant changes.
describe("depinServiceId", () => {
  const URL_A = "https://rpc-testnet.neurai.org/rpc";

  it("is stable for the same endpoint", () => {
    expect(depinServiceId("xna-test", URL_A)).toBe(depinServiceId("xna-test", URL_A));
  });

  it("separates endpoints that differ in host or path", () => {
    expect(depinServiceId("xna-test", URL_A)).not.toBe(
      depinServiceId("xna-test", "https://rpc-testnet-depin.neurai.org/rpc"),
    );
    expect(depinServiceId("xna-test", URL_A)).not.toBe(
      depinServiceId("xna-test", "https://rpc-testnet.neurai.org/other"),
    );
  });

  it("never lets a pin cross chains", () => {
    // The same URL on another chain is another service.
    expect(depinServiceId("xna-test", URL_A)).not.toBe(depinServiceId("xna-legacy-test", URL_A));
  });

  it("ignores credentials, which rotate without the endpoint changing", () => {
    const withCreds = "https://user:secret@rpc-testnet.neurai.org/rpc";
    expect(depinServiceId("xna-test", withCreds)).toBe(depinServiceId("xna-test", URL_A));
    expect(depinServiceId("xna-test", withCreds)).not.toContain("secret");
    expect(depinServiceId("xna-test", withCreds)).not.toContain("user");
  });

  it("ignores a fragment, which never reaches the server", () => {
    expect(depinServiceId("xna-test", `${URL_A}#anything`)).toBe(depinServiceId("xna-test", URL_A));
  });

  it("ignores trailing slashes and host case", () => {
    expect(depinServiceId("xna-test", `${URL_A}/`)).toBe(depinServiceId("xna-test", URL_A));
    expect(depinServiceId("xna-test", "https://RPC-Testnet.Neurai.org/rpc")).toBe(
      depinServiceId("xna-test", URL_A),
    );
  });

  it("REFUSES a URL with a query instead of storing it", () => {
    // Not a limitation, a decision: ignoring the query would let two endpoints
    // share a pin, and including it would persist whatever token it carries.
    expect(() => depinServiceId("xna-test", `${URL_A}?token=abc123`)).toThrow(
      DepinRpcUrlNotSupportedError,
    );
    try {
      depinServiceId("xna-test", `${URL_A}?token=abc123`);
    } catch (e) {
      // The token must not survive into the message either.
      expect(String((e as Error).message)).not.toContain("abc123");
    }
  });

  it("refuses what is not a usable RPC URL", () => {
    expect(() => depinServiceId("xna-test", "")).toThrow(DepinRpcUrlNotSupportedError);
    expect(() => depinServiceId("xna-test", "not a url")).toThrow(DepinRpcUrlNotSupportedError);
    expect(() => depinServiceId("xna-test", "ftp://example.org/rpc")).toThrow(
      DepinRpcUrlNotSupportedError,
    );
  });
});
