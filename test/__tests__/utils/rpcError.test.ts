import { formatRpcError } from "@/utils/rpcError";

// jswallet >= 0.15 normalises every RPC rejection to an `Error`. Anything not
// going through jswallet can still throw the old structured object. Both have
// to reach the user as the same sentence, which is what these pin.
describe("formatRpcError", () => {
  describe("the normalised Error contract", () => {
    it("uses the message jswallet composed", () => {
      expect(formatRpcError(new Error("RPC getblockchaininfo failed: Method not found"))).toBe(
        "RPC getblockchaininfo failed: Method not found",
      );
    });

    it("shows the JSON-RPC code when the error carries one", () => {
      const err = Object.assign(new Error("Invalid Neurai address"), { code: -5 });
      expect(formatRpcError(err)).toBe("RPC error (-5): Invalid Neurai address");
    });

    it("still classifies an unreachable server", () => {
      // The regression this file exists for: once every rejection became an
      // `Error`, the classification below stopped running and the user saw a
      // raw transport message instead of being told the server is unreachable.
      expect(formatRpcError(new Error("Failed to fetch"))).toBe(
        "RPC unreachable: cannot connect to server",
      );
    });

    it("still classifies a timeout", () => {
      expect(formatRpcError(new Error("Request timeout after 30000ms"))).toBe(
        "RPC timeout: server is not responding",
      );
    });

    it("falls back when the message is empty", () => {
      expect(formatRpcError(new Error(""))).toBe("RPC error");
    });
  });

  describe("the legacy structured shape", () => {
    it("digs the message out of a JSON-RPC rejection", () => {
      expect(formatRpcError({ error: { message: "Method not found" }, status: 404 })).toBe(
        "RPC error (404): Method not found",
      );
    });

    it("reads a doubly nested message", () => {
      expect(formatRpcError({ error: { error: { message: "Token mismatch" } } })).toBe(
        "RPC error: Token mismatch",
      );
    });

    it("classifies the same conditions as the Error path", () => {
      expect(formatRpcError({ error: { message: "Failed to fetch" } })).toBe(
        "RPC unreachable: cannot connect to server",
      );
      expect(formatRpcError({ message: "timeout" })).toBe("RPC timeout: server is not responding");
    });

    it("shows the object when it carries no message at all", () => {
      expect(formatRpcError({ weird: true })).toContain("weird");
    });

    it("survives a circular object", () => {
      const circular: Record<string, unknown> = { a: 1 };
      circular.self = circular;
      expect(formatRpcError(circular)).toContain("[Circular]");
    });
  });

  describe("degenerate inputs", () => {
    it("names the unknown case", () => {
      expect(formatRpcError(null)).toBe("Unknown RPC error");
      expect(formatRpcError(undefined)).toBe("Unknown RPC error");
    });

    it("passes a plain string through, classifying it too", () => {
      expect(formatRpcError("boom")).toBe("boom");
      expect(formatRpcError("Network request failed")).toBe(
        "RPC unreachable: cannot connect to server",
      );
    });
  });
});
