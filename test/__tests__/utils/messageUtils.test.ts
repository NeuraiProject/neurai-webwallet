import {
  computeExpiresDate,
  extractBotModel,
  getUnreadCount
} from "@/utils/messageUtils";

describe("extractBotModel", () => {
  it("extracts bracketed model names", () => {
    const result = extractBotModel("[BOT]: [google/gemma-3-1b] Hello!");
    expect(result.model).toBe("google/gemma-3-1b");
    expect(result.cleanText).toBe("Hello!");
  });

  it("handles plain model names", () => {
    const result = extractBotModel("[BOT] gpt-4 Hi there");
    expect(result.model).toBe("gpt-4");
    expect(result.cleanText).toBe("Hi there");
  });

  it("returns null when no model is present", () => {
    const result = extractBotModel("Regular message");
    expect(result.model).toBeNull();
    expect(result.cleanText).toBe("Regular message");
  });
});

describe("computeExpiresDate", () => {
  it("returns undefined when expiry is disabled", () => {
    const result = computeExpiresDate(1704067200, null, () => "ignored");
    expect(result).toBeUndefined();
  });

  it("uses the formatter for valid expiry", () => {
    const result = computeExpiresDate(1000, 1, (ts) => `ts:${ts}`);
    expect(result).toBe("ts:4600");
  });
});

describe("getUnreadCount", () => {
  it("counts all messages when no last-read marker", () => {
    const messages = new Map([["addr", [{ deliveryKey: "a" }, { deliveryKey: "b" }]]]);
    const result = getUnreadCount("addr", new Map(), messages);
    expect(result).toBe(2);
  });

  it("counts messages after last-read marker", () => {
    const messages = new Map([
      ["addr", [{ deliveryKey: "a" }, { deliveryKey: "b" }, { deliveryKey: "c" }]]
    ]);
    const lastRead = new Map([["addr", "a"]]);
    const result = getUnreadCount("addr", lastRead, messages);
    expect(result).toBe(2);
  });
});
