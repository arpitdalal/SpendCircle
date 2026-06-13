import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { type CircleTab, CircleTabs } from "./circle-tabs.js";

const TABS: CircleTab[] = [
  { to: "/circles/trip/", label: "Dashboard", end: true },
  { to: "/circles/trip/transactions", label: "Transactions", end: false },
  { to: "/circles/trip/members", label: "Members", end: false },
];

function renderTabs(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <CircleTabs tabs={TABS} />
    </MemoryRouter>,
  );
}

describe("CircleTabs", () => {
  it("renders every section as a link to its route under a labelled nav", () => {
    renderTabs("/circles/trip/transactions");

    const nav = screen.getByRole("navigation", { name: "Circle sections" });
    expect(within(nav).getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "href",
      "/circles/trip/",
    );
    expect(within(nav).getByRole("link", { name: "Transactions" })).toHaveAttribute(
      "href",
      "/circles/trip/transactions",
    );
    expect(within(nav).getByRole("link", { name: "Members" })).toHaveAttribute(
      "href",
      "/circles/trip/members",
    );
  });

  it("marks only the tab matching the current route as current", () => {
    renderTabs("/circles/trip/members");

    expect(screen.getByRole("link", { name: "Members" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Transactions" })).not.toHaveAttribute("aria-current");
    // `end` keeps the Dashboard (index) tab from matching every nested route.
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current");
  });
});
