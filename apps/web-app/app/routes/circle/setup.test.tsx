import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { configureConvex, makeCircleView, renderCircleRoutes } from "~/test/convex-react.js";

vi.mock("convex/react", async () => (await import("~/test/convex-react.js")).convexReactMock);

import CircleSetup from "./setup.js";

function renderSetup(circle = makeCircleView()) {
  return renderCircleRoutes(
    circle,
    <>
      <Route path="/circles/:circleRef" element={<div>dashboard</div>} />
      <Route path="/circles/:circleRef/setup" element={<CircleSetup />} />
    </>,
    { initialEntries: [`/circles/${circle.ref}/setup`] },
  );
}

describe("Circle setup", () => {
  it("submits optional answers and currency, then returns to the circle dashboard", async () => {
    const user = userEvent.setup();
    const completeCircleSetup = vi.fn().mockResolvedValue({ createdCategoryIds: ["cat-rent"] });
    const circle = makeCircleView({ ref: "home-c1", currency: "USD" });
    configureConvex({ completeCircleSetup });
    const view = renderSetup(circle);

    await user.selectOptions(screen.getByLabelText("Circle use"), "residence");
    await user.selectOptions(screen.getByLabelText("Residence type"), "leased");
    await user.selectOptions(screen.getByLabelText("Currency"), "CAD");
    await user.click(screen.getByRole("button", { name: "Finish setup" }));

    expect(completeCircleSetup).toHaveBeenCalledWith({
      circleId: circle.id,
      answers: { purpose: "residence", residenceType: "leased" },
      currency: "CAD",
    });
    await waitFor(() => {
      expect(view.location()).toBe(`/circles/${circle.ref}`);
    });
    expect(await screen.findByText("Circle setup complete.")).toBeInTheDocument();
  });

  it("skips setup without creating starter categories", async () => {
    const user = userEvent.setup();
    const completeCircleSetup = vi.fn();
    const circle = makeCircleView({ ref: "trip-c1" });
    configureConvex({ completeCircleSetup });
    const view = renderSetup(circle);

    await user.click(screen.getByRole("button", { name: "Skip" }));

    expect(completeCircleSetup).not.toHaveBeenCalled();
    expect(view.location()).toBe(`/circles/${circle.ref}`);
  });

  it("omits currency when the circle currency is locked", async () => {
    const user = userEvent.setup();
    const completeCircleSetup = vi.fn().mockResolvedValue({ createdCategoryIds: [] });
    const circle = makeCircleView({ currencyLocked: true, currency: "USD" });
    configureConvex({ completeCircleSetup });
    renderSetup(circle);

    expect(screen.getByLabelText("Currency")).toBeDisabled();
    await user.selectOptions(screen.getByLabelText("Circle use"), "trip");
    await user.click(screen.getByRole("button", { name: "Finish setup" }));

    expect(completeCircleSetup).toHaveBeenCalledWith({
      circleId: circle.id,
      answers: { purpose: "trip" },
    });
  });

  it("surfaces setup failure and keeps the form enabled for retry", async () => {
    const user = userEvent.setup();
    const completeCircleSetup = vi.fn().mockRejectedValue(new Error("network"));
    configureConvex({ completeCircleSetup });
    const view = renderSetup();

    await user.click(screen.getByRole("button", { name: "Finish setup" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/Couldn't complete setup/);
    expect(screen.getByRole("button", { name: "Finish setup" })).toBeEnabled();
    expect(view.location()).toBe("/circles/trip-c1/setup");
  });
});
