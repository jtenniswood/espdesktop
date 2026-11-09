import { state } from "../state/app_instance";
import { WEB_UI_COLORS } from "../state/ui_tokens";
import { isRetiredLayoutCard, removeRetiredPanelRecords } from "../features/retired_cards";
import { parseGridOrder } from "../model";
import type { PanelConfigDocument } from "../model/panel_config";
import { NativePageEditorLoader, preparePageEditorDocument, restoredEditorPage, type PageEditorDocument } from "../features/page_editor";
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
  shell: Pick<ControlsShellFeature, "showBanner" | "syncConfigLockUi">;
  closeSettings(): void;
  render(): void;
  canApply(): boolean;
}): NativePageEditorLoader {
  const { native, codec, layout, runtime } = options;
  let removingOldCards = false;
  const cleanRetiredCards = (snapshot: PanelConfigDocument, prepared?: PageEditorDocument) => {
    const cleaned = structuredClone(snapshot);
    return removeRetiredPanelRecords(cleaned, codec, isRetiredLayoutCard, prepared) ? cleaned : snapshot;
  };
  const loader = new NativePageEditorLoader({
    discover: () => native.waitForDiscovery(),
    readDepth: () => native.readNavigationDepth(),
    revision: () => native.changeRevision(),
    read: signal => native.readSnapshot(signal),
    canApply: () => options.canApply() && !state.configLocked && !state.nativeTransferActive && !state.settingsDraft?.dirty && !state.settingsDraft?.isNew &&
      runtime.dragSrcPos < 0 && !state.clockBarDragItem &&
      !options.document.activeElement?.closest(".sp-card-name-input"),
    apply: (snapshot, nativeLayout) => {
      const direct = nativeLayout && preparePageEditorDocument(snapshot, layout.numSlots, codec, nativeLayout);
      const cleaned = cleanRetiredCards(snapshot, direct);
      const prepared = cleaned === snapshot && direct ? direct : preparePageEditorDocument(cleaned, layout.numSlots, codec);
      const root = parseGridOrder(cleaned.settings.button_order ?? "", layout.totalSlots, layout.gridCols, {}, layout.previewSlots);
      const editing = restoredEditorPage(state.editingSubpage, prepared);
      options.closeSettings();
      state.buttons = prepared.buttons;
      state.subpages = prepared.subpages;
      state.nativePanelDocument = prepared.source;
      state.nativePageSnapshotLoaded = true;
      native.client?.acceptSnapshot(prepared.source);
      state.nativeHasNestedPages = prepared.nested;
      state.nativeConfigReadOnly = prepared.nested && native.writableNavigationDepth() < 2;
      state.subpageRaw = {};
      state.subpageSavePending = {};
      state.pendingButtonOrderRaw = cleaned.settings.button_order ?? "";
      state.grid = root.grid;
      state.sizes = root.sizes;
      state.onColor = cleaned.settings.button_on_color || WEB_UI_COLORS.primary;
      state.editingSubpage = editing;
      state.selectedSlots = []; state.subpageSelectedSlots = [];
      state.lastClickedSlot = state.subpageLastClicked = -1;
      runtime.orderReceived = true;
      clearTimeout(runtime.migrationTimer as any);
      clearTimeout(runtime.sliderMigrationTimer as any);
      runtime.pendingSliderSubpageMigrations = {};
      options.shell.syncConfigLockUi();
      if (state.nativeConfigReadOnly)
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
