import { paletteColorForSeed } from "@spend-circle/domain";
import { fireEvent, render } from "@testing-library/react";
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

  it("falls back to initials when a present image fails to load", () => {
    // Google profile-image URLs can expire/403; a set image prop is not a
    // guarantee it renders, so onError must swap to the initials chip.
    const { container } = render(
      <Avatar name="Olive Owner" image="https://example.com/dead.png" />,
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    fireEvent.error(img ?? new Image());
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe("OO");
  });

  it("tints the initials chip with the seed's deterministic palette color", () => {
    const { container } = render(<Avatar name="Maya Member" seed="mem-maya" />);
    const chip = container.firstChild;
    expect(chip).toHaveStyle({ color: paletteColorForSeed("mem-maya").hex });
  });

  it("uses a neutral chip when no seed is given", () => {
    const { container } = render(<Avatar name="Alex" />);
    expect(container.firstChild).toHaveClass("bg-neutral-800");
  });
});
