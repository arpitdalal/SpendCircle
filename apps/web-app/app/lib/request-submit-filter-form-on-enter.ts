import type { KeyboardEvent } from "react";

/**
 * Footer Apply buttons use `form="<id>"` outside the `<form>` DOM subtree. Prefer that
 * control (matches native default-button behavior for our panels) without building a
 * CSS selector from `form.id` — `CSS.escape` is absent in jsdom and ids need not be CSS-safe.
 */
function defaultSubmitButtonForForm(form: HTMLFormElement) {
  const formId = form.id;
  if (formId) {
    for (const btn of document.querySelectorAll<HTMLButtonElement>("button[type='submit']")) {
      if (btn.getAttribute("form") === formId) {
        return btn;
      }
    }
  }
  return form.querySelector<HTMLButtonElement>("button[type='submit']");
}

function isDefaultSubmitDisabled(form: HTMLFormElement) {
  return defaultSubmitButtonForForm(form)?.disabled === true;
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
  if (isDefaultSubmitDisabled(form)) {
    return;
  }
  event.preventDefault();
  form.requestSubmit();
}
