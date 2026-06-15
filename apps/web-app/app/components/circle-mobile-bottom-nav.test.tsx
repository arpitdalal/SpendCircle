import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Outlet, Route } from "react-router";
import { describe, expect, it } from "vitest";
import { CircleMobileBottomNav } from "~/components/circle-mobile-bottom-nav.js";
import type { CircleOutletContext } from "~/routes/layouts/circle-layout.js";
import { makeCircleView, renderRoutes } from "~/test/convex-react.js";

const circle = makeCircleView();

function renderMobileNav(initialPath: string) {
  return renderRoutes(
    <Route element={<Outlet context={{ circle } satisfies CircleOutletContext} />}>
      <Route path="*" element={<CircleMobileBottomNav circle={circle} />} />
    </Route>,
    { initialEntries: [initialPath] },
  );
}

describe("CircleMobileBottomNav", () => {
  it("links Dashboard, Transactions, and Search to canonical circle routes", () => {
    renderMobileNav(`/circles/${circle.ref}`);
    const nav = screen.getByTestId("circle-mobile-bottom-nav");
    expect(within(nav).getByRole("link", { name: "Dashboard", hidden: true })).toHaveAttribute(
      "href",
      `/circles/${circle.ref}`,
    );
    expect(within(nav).getByRole("link", { name: "Transactions", hidden: true })).toHaveAttribute(
      "href",
      `/circles/${circle.ref}/transactions`,
    );
    expect(within(nav).getByRole("link", { name: "Search", hidden: true })).toHaveAttribute(
      "href",
      `/circles/${circle.ref}/search`,
    );
  });

  it("opens More and lists Categories and Members with canonical hrefs", async () => {
    const user = userEvent.setup();
    renderMobileNav(`/circles/${circle.ref}`);
    await user.click(screen.getByRole("button", { name: "More" }));
    const dialog = screen.getByRole("dialog", { name: "More" });
    expect(within(dialog).getByRole("link", { name: "Categories" })).toHaveAttribute(
      "href",
      `/circles/${circle.ref}/categories`,
    );
    expect(within(dialog).getByRole("link", { name: "Members" })).toHaveAttribute(
      "href",
      `/circles/${circle.ref}/members`,
    );
  });

  it("sets aria-current=page on More when the route is Categories", () => {
    renderMobileNav(`/circles/${circle.ref}/categories`);
    expect(screen.getByRole("button", { name: "More" })).toHaveAttribute("aria-current", "page");
  });

  it("navigates from the sheet and closes the dialog", async () => {
    const user = userEvent.setup();
    const view = renderMobileNav(`/circles/${circle.ref}`);
    await user.click(screen.getByRole("button", { name: "More" }));
    await user.click(
      within(screen.getByRole("dialog", { name: "More" })).getByRole("link", { name: "Members" }),
    );
    expect(view.location()).toBe(`/circles/${circle.ref}/members`);
    expect(screen.queryByRole("dialog", { name: "More" })).not.toBeInTheDocument();
  });
});
