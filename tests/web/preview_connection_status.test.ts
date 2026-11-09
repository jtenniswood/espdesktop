import { initializeAppState, state } from "../../src/webserver/state/app_instance";
import { initializeDeviceConfig } from "../../src/webserver/device_config";
import { createControlsShellFeature } from "../../src/webserver/application/controls_shell";
import { createButtonSettingsSelectionFeature } from "../../src/webserver/application/button_settings_selection";

export function runPreviewConnectionStatusTests(): void {
  const globals = globalThis as any;
  globals.__ESPDESKTOP_DEFAULT_DEVICE_ID__ = "test";
  globals.__ESPDESKTOP_DEVICE_PROFILES__ = { test: { slots: 9 } };
  globals.__ESPDESKTOP_TIMEZONE_OPTIONS__ = [];
  initializeDeviceConfig(); initializeAppState();
  Object.assign(state, { configLocked: false, nativeConfigLoading: false, nativeConfigReadOnly: false, nativeTransferActive: false });
  const check = (value: unknown, message: string) => { if (!value) throw new Error(message); };
  const classes = new Set<string>();
  let disabled = "false";
  const apply = { disabled: false, textContent: "" };
  const hint = { textContent: "", style: { display: "" } };
  const runtime = { els: {
    root: { classList: { toggle(name: string, enabled: boolean) { enabled ? classes.add(name) : classes.delete(name); } }, querySelectorAll: () => [apply] },
    previewMain: { setAttribute(_name: string, value: string) { disabled = value; } }, previewHint: hint,
  } } as any;
  let selection: ReturnType<typeof createButtonSettingsSelectionFeature>;
  const shell = createControlsShellFeature(runtime, { state, document: {}, updatePreviewHint: () => selection.updatePreviewHint() } as any);
  selection = createButtonSettingsSelectionFeature(runtime, {} as any, {} as any, shell, {} as any,
    { ctx: () => ({ selected: [] }) } as any, {} as any, { document: {}, fields: {} } as any);
  shell.syncConfigLockUi();
  check(!shell.isConfigLocked() && !classes.has("sp-config-locked"), "connected preview starts editable");
  state.nativeTransferActive = true;
  shell.syncConfigLockUi();
  check(shell.isConfigLocked() && disabled === "true" && apply.disabled, "pending cut still prevents overlapping edits");
  check(classes.has("sp-config-busy") && !classes.has("sp-config-locked"), "pending cut preserves the connected appearance");
  check(hint.textContent === "Updating cards…", "pending cut explains the pause without claiming disconnection");
  state.configLocked = true;
  shell.syncConfigLockUi();
  check(classes.has("sp-config-locked") && hint.textContent.includes("reconnects"), "real connection loss takes priority during a transfer");
  state.nativeTransferActive = false;
  shell.syncConfigLockUi();
  check(classes.has("sp-config-locked") && !classes.has("sp-config-busy") && shell.isConfigLocked(), "finishing a transfer cannot hide a real disconnection");
  state.configLocked = false;
  shell.syncConfigLockUi();
  check(!shell.isConfigLocked() && disabled === "false" && !apply.disabled && hint.style.display === "none", "connected preview returns to normal after completion");
}
