import type { CardConfig } from "../contracts/types";
import { CARD_CONFIG_FIELDS, cloneCardConfig } from "../model/card";
import { isRetiredWebApp, removeRetiredPanelRecords } from "../features/retired_cards";
import { state } from "../state/app_instance";
import * as EspDesktopModel from "../model";
import { ENTITY_CATALOG } from "../generated/entity_catalog";
import type { NativePanelConfigController } from "../controllers/native_panel_config_controller";
import type { ConfigCodecFeature } from "./config_codec";
import type { UiRuntimeState } from "./state";
import type { ApplicationLayoutState } from "./application_context";
import type { EntityStateFeature } from "./entity_state";
import type { ControlsShellFeature } from "./controls_shell";
import type { ApplicationApiFeature } from "./api";
import {
    cardBackgroundImage,
    normalizeCardBackgroundImageId,
    setCardBackgroundImage,
} from "./config_option_core";

type PersistenceCodec = Pick<ConfigCodecFeature, "serializeButtonConfig" | "serializeSubpageConfig" | "parseButtonConfig" | "parseSubpageConfig" |
    "buttonConfigFields" | "subpageSerializedOrder">;

export interface ConfigPersistenceFeature {
    connectCodec(codec: PersistenceCodec): void;
    connectRequestApi(requestApi: ApplicationApiFeature): void;
    connectFocusRegistrationPublisher(publish: () => void): void;
    subpageEntityKeys(): string[];
    buttonConfigByteLimit(): number;
    writableNavigationDepth(): number;
    beginAtomicEdit?(): { finish(ok: boolean): Promise<boolean>; cancel(): void } | undefined;
    subpageConfigFits(value: string): boolean;
    saveButtonConfig(slot: number): Promise<any>;
    saveButtonConfigAndOrder(slot: number, order: string): Promise<any>;
    saveSubpageEntity(slot: number): unknown;
    clearCardImageReferences(id: unknown, persistChanges?: boolean): CardImageReferenceSnapshot;
    subpageChunkShouldPost(slot?: any, keys?: any, chunks?: any, index?: any, previousPendingChunks?: any): boolean;
    scheduleSliderSubpageMigration(slot?: any, cleanedValue?: string): void;
}

export interface CardImageReferenceSnapshot {
    changed: number;
    restore(): void;
    persist(): void;
}

export function createConfigPersistenceFeature(
    nativePanelConfig: NativePanelConfigController | null = null,
    runtime: UiRuntimeState,
    layout: ApplicationLayoutState,
    entityState: Pick<EntityStateFeature, "entityName" | "entityNameForSlot" | "hasRememberedPostPath">,
    shell: Pick<ControlsShellFeature, "showBanner"> & Partial<Pick<ControlsShellFeature, "syncConfigLockUi">>,
): ConfigPersistenceFeature {
    const { entityName, entityNameForSlot, hasRememberedPostPath } = entityState;
    const { showBanner } = shell;
    let codec: PersistenceCodec | undefined;
    let requestApi: ApplicationApiFeature | undefined;
    let publishFocusRegistrations: (() => void) | undefined;
    function connectCodec(value: PersistenceCodec) {
        codec = value;
    }
    function connectRequestApi(value: ApplicationApiFeature) {
        requestApi = value;
    }
    function connectFocusRegistrationPublisher(value: () => void) {
        publishFocusRegistrations = value;
    }
    function afterSuccessfulSave(result: any): any {
        const succeeded = result === "saved" || (result !== null && result !== undefined &&
            result !== "failed" && result !== "unsupported" &&
            !(typeof result === "object" && result.ok === false));
        if (succeeded) publishFocusRegistrations?.();
        return result;
    }
    function publishAfter(result: any): any {
        return result && typeof result.then === "function"
            ? result.then(afterSuccessfulSave)
            : afterSuccessfulSave(result);
    }
    function requests(): ApplicationApiFeature {
        if (!requestApi)
            throw new Error("Configuration persistence used before the application API was connected");
        return requestApi;
    }
    function serializeButtonConfig(button: any) {
        if (!codec)
            throw new Error("Configuration persistence used before the codec was connected");
        return codec.serializeButtonConfig(button);
    }
    function savedCard(button: CardConfig): CardConfig {
        const fields: string[] = codec!.buttonConfigFields(button);
        return Object.fromEntries(CARD_CONFIG_FIELDS.map((key, index) => [key, fields[index] ?? ""])) as unknown as CardConfig;
    }
    function serializeSubpageConfig(subpage: any) {
        if (!codec)
            throw new Error("Configuration persistence used before the codec was connected");
        return codec.serializeSubpageConfig(subpage);
    }
    function queueNativeSave(nativeSave: Promise<any>, legacyFallback: () => any) {
        var api: any = requests();
        api.postQueue = api.postQueue.then(function () { return nativeSave; }).then(function (result: any) {
            if (result === "legacy-fallback")
                return legacyFallback();
            if (result !== "saved")
                api.postQueueError = true;
            return result;
        });
        return api.postQueue;
    }
    function buttonConfigByteLimit(): number {
        return nativePanelConfig?.maxConfigValueBytes() ?? 255;
    }
    function subpageConfigFits(value: string): boolean {
        var nativeLimit = nativePanelConfig?.maxConfigValueBytes();
        return nativeLimit != null
            ? new TextEncoder().encode(value).length <= nativeLimit
            : !!EspDesktopModel.splitSubpageConfigChunks(value, subpageEntityKeys().length, 255);
    }
    function rejectOversizedSubpage() {
        requests().postQueueError = true;
        showBanner("Subpage is too large to save. Update the panel firmware for more space, or shorten labels and entity IDs.", "error");
        return Promise.resolve("failed");
    }
    function retireSavedWebApps(legacyFallback: () => any) {
        if (!codec || !nativePanelConfig) return null;
        const configCodec = codec;
        const cleanup = nativePanelConfig.schedule(current => {
            removeRetiredPanelRecords(current, configCodec, isRetiredWebApp);
            return current;
        });
        return cleanup ? publishAfter(queueNativeSave(cleanup, legacyFallback)) : null;
    }
    // ── Config Post API ───────────────────────────────────────────────────
    function saveButtonConfig(this: any, slot?: any) {
        const b = cloneCardConfig(state.buttons[slot - 1]);
        if (nativePanelConfig?.writableNavigationDepth() === 2 && !isRetiredWebApp(b.type)) {
            const value = () => serializeButtonConfig(b);
            const pending = nativePanelConfig.writeButtonAndOrder(Number(slot), value, undefined, savedCard(b));
            if (pending) return publishAfter(queueNativeSave(pending, () => requests().postTextLegacy(entityNameForSlot("button_config", slot), value())));
        }
        var value: any = serializeButtonConfig(b);
        if (isRetiredWebApp(b?.type)) {
            const cleanup = retireSavedWebApps(() => requests().postTextLegacy(entityNameForSlot("button_config", slot), value));
            if (cleanup) return cleanup;
        }
        return publishAfter(requests().postText(entityNameForSlot("button_config", slot), value));
    }
    function saveButtonConfigAndOrder(this: any, slot?: any, order?: any) {
        const b = cloneCardConfig(state.buttons[slot - 1]);
        const value = () => serializeButtonConfig(b);
        const card = nativePanelConfig?.writableNavigationDepth() === 2 ? savedCard(b) : undefined;
        var nativeSave: any = nativePanelConfig
            ? nativePanelConfig.writeButtonAndOrder(Number.parseInt(String(slot), 10), value, String(order || ""), card)
            : null;
        function saveLegacy(this: any) {
            var api: any = requests();
            return api.postTextLegacy(entityNameForSlot("button_config", slot), value())
                .then(function () { return api.postTextLegacy(entityName("button_order"), order); });
        }
        if (nativeSave)
            return publishAfter(queueNativeSave(nativeSave, saveLegacy));
        var api: any = requests();
        api.postQueue = api.postQueue.then(saveLegacy);
        return publishAfter(api.postQueue);
    }
    function clearCardImageReferences(this: any, id?: any, persistChanges?: any): CardImageReferenceSnapshot {
        const shouldPersist = persistChanges !== false;
        const imageId = normalizeCardBackgroundImageId(id);
        const entries: Array<{ button: any; imageId: string }> = [];
        const mainSlots: number[] = [];
        const subpageKeys: string[] = [];
        const seen = new Set<any>();
        const snapshot: CardImageReferenceSnapshot = {
            changed: 0,
            restore() {
                entries.forEach((entry) => setCardBackgroundImage(entry.button, entry.imageId));
            },
            persist() {
                mainSlots.forEach((slot) => saveButtonConfig(slot));
                subpageKeys.forEach((key) => saveSubpageEntity(key));
            },
        };
        if (!imageId)
            return snapshot;

        const clearButtons = (buttons: any[], saveSlot?: (index: number) => void): number => {
            let changed = 0;
            (buttons || []).forEach((button, index) => {
                if (cardBackgroundImage(button) !== imageId)
                    return;
                if (!seen.has(button)) {
                    seen.add(button);
                    entries.push({ button, imageId: cardBackgroundImage(button) });
                }
                setCardBackgroundImage(button, "");
                changed++;
                saveSlot?.(index);
            });
            return changed;
        };

        snapshot.changed += clearButtons(state.buttons, shouldPersist ? (index) => {
            const slot = index + 1;
            saveButtonConfig(slot);
            mainSlots.push(slot);
        } : undefined);
        if (state.settingsDraft?.button)
            snapshot.changed += clearButtons([state.settingsDraft.button]);
        Object.keys(state.subpages || {}).forEach((key) => {
            const changed = clearButtons(state.subpages[key]?.buttons || []);
            snapshot.changed += changed;
            if (changed && shouldPersist) {
                saveSubpageEntity(key);
                subpageKeys.push(key);
            }
        });
        return snapshot;
    }
    function subpageEntityKeys(this: any) {
        var keys: any = ENTITY_CATALOG.groups.subpage_slot || [];
        var count: any = (layout.config.features && layout.config.features.subpageConfigChunks) || keys.length;
        count = Math.max(1, Math.min(keys.length, parseInt(count, 10) || keys.length));
        return keys.slice(0, count);
    }
    const SUBPAGE_RAW_CHUNK_FIELDS = ["main", "ext", "ext2", "ext3", "ext4", "ext5", "ext6", "ext7"];
    function subpageChunkShouldPost(this: any, slot?: any, keys?: any, chunks?: any, index?: any, previousPendingChunks?: any) {
        if (chunks[index] || index === 0)
            return true;
        var chunkName: any = entityNameForSlot(keys[index], slot);
        if (hasRememberedPostPath("text", chunkName, []))
            return true;
        var raw: any = state.subpageRaw[slot];
        var rawField: any = SUBPAGE_RAW_CHUNK_FIELDS[index];
        return !!((raw && rawField && raw[rawField]) ||
            (previousPendingChunks && previousPendingChunks[index]));
    }
    function saveSubpageEntityLegacy(this: any, slot?: any, full?: any, direct?: any) {
        var keys: any = subpageEntityKeys();
        var chunks: any = EspDesktopModel.splitSubpageConfigChunks(full, keys.length, 255);
        if (!chunks)
            return rejectOversizedSubpage();
        var previousPendingChunks: any = EspDesktopModel.splitSubpageConfigChunks(state.subpageSavePending[slot] || "", keys.length, 255) || [];
        state.subpageSavePending[slot] = full;
        var directPosts: any = [];
        for (var ki: any = 0; ki < keys.length; ki++) {
            var chunkName: any = entityNameForSlot(keys[ki], slot);
            var chunk: any = chunks[ki] || "";
            if (!subpageChunkShouldPost(slot, keys, chunks, ki, previousPendingChunks))
                continue;
            if (direct)
                directPosts.push(requests().postTextLegacy(chunkName, chunk));
            else
                requests().postText(chunkName, chunk);
        }
        if (direct)
            return Promise.all(directPosts).then(function (results: any[]) {
                return results.every(function (result: any) {
                    return result !== null && result !== undefined &&
                        (typeof result.ok !== "boolean" || result.ok);
                }) ? "saved" : "failed";
            });
    }
    function saveSubpageEntity(this: any, slot?: any, cleanedValue?: string) {
        delete runtime.pendingSliderSubpageMigrations?.[slot];
        var sp: any = state.subpages[slot];
        if (cleanedValue === undefined && nativePanelConfig?.writableNavigationDepth() === 2) {
            const snapshot = sp ? structuredClone(sp) : null;
            const order: string[] = snapshot ? codec!.subpageSerializedOrder(snapshot) : [];
            const cards = (snapshot?.buttons ?? []).map(savedCard);
            const page = order.length || cards.length ? { order: order.join(","), cards } : null;
            const value = () => snapshot ? serializeSubpageConfig(snapshot) : "";
            const pending = nativePanelConfig.writeSubpage(Number(slot), value, page);
            if (pending) return publishAfter(queueNativeSave(pending, () => saveSubpageEntityLegacy(slot, value(), true)));
        }
        var full: any = cleanedValue ?? (sp ? serializeSubpageConfig(sp) : "");
        if (!subpageConfigFits(full)) return rejectOversizedSubpage();
        if (cleanedValue !== undefined) {
            const cleanup = retireSavedWebApps(() => saveSubpageEntityLegacy(slot, full, true));
            return cleanup ?? publishAfter(saveSubpageEntityLegacy(slot, full, true));
        }
        var nativeSave: any = nativePanelConfig
            ? nativePanelConfig.writeSubpage(Number.parseInt(String(slot), 10), full)
            : null;
        if (nativeSave) {
            state.subpageSavePending[slot] = full;
            var api: any = requests();
            api.postQueue = api.postQueue.then(function () { return nativeSave; }).then(function (result: any) {
                if (result === "legacy-fallback")
                    return saveSubpageEntityLegacy(slot, full, true);
                if (result !== "saved")
                    api.postQueueError = true;
                return result;
            });
            return publishAfter(api.postQueue);
        }
        return publishAfter(saveSubpageEntityLegacy(slot, full, true));
    }
    function savedSubpageRaw(slot: number | string): string {
        return SUBPAGE_RAW_CHUNK_FIELDS.map(field => state.subpageRaw[slot]?.[field] || "").join("");
    }
    function scheduleSliderSubpageMigration(this: any, slot?: any, cleanedValue?: string) {
        if (state.nativeConfigLoading || state.nativeTransferActive || state.nativeHasNestedPages) return;
        runtime.pendingSliderSubpageMigrations[slot] = cleanedValue === undefined
            ? true : { source: savedSubpageRaw(slot), cleaned: cleanedValue };
        clearTimeout(runtime.sliderMigrationTimer as any);
        runtime.sliderMigrationTimer = setTimeout(function (this: any) {
            const pending = runtime.pendingSliderSubpageMigrations;
            runtime.pendingSliderSubpageMigrations = {};
            for (const [key, migration] of Object.entries(pending)) {
                if (!state.subpages[key] || state.subpageSavePending[key]) continue;
                if (migration === true) saveSubpageEntity(key);
                else if (migration.source === savedSubpageRaw(key)) saveSubpageEntity(key, migration.cleaned);
            }
        }, 5000);
    }
    function beginAtomicEdit() {
        const edit = nativePanelConfig?.beginAtomicEdit();
        if (!edit) return undefined;
        state.nativeTransferActive = true;
        shell.syncConfigLockUi?.();
        const unlock = () => { state.nativeTransferActive = false; shell.syncConfigLockUi?.(); };
        return {
            cancel: () => { edit.cancel(); unlock(); },
            finish: async (ok: boolean) => { try { return await edit.finish(ok); } finally { unlock(); } },
        };
    }
    return {
        connectCodec,
        beginAtomicEdit,
        connectRequestApi,
        connectFocusRegistrationPublisher,
        subpageEntityKeys,
        buttonConfigByteLimit,
        writableNavigationDepth: () => nativePanelConfig?.writableNavigationDepth() ?? 1,
        subpageConfigFits,
        saveButtonConfig: (slot) => saveButtonConfig(slot),
        saveButtonConfigAndOrder: (slot, order) => saveButtonConfigAndOrder(slot, order),
        saveSubpageEntity: (slot) => saveSubpageEntity(slot),
        clearCardImageReferences,
        subpageChunkShouldPost,
        scheduleSliderSubpageMigration,
    };
}
