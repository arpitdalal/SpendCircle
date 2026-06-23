import { screen } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";

/** Arm the archive double-check for a named row (issue #207). */
export async function armArchive(user: UserEvent, itemName: string) {
  await user.click(screen.getByRole("button", { name: `Archive ${itemName}` }));
}

/** Confirm an armed archive action for a named row. */
export async function confirmArchive(user: UserEvent, itemName: string) {
  await user.click(screen.getByRole("button", { name: `Confirm archive ${itemName}` }));
}

/** Full arm → confirm archive flow. */
export async function archiveWithDoubleCheck(user: UserEvent, itemName: string) {
  await armArchive(user, itemName);
  await confirmArchive(user, itemName);
}
