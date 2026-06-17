import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import { mutationErrorMessageForUser } from "./mutation-user-message.js";

describe("mutationErrorMessageForUser", () => {
  it("returns allowlisted ConvexError data verbatim", () => {
    expect(mutationErrorMessageForUser(new ConvexError("Circle is archived"), "fallback")).toBe(
      "Circle is archived",
    );
    expect(
      mutationErrorMessageForUser(
        new ConvexError("A category with this name already exists for this type"),
        "fallback",
      ),
    ).toBe("A category with this name already exists for this type");
  });

  it("maps plain Errors and unlisted ConvexErrors to the fallback", () => {
    expect(mutationErrorMessageForUser(new Error("Server Error"), "fallback")).toBe("fallback");
    expect(mutationErrorMessageForUser(new ConvexError("Category not found"), "fallback")).toBe(
      "fallback",
    );
  });
});
