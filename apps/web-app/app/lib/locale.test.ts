import { afterEach, describe, expect, it, vi } from "vitest";
import { VIEWER_LOCALE_FALLBACK, viewerLocale } from "./locale.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("viewerLocale", () => {
  it("uses the browser's navigator.language when present", () => {
    vi.spyOn(window.navigator, "language", "get").mockReturnValue("en-CA");
    expect(viewerLocale()).toBe("en-CA");
  });

  it("falls back to a fixed en-US, not the ambient locale, when language is empty", () => {
    vi.spyOn(window.navigator, "language", "get").mockReturnValue("");
    expect(viewerLocale()).toBe(VIEWER_LOCALE_FALLBACK);
    expect(VIEWER_LOCALE_FALLBACK).toBe("en-US");
  });
});
