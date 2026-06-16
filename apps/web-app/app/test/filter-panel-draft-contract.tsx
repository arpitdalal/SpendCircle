/**
 * Shared discard-on-close contract for any `FilterPanel` driven by `useFilterPanelDraft`.
 *
 * The lifecycle is identical across every panel (Search, Ledger, and any future one), so the
 * contract lives here once — driven by args — instead of being re-scaffolded per route test
 * (CLAUDE.md: one lower-level helper, not copy-pasted setup tweaked per file). Each route test
 * renders its real tree (real route, real wiring) and hands this helper the rendered surface;
 * the helper exercises the actual close mediums Base UI fires `onOpenChange(false)` for.
 */
import { screen, waitFor, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { expect } from "vitest";

/** Every medium that must collapse to a single discard-on-close transition. */
export type FilterPanelCloseMedium = "x" | "esc" | "backdrop";

export const FILTER_PANEL_CLOSE_MEDIUMS: FilterPanelCloseMedium[] = ["x", "esc", "backdrop"];

async function openFilterPanel(user: UserEvent) {
  await user.click(screen.getByRole("button", { name: /Filters/ }));
  return screen.getByRole("dialog", { name: "Filters" });
}

async function closeFilterPanel(user: UserEvent, medium: FilterPanelCloseMedium) {
  const dialog = screen.getByRole("dialog", { name: "Filters" });
  if (medium === "x") {
    await user.click(within(dialog).getByRole("button", { name: "Close filters" }));
  } else if (medium === "esc") {
    await user.keyboard("{Escape}");
  } else {
    await user.click(screen.getByTestId("filter-panel-backdrop"));
  }
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "Filters" })).not.toBeInTheDocument(),
  );
}

/**
 * Drives the full discard-on-close cycle for one close medium against a real route render:
 * open → edit the draft (Type + Status, present on every panel) → close via `medium` →
 * reopen, and assert the applied state is shown and the URL never moved. `location` is the
 * route render's URL probe; the panel must start from canonical defaults (Type=all, Status=all)
 * so the edits below are genuine, uncommitted changes.
 */
export async function assertFilterPanelDiscardsDraftOnClose({
  user,
  medium,
  location,
}: {
  user: UserEvent;
  medium: FilterPanelCloseMedium;
  location: () => string;
}) {
  const appliedUrl = location();

  const dialog = await openFilterPanel(user);
  await user.click(within(dialog).getByRole("button", { name: "Archived" }));
  await user.click(within(dialog).getByRole("button", { name: "Expense" }));
  // Draft edits alone never touch the applied URL — Apply is the only commit path.
  expect(location()).toBe(appliedUrl);

  await closeFilterPanel(user, medium);
  // Closing without Apply commits nothing.
  expect(location()).toBe(appliedUrl);

  // Reopening shows the applied state — the abandoned edits are gone, not stale.
  const reopened = await openFilterPanel(user);
  expect(within(reopened).getByRole("button", { name: "Archived" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  expect(within(reopened).getByRole("button", { name: "Expense" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
}
