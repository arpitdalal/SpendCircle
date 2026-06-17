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

/**
 * Inline-create a Category in the Transaction form combobox (CAT-3).
 */
export async function inlineCreateTransactionFormCategory(
  user: UserEvent,
  form: HTMLElement,
  name: string,
) {
  const combo = within(form).getByRole("combobox", { name: "Categories" });
  await user.click(combo);
  await user.clear(combo);
  await user.type(combo, name);
  await user.click(await screen.findByRole("button", { name: `Create "${name}"` }));
  await user.keyboard("{Escape}");
}
