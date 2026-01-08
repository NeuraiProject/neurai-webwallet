/**
 * @jest-environment jsdom
 */
import { autoResizeTextarea } from "../../../src/utils/domUtils";

describe("autoResizeTextarea", () => {
  it("uses scrollHeight when textarea has content", () => {
    const textarea = document.createElement("textarea");
    textarea.value = "hello";
    Object.defineProperty(textarea, "scrollHeight", { value: 120, configurable: true });

    autoResizeTextarea(textarea, 44);

    expect(textarea.style.height).toBe("120px");
  });

  it("uses minHeight when textarea is empty", () => {
    const textarea = document.createElement("textarea");
    textarea.value = "   ";
    Object.defineProperty(textarea, "scrollHeight", { value: 200, configurable: true });

    autoResizeTextarea(textarea, 44);

    expect(textarea.style.height).toBe("44px");
  });
});
