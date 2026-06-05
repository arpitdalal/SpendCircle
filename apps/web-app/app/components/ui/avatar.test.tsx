import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Avatar } from "./avatar.js";

describe("Avatar", () => {
  it("renders the Profile Picture when an image is given", () => {
    const { container } = render(<Avatar name="Olive Owner" image="https://example.com/o.png" />);
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", "https://example.com/o.png");
    // Decorative: the adjacent display name carries the identity, so the avatar
    // must not be announced (empty alt + aria-hidden).
    expect(img).toHaveAttribute("alt", "");
    expect(img).toHaveAttribute("aria-hidden", "true");
  });

  it("falls back to generated initials when there is no image", () => {
    const { container } = render(<Avatar name="Maya Member" />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe("MM");
  });

  it("stays decorative (aria-hidden) in the initials fallback", () => {
    const { container } = render(<Avatar name="Alex" />);
    expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
  });
});
