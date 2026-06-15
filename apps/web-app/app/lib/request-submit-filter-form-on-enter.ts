import type { KeyboardEvent } from "react";

function isExplicitSubmitDisabled(form: HTMLFormElement) {
  const linked = document.querySelector<HTMLButtonElement>(
    `button[type="submit"][form="${CSS.escape(form.id)}"]`,
  );
  const inside = form.querySelector<HTMLButtonElement>(`:scope button[type="submit"]`);
  const control = linked ?? inside;
  return control?.disabled === true;
}

/**
 * Enter in text-like inputs should apply filter panels. Native implicit submission
 * does not run in jsdom; `requestSubmit` matches real browsers when the default
 * submit control is enabled. Skips when `defaultPrevented` (e.g. combobox handling).
 */
export function requestSubmitFilterFormOnEnter(event: KeyboardEvent<HTMLFormElement>) {
  if (event.key !== "Enter" || event.defaultPrevented || event.nativeEvent.isComposing) {
    return;
  }
  const form = event.currentTarget;
  const target = event.target;
  if (!(target instanceof HTMLElement) || !form.contains(target)) {
    return;
  }
  if (target instanceof HTMLButtonElement) {
    return;
  }
  if (target instanceof HTMLTextAreaElement) {
    return;
  }
  if (!(target instanceof HTMLInputElement)) {
    return;
  }
  const skipTypes = new Set(["button", "submit", "reset", "checkbox", "radio", "file", "image"]);
  if (skipTypes.has(target.type)) {
    return;
  }
  if (isExplicitSubmitDisabled(form)) {
    return;
  }
  event.preventDefault();
  form.requestSubmit();
}
