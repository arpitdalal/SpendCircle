import { colorHex } from "@spend-circle/domain";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route } from "react-router";
import { describe, expect, it, vi } from "vitest";
import type { Member } from "~/lib/data.js";
import {
  configureConvex,
  makeCircleView,
  makeMemberView,
  renderCircleRoutes,
} from "~/test/convex-react.js";

vi.mock("convex/react", async () => (await import("~/test/convex-react.js")).convexReactMock);

import CircleSettings from "./settings.js";

const ownerMember = makeMemberView({ role: "owner", isSelf: true });
const regularMember = makeMemberView({
  id: makeMemberView().id,
  role: "member",
  isSelf: true,
  displayName: "Maya Member",
});

function renderSettings(
  circle = makeCircleView({ ref: "trip-c1", setupAnswers: { purpose: "trip" } }),
  members: Member[] | null | undefined = [ownerMember],
) {
  configureConvex({ members });
  return renderCircleRoutes(
    circle,
    <>
      <Route path="/circles/:circleRef" element={<div>dashboard</div>} />
      <Route path="/circles/:circleRef/settings" element={<CircleSettings />} />
    </>,
    { initialEntries: [`/circles/${circle.ref}/settings`] },
  );
}

describe("Circle settings", () => {
  it("lets the owner rename the circle and update color and setup answers", async () => {
    const user = userEvent.setup();
    const renameCircle = vi.fn().mockResolvedValue(undefined);
    const updateCircleSettings = vi.fn().mockResolvedValue(undefined);
    const circle = makeCircleView({ ref: "trip-c1", setupAnswers: { purpose: "trip" } });
    configureConvex({ members: [ownerMember], renameCircle, updateCircleSettings });
    renderCircleRoutes(
      circle,
      <>
        <Route path="/circles/:circleRef" element={<div>dashboard</div>} />
        <Route path="/circles/:circleRef/settings" element={<CircleSettings />} />
      </>,
      { initialEntries: [`/circles/${circle.ref}/settings`] },
    );

    await user.clear(screen.getByLabelText("Circle name"));
    await user.type(screen.getByLabelText("Circle name"), "Japan Trip");
    await user.click(screen.getByRole("button", { name: "Save name" }));
    expect(renameCircle).toHaveBeenCalledWith({ circleId: circle.id, name: "Japan Trip" });

    await user.click(screen.getByRole("button", { name: "Green" }));
    expect(updateCircleSettings).toHaveBeenCalledWith({ circleId: circle.id, color: "green" });
    expect(screen.getByTestId("mark-tint")).toHaveAttribute("data-color-hex", colorHex("green"));

    await user.selectOptions(screen.getByLabelText("Circle use"), "residence");
    await user.selectOptions(screen.getByLabelText("Residence type"), "leased");
    await user.click(screen.getByRole("button", { name: "Save setup answers" }));
    expect(updateCircleSettings).toHaveBeenCalledWith({
      circleId: circle.id,
      setupAnswers: { purpose: "residence", residenceType: "leased" },
    });
  });

  it("redirects non-owners to the dashboard", async () => {
    const circle = makeCircleView({ ref: "trip-c1" });
    const view = renderSettings(circle, [regularMember]);

    await waitFor(() => {
      expect(view.location()).toBe(`/circles/${circle.ref}`);
    });
    expect(screen.getByText("dashboard")).toBeInTheDocument();
  });

  it("does not call mutations when setup answers are unchanged", async () => {
    const user = userEvent.setup();
    const updateCircleSettings = vi.fn();
    const circle = makeCircleView({
      ref: "trip-c1",
      setupAnswers: { purpose: "residence", residenceType: "leased" },
    });
    configureConvex({ members: [ownerMember], updateCircleSettings });
    renderCircleRoutes(
      circle,
      <Route path="/circles/:circleRef/settings" element={<CircleSettings />} />,
      { initialEntries: [`/circles/${circle.ref}/settings`] },
    );

    expect(screen.getByRole("button", { name: "Save setup answers" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Save setup answers" }));
    expect(updateCircleSettings).not.toHaveBeenCalled();
  });
});
