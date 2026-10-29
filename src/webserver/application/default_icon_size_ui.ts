import type { AppState } from "../state/types";
import type { UiRuntimeState } from "./state";

export function syncDefaultIconSizeUi(state: AppState, runtime: UiRuntimeState): void {
  const els = runtime.els;
  const buttons = els.setDefaultIconSizeButtons || {};
  for (const size of ["small", "medium", "large"]) {
    const button = buttons[size];
    if (!button) continue;
    const active = state.defaultIconSize === size;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
    button.disabled = !state.defaultIconSizeSupported;
    button.title = state.defaultIconSizeSupported ? "" : "Update the display firmware to change the default icon size.";
  }
}
