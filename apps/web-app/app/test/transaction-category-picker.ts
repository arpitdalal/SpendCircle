import { screen, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";

/**
 * Drive a Base UI combobox whose options portal to `document.body`. Closes with Escape
 * so overlays do not block the rest of the UI.
 */
export async function pickCombobox(
  user: UserEvent,
  scope: HTMLElement,
  comboboxAccessibleName: string,
  optionLabel: string,
) {
  await user.click(within(scope).getByRole("combobox", { name: comboboxAccessibleName }));
  await user.click(await screen.findByRole("option", { name: optionLabel }));
  await user.keyboard("{Escape}");
}

/**
 * Transaction form category field (`aria-label` "Categories").
 */
export async function pickTransactionFormCategory(
  user: UserEvent,
  form: HTMLElement,
  label: string,
) {
  await pickCombobox(user, form, "Categories", label);
}
