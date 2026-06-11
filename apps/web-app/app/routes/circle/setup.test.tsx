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
  it("submits optional answers, then returns to the circle dashboard", async () => {
    const user = userEvent.setup();
    const completeCircleSetup = vi.fn().mockResolvedValue({ createdCategoryIds: ["cat-rent"] });
    const circle = makeCircleView({ ref: "home-c1", currency: "USD" });
    configureConvex({ completeCircleSetup });
    const view = renderSetup(circle);

    await user.selectOptions(screen.getByLabelText("Circle use"), "residence");
    await user.selectOptions(screen.getByLabelText("Residence type"), "leased");
    await user.click(screen.getByRole("button", { name: "Finish setup" }));

    expect(completeCircleSetup).toHaveBeenCalledWith({
      circleId: circle.id,
      answers: { purpose: "residence", residenceType: "leased" },
    });
    await waitFor(() => {
      expect(view.location()).toBe(`/circles/${circle.ref}`);
    });
    expect(await screen.findByText("Circle setup complete.")).toBeInTheDocument();
  });

  it("keeps placeholder choices non-selectable", async () => {
    const user = userEvent.setup();
    configureConvex({ completeCircleSetup: vi.fn() });
    renderSetup();

    expect(screen.getByRole("option", { name: "Not sure yet" })).toBeDisabled();

    await user.selectOptions(screen.getByLabelText("Circle use"), "residence");

    for (const option of screen.getAllByRole("option", { name: "Not sure yet" })) {
      expect(option).toBeDisabled();
    }
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

  it("redirects completed setup away from the setup route", async () => {
    const completeCircleSetup = vi.fn();
    const circle = makeCircleView({
      ref: "home-c1",
      setupAnswers: { purpose: "residence", residenceType: "leased" },
    });
    configureConvex({ completeCircleSetup });
    const view = renderSetup(circle);

    await waitFor(() => {
      expect(view.location()).toBe(`/circles/${circle.ref}`);
    });
    expect(completeCircleSetup).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Finish setup" })).not.toBeInTheDocument();
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
