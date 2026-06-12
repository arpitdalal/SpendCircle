import { screen, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";

/**
 * Drive the transaction form's category combobox (Base UI portal: options are not
 * `within(form)`). Closes the list with Escape so the rest of the form stays queryable.
 */
export async function pickTransactionFormCategory(
  user: UserEvent,
  form: HTMLElement,
  label: string,
) {
  await user.click(within(form).getByRole("combobox", { name: "Categories" }));
  await user.click(await screen.findByRole("option", { name: label }));
  await user.keyboard("{Escape}");
}
