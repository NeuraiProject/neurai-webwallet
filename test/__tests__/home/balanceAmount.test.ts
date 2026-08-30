import { decimalSeparator, splitAmount } from "@/home/splitAmount";

// The decimals are set smaller than the whole number, which means splitting the
// formatted string. Which character splits it is a property of the locale, not
// something readable off the string: "1,284" is one thousand two hundred and
// eighty-four in English and one-and-a-bit in German.
describe("splitAmount", () => {
  it("splits on the separator it is given", () => {
    expect(splitAmount("1,284.4071", ".")).toEqual({ whole: "1,284", separator: ".", fraction: "4071" });
    expect(splitAmount("1.284,4071", ",")).toEqual({ whole: "1.284", separator: ",", fraction: "4071" });
  });

  it("treats a grouping character as grouping, given the right separator", () => {
    // The exact case that cannot be guessed: with "." as the decimal separator,
    // "1,284" is a whole number and must stay one piece.
    expect(splitAmount("1,284", ".")).toEqual({ whole: "1,284", separator: "", fraction: "" });
    // And with "," as the decimal separator, the same string is fractional.
    expect(splitAmount("1,284", ",")).toEqual({ whole: "1", separator: ",", fraction: "284" });
  });

  it("leaves a whole number alone", () => {
    expect(splitAmount("1284", ".")).toEqual({ whole: "1284", separator: "", fraction: "" });
  });

  it("splits on the last separator, not the first", () => {
    expect(splitAmount("1.284.507", ".")).toEqual({ whole: "1.284", separator: ".", fraction: "507" });
  });

  it("handles a negative amount", () => {
    expect(splitAmount("-0.5", ".")).toEqual({ whole: "-0", separator: ".", fraction: "5" });
  });

  it("refuses to split when what follows is not digits", () => {
    expect(splitAmount("1.2e5", ".")).toEqual({ whole: "1.2e5", separator: "", fraction: "" });
  });
});

describe("decimalSeparator", () => {
  it("reports what each locale uses", () => {
    expect(decimalSeparator("en-US")).toBe(".");
    expect(decimalSeparator("de-DE")).toBe(",");
    expect(decimalSeparator("es-ES")).toBe(",");
  });

  it("falls back to a dot rather than throwing on nonsense", () => {
    expect(decimalSeparator("not-a-locale!!")).toBe(".");
  });
});
