import { state } from "../state/app_instance";
import { WEB_UI_COLORS } from "../state/ui_tokens";
import { isRetiredLayoutCard, removeRetiredPanelRecords } from "../features/retired_cards";
import { parseGridOrder } from "../model";
import type { PanelConfigDocument } from "../model/panel_config";
import type { NativePageLayout } from "../model/panel_config_conversion";
import { NativePageEditorLoader, preparePageEditorDocument, restoredEditorPage } from "../features/page_editor";
import type { NativePanelConfigController } from "../controllers/native_panel_config_controller";
import type { ConfigCodecFeature } from "./config_codec";
import type { ApplicationLayoutState } from "./application_context";
import type { UiRuntimeState } from "./state";
import type { ControlsShellFeature } from "./controls_shell";

export function createNativePageEditorFeature(options: {
  native: NativePanelConfigController;
  codec: ConfigCodecFeature;
  layout: ApplicationLayoutState;
  runtime: UiRuntimeState;
  document: Document;
  displayDemo?: boolean;
  shell: Pick<ControlsShellFeature, "showBanner" | "syncConfigLockUi">;
  closeSettings(): void;
  render(): void;
  canApply(): boolean;
}): NativePageEditorLoader {
  const { native, codec, layout, runtime } = options;
  let removingOldCards = false;
  const cleanRetiredCards = (snapshot: PanelConfigDocument, nativeLayout?: NativePageLayout) => {
    const cleaned = structuredClone(snapshot);
    return removeRetiredPanelRecords(cleaned, codec, isRetiredLayoutCard, nativeLayout) ? cleaned : snapshot;
  };
  const loader = new NativePageEditorLoader({
    discover: () => native.waitForDiscovery(),
    readDepth: () => native.readNavigationDepth(),
    revision: () => native.changeRevision(),
    read: signal => native.readSnapshot(signal),
    canApply: () => options.canApply() && !state.configLocked && !state.nativeTransferActive && !state.settingsDraft?.dirty && !state.settingsDraft?.isNew &&
      runtime.dragSrcPos < 0 && !state.clockBarDragItem &&
      !options.document.activeElement?.closest(".sp-card-name-input"),
    apply: (snapshot, nativeLayout, preserveSelection) => {
      const cleaned = cleanRetiredCards(snapshot, nativeLayout);
      const prepared = preparePageEditorDocument(cleaned, layout.numSlots, codec, cleaned === snapshot ? nativeLayout : undefined);
      const root = parseGridOrder(cleaned.settings.button_order ?? "", layout.totalSlots, layout.gridCols, {}, layout.previewSlots);
      const editing = restoredEditorPage(state.editingSubpage, prepared);
      options.closeSettings();
      state.buttons = prepared.buttons;
      state.subpages = prepared.subpages;
      state.nativePanelDocument = prepared.source;
      state.nativePageSnapshotLoaded = true;
      native.client?.acceptSnapshot(prepared.source, cleaned === snapshot ? nativeLayout : undefined);
      state.nativeHasNestedPages = prepared.nested;
      state.nativeConfigReadOnly = !!options.displayDemo || (prepared.nested && native.writableNavigationDepth() < 2);
      state.subpageRaw = {};
      state.subpageSavePending = {};
      state.pendingButtonOrderRaw = cleaned.settings.button_order ?? "";
      state.grid = root.grid;
      state.sizes = root.sizes;
      state.onColor = cleaned.settings.button_on_color || WEB_UI_COLORS.primary;
      const activeSubpageGrid = editing === state.editingSubpage && editing
        ? prepared.subpages[editing]?.grid ?? [] : [];
      state.editingSubpage = editing;
      state.selectedSlots = preserveSelection ? state.selectedSlots.filter(slot => root.grid.includes(slot)) : [];
      state.subpageSelectedSlots = preserveSelection
        ? state.subpageSelectedSlots.filter(slot => activeSubpageGrid.includes(slot)) : [];
      if (!preserveSelection || !root.grid.includes(state.lastClickedSlot)) state.lastClickedSlot = -1;
      if (!preserveSelection || !activeSubpageGrid.includes(state.subpageLastClicked)) state.subpageLastClicked = -1;
      runtime.orderReceived = true;
      clearTimeout(runtime.migrationTimer as any);
      clearTimeout(runtime.sliderMigrationTimer as any);
      runtime.pendingSliderSubpageMigrations = {};
      options.shell.syncConfigLockUi();
      if (state.nativeConfigReadOnly && !options.displayDemo)
        options.shell.showBanner("This firmware can display nested pages, but cannot save changes to them.", "warning");
      if (cleaned !== snapshot && !state.nativeConfigReadOnly && !removingOldCards) {
        // Reapply the cleanup to the current device generation so concurrent
        // changes to neighbouring cards survive the write.
        const pending = native.schedule(document => cleanRetiredCards(document), true);
        if (pending) {
          removingOldCards = true;
          void pending.then(result => {
            removingOldCards = false;
            if ((result === "saved" || result === "mirror-failed") && !state.configLocked) loader.refreshAfterChange();
          });
        }
      }
      options.render();
    },
    loading: active => {
      state.nativeConfigLoading = active && state.nativePanelDocument === null;
      options.shell.syncConfigLockUi();
    },
    failed: () => {
      if (!state.nativePanelDocument) state.nativeConfigReadOnly = true;
      options.shell.showBanner("Could not load the saved pages. Reload before editing.", "error");
    },
  });
  return loader;
}
