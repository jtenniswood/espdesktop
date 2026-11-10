import { updateEditorPage } from "../model/page_edit";
import type { CardConfig } from "../contracts/types";
import type { NativeLayoutDraft, NativePageEdit } from "../model/native_layout_draft";
import {
  createNativePanelConfigClient,
  updateNativePanelConfigDocument,
  NativePanelConfigCompatibilityError,
  NATIVE_BACKUP_UPDATE_REQUIRED_MESSAGE,
  nativeBackupHasInactiveRecords,
  type NativePanelConfigClient,
  type NativePanelConfigFetch,
  type NativePanelConfigSaveResult,
  type NativePanelConfigSnapshot,
  type NativePanelConfigUpdate,
} from "../features/native_panel_config";
import type { PanelConfigDocument } from "../model";
import { pageDepth, parentPageKey } from "../model/page_keys";

export type { NativePanelConfigUpdate } from "../features/native_panel_config";
export type NativePanelConfigSaveOutcome = NativePanelConfigSaveResult | "legacy-fallback";

export interface NativePanelConfigControllerDependencies {
  readonly fetch: NativePanelConfigFetch | null;
  readonly deviceProfile: () => string;
  readonly slotCount: () => number;
  readonly entityName: (name: string) => string;
  readonly entityNameForSlot: (name: string, slot: number) => string;
  readonly normalizeHexColor: (value: string, fallback: string) => string;
  readonly showBanner: (message: string, level: "error") => void;
  readonly delay: (callback: () => void, milliseconds: number) => unknown;
  readonly saved?: (document: PanelConfigDocument) => void;
}

/** Owns native configuration discovery and serialised document writes. */
export class NativePanelConfigController {
  private client_: NativePanelConfigClient | null;
  private saveQueue_: Promise<NativePanelConfigSaveOutcome> = Promise.resolve("saved");
  private revision_ = 0;
  private saveAttemptId_ = 0;
  private legacyFallback_ = false;
  private retryDelayMs_ = 250;
  // P4 panels can still be completing their deferred native-configuration
  // setup when the web editor first loads. Allow enough time for that API to
  // become ready before deciding that the firmware only supports legacy
  // entity configuration.
  private maxDiscoveryRetries_ = 40;

  constructor(private readonly dependencies: NativePanelConfigControllerDependencies) {
    this.client_ = dependencies.fetch ? createNativePanelConfigClient(dependencies.fetch) : null;
  }

  get client(): NativePanelConfigClient | null { return this.client_; }
  set client(value: NativePanelConfigClient | null) {
    this.client_ = value;
    this.legacyFallback_ = false;
  }
  get saveQueue(): Promise<NativePanelConfigSaveOutcome> { return this.saveQueue_; }
  set saveQueue(value: Promise<NativePanelConfigSaveOutcome>) { ++this.saveAttemptId_; this.saveQueue_ = value; }
  // Snapshot/backup reads wrap the queue without creating a new write attempt.
  get saveAttemptId(): number { return this.saveAttemptId_; }
  get legacyFallback(): boolean { return this.legacyFallback_; }
  set legacyFallback(value: boolean) { this.legacyFallback_ = value; }
  get retryDelayMs(): number { return this.retryDelayMs_; }
  set retryDelayMs(value: number) { this.retryDelayMs_ = value; }
  get maxDiscoveryRetries(): number { return this.maxDiscoveryRetries_; }
  set maxDiscoveryRetries(value: number) { this.maxDiscoveryRetries_ = value; }

  begin(): Promise<boolean> {
    return this.client_ ? this.client_.discover() : Promise.resolve(false);
  }

  async readSettings(): Promise<Record<string, string>> {
    await this.waitForDiscovery();
    const document = await this.client_?.load();
    return document ? { ...document.settings } : {};
  }

  writeSetting(key: string, value: string): Promise<NativePanelConfigSaveOutcome> | null {
    if (!key || key.length > 63) return null;
    return this.schedule(this.withNativeEdit(current => updateNativePanelConfigDocument(
      current, this.dependencies.deviceProfile(), "settings", key, value,
    ), draft => draft.writeSetting(key, value)));
  }

  private withNativeEdit(update: NativePanelConfigUpdate, edit: (draft: NativeLayoutDraft) => void): NativePanelConfigUpdate {
    return Object.assign(update, {
      checkAcceptedLayout: true,
      editNative: (draft: NativeLayoutDraft) => {
        if (draft.deviceProfile !== this.dependencies.deviceProfile()) throw new Error("Device profile changed");
        edit(draft);
      },
    });
  }

  maxConfigValueBytes(): number | null {
    return this.client_?.maxConfigValueBytes() ?? null;
  }

  supported(): boolean {
    return this.client_?.supported() ?? false;
  }

  homeAssistantSupportEnabled(): boolean {
    return this.client_?.homeAssistantSupportEnabled() ?? false;
  }

  private atomicUpdates_: NativePanelConfigUpdate[] | null = null;

  beginAtomicEdit(): { finish(ok: boolean): Promise<boolean>; cancel(): void } | undefined {
    if (this.writableNavigationDepth() !== 2) return undefined;
    if (this.atomicUpdates_) throw new Error("A page save is already in progress");
    const updates: NativePanelConfigUpdate[] = [];
    this.atomicUpdates_ = updates;
    let finished = false;
    const cancel = () => { if (this.atomicUpdates_ === updates) this.atomicUpdates_ = null; finished = true; };
    return {
      cancel,
      finish: async ok => {
        if (finished) return false;
        cancel();
        if (!ok) return false;
        if (!updates.length) return true;
        const update: NativePanelConfigUpdate = current => updates.reduce((document, apply) => apply(document), current);
        if (updates.every(apply => apply.editNative)) {
          update.editNative = (draft, current) => updates.forEach(apply => apply.editNative!(draft, current));
          update.checkAcceptedLayout = updates.every(apply => apply.checkAcceptedLayout);
        }
        const result = await this.schedule(update);
        return result === "saved" || result === "mirror-failed";
      },
    };
  }

  markLocalEdit(): void { ++this.revision_; }
  changeRevision(): number { return this.revision_; }
  readNavigationDepth(): number { return this.client_?.readNavigationDepth() ?? 1; }
  writableNavigationDepth(): number { return this.client_?.writableNavigationDepth() ?? 1; }

  readSnapshot(signal?: AbortSignal): Promise<NativePanelConfigSnapshot | null> {
    const precedingSave = this.saveQueue_, client = this.client_;
    const read = precedingSave.then(() => client?.readSnapshot(this.dependencies.deviceProfile(), signal) ?? null);
    // A refresh may recover visible state after a failed save, but cannot erase
    // that failure from the queue or race with the next edit.
    this.saveQueue_ = read.then(() => precedingSave, () => precedingSave);
    return read;
  }

  private report(result: NativePanelConfigSaveOutcome): NativePanelConfigSaveOutcome {
    if (result === "conflict") {
      this.dependencies.showBanner("Configuration changed in another browser. Reload before saving again.", "error");
    } else if (result === "mirror-failed") {
      this.dependencies.showBanner("The configuration saved, but its older-firmware copy did not. Do not downgrade this panel yet.", "error");
    } else if (result === "authentication-required") {
      this.dependencies.showBanner("Sign in to save the configuration, enable web_server_auth, or update the panel firmware.", "error");
    } else if (result === "too-large") {
      this.dependencies.showBanner("Configuration exceeds this panel's storage capacity. Remove unused cards or subpages, or shorten labels.", "error");
    } else if (result === "nested-pages-unavailable") {
      this.dependencies.showBanner("Nested pages cannot be saved on this firmware. No settings were changed.", "error");
    } else if (result === "firmware-update-required") {
      this.dependencies.showBanner(NATIVE_BACKUP_UPDATE_REQUIRED_MESSAGE, "error");
    } else if (result === "failed") {
      this.dependencies.showBanner("Could not save the configuration. Check the connection and try again.", "error");
    }
    return result;
  }

  async waitForDiscovery(attempts = 0): Promise<boolean | "legacy-fallback" | "failed"> {
    if (this.legacyFallback_) return "legacy-fallback";
    if (this.client_?.confirmedUnsupported()) {
      this.legacyFallback_ = true;
      return "legacy-fallback";
    }
    const supported = await this.begin();
    if (supported) {
      this.legacyFallback_ = false;
      return true;
    }
    if (this.client_?.confirmedUnsupported()) {
      // Discovery has completed and confirmed that the native contract is not
      // available. Callers can now safely use the legacy entity path.
      this.legacyFallback_ = true;
      return "legacy-fallback";
    }
    if (!this.client_?.retryable()) return "failed";
    if (attempts >= this.maxDiscoveryRetries_) {
      // Only a never-native, missing endpoint can identify older firmware.
      // Busy startup/resource responses and a known-native panel restarting
      // must not route edits into its compatibility mirror.
      if (!this.client_?.canUseLegacyFallback()) return "failed";
      this.legacyFallback_ = true;
      return "legacy-fallback";
    }
    await new Promise<void>((resolve) => { this.dependencies.delay(resolve, this.retryDelayMs_); });
    return this.waitForDiscovery(attempts + 1);
  }

  schedule(update: NativePanelConfigUpdate, skipUnchanged = false,
      nativeBackup?: Uint8Array): Promise<NativePanelConfigSaveOutcome> | null {
    if (this.atomicUpdates_) {
      if (nativeBackup) return Promise.resolve(this.report("failed"));
      ++this.revision_;
      this.atomicUpdates_.push(update);
      return Promise.resolve("saved");
    }
    const client = this.client_;
    if (!client) return null;
    ++this.revision_;
    ++this.saveAttemptId_;
    const save = this.saveQueue_
      .then(async () => this.supported() || await this.waitForDiscovery())
      .then(async (supported) => supported === "legacy-fallback" || supported === "failed"
        ? supported
        : supported ? client.save(update, skipUnchanged, nativeBackup) : "unsupported" as const)
      .then(async (result) => {
        if (result !== "unsupported" || !client.retryable()) return result;
        const supported = await this.waitForDiscovery();
        if (supported === "legacy-fallback" || supported === "failed") return supported;
        return supported ? client.save(update, skipUnchanged, nativeBackup) : result;
      })
      .then((result) => {
        const document = client.lastDocument();
        if ((result === "saved" || result === "mirror-failed") && document) this.dependencies.saved?.(document);
        return this.report(result === "unsupported" ? "failed" : result);
      }, () => this.report("failed"));
    this.saveQueue_ = save;
    return save;
  }

  readForBackup(): Promise<Uint8Array | null> {
    const client = this.client_;
    const precedingSave = this.saveQueue_;
    const read = precedingSave.then(async (outcome) => {
      if (outcome !== "saved" && outcome !== "mirror-failed" && outcome !== "legacy-fallback") {
        throw new Error("The previous configuration change did not save.");
      }
      if (!client) return null;
      const available = this.supported() || await this.waitForDiscovery();
      if (available === "legacy-fallback") return null;
      if (available !== true) throw new Error("Configuration discovery is unavailable.");
      return client.readForBackup(this.dependencies.deviceProfile());
    });
    // Later edits wait for this snapshot too. A failed read must neither
    // poison the save queue nor erase a preceding failed save outcome.
    this.saveQueue_ = read.then(() => precedingSave, () => precedingSave);
    return read;
  }

  writeText(name: string, value: string): Promise<NativePanelConfigSaveOutcome> | null | false {
    if (name === this.dependencies.entityName("button_order")) {
      return this.writeSetting("button_order", value);
    }
    if (name === this.dependencies.entityName("button_on_color")) {
      const color = this.dependencies.normalizeHexColor(value, "");
      if (!color) return false;
      return this.writeSetting("button_on_color", color);
    }
    for (let slot = 1; slot <= this.dependencies.slotCount(); slot += 1) {
      if (name === this.dependencies.entityNameForSlot("button_config", slot)) {
        return this.schedule((current) => updateNativePanelConfigDocument(
          current, this.dependencies.deviceProfile(), "buttons", slot, value,
        ));
      }
    }
    return false;
  }

  writeButtonAndOrder(slot: number, value: string | (() => string), order?: string,
      card?: CardConfig): Promise<NativePanelConfigSaveOutcome> | null | false {
    if (!Number.isInteger(slot) || slot < 1 || slot > this.dependencies.slotCount()) return false;
    const update: NativePanelConfigUpdate = current => {
      const withButton = updateNativePanelConfigDocument(
        current, this.dependencies.deviceProfile(), "buttons", slot, typeof value === "string" ? value : value(),
      );
      return order === undefined ? withButton : updateNativePanelConfigDocument(
        withButton, this.dependencies.deviceProfile(), "settings", "button_order", order,
      );
    };
    return this.schedule(card ? this.withNativeEdit(update, draft => {
      draft.writeRootCard(slot, card);
      if (order !== undefined) draft.writeSetting("button_order", order);
    }) : update);
  }

  writeDocument(document: PanelConfigDocument, nativeBackup?: Uint8Array): Promise<NativePanelConfigSaveOutcome> | null {
    if (!this.client_) return null;
    return this.schedule((current) => {
      if (current.deviceProfile !== document.deviceProfile) {
        throw new Error("The backup targets a different device profile.");
      }
      if (!this.client_?.preservesInactiveRecords() &&
          nativeBackupHasInactiveRecords(document, this.dependencies.slotCount())) {
        throw new NativePanelConfigCompatibilityError(NATIVE_BACKUP_UPDATE_REQUIRED_MESSAGE);
      }
      return document;
    }, false, nativeBackup);
  }

  writeSubpage(slot: number, value: string | (() => string),
      page?: NativePageEdit | null): Promise<NativePanelConfigSaveOutcome> | false | null {
    try {
      const depth = pageDepth(slot);
      if (!depth || (depth === 1 ? slot : parentPageKey(slot)) > this.dependencies.slotCount()) return false;
    } catch { return false; }
    const update: NativePanelConfigUpdate = current => {
      if (current.deviceProfile !== this.dependencies.deviceProfile()) throw new Error("Device profile changed");
      return updateEditorPage(current, slot, typeof value === "string" ? value : value());
    };
    return this.schedule(page === undefined ? update : this.withNativeEdit(update, draft => draft.writePage(slot, page)));
  }

}
