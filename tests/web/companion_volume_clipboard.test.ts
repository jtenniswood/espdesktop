import { createPreviewClipboardFeature } from "../../src/webserver/application/preview_clipboard";
import { initializeDeviceConfig } from "../../src/webserver/device_config";
import { initializeAppState, state } from "../../src/webserver/state/app_instance";
import { emptyCardConfig } from "../../src/webserver/model/card";

function check(value: unknown, message: string): void { if (!value) throw new Error(message); }

export function runCompanionVolumeClipboardTests(): void {
  const globals = globalThis as any;
  globals.__ESPDESKTOP_DEFAULT_DEVICE_ID__ = "test";
  globals.__ESPDESKTOP_DEVICE_PROFILES__ = { test: { slots: 9 } };
  globals.__ESPDESKTOP_TIMEZONE_OPTIONS__ = [];
  initializeDeviceConfig(); initializeAppState();
  const ids = ["media.output_volume", "media.input_volume", "media.output_mute", "media.input_mute"];
  const buttons = ids.map(entity => ({ ...emptyCardConfig("slider"), entity }));
  const calls: Array<{ slots: number[]; cut: boolean | undefined }> = [], banners: string[] = [];
  let deleted = false;
  const feature = createPreviewClipboardFeature({
    homeAssistantSupported: () => false,
    nativeTransfers: { available: () => true, copy: (slots: number[], cut?: boolean) => { calls.push({ slots, cut }); } },
    configPersistence: {}, document: {}, layout: { previewSlots: 9 },
    cards: { definitions: { slider: { allowInSubpage: true }, subpage: { allowInSubpage: true } } },
    imageOptions: {}, sensorOptions: {},
    codec: { normalizeButtonConfig: (card: any) => card, normalizeCardSizeForConfig: (_card: any, size: number) => size,
      parseSubpageConfig: JSON.parse, serializeSubpageConfig: JSON.stringify },
    entityState: {}, shell: { isConfigLocked: () => false, showBanner: (message: string) => banners.push(message) },
    requestApi: {}, grid: { ctx: () => ({ buttons, sizes: {}, isSub: false }) },
    preview: { configDisabled: () => false, registryValue: (definition: any, key: string) => definition[key] },
    placement: {}, deleteSlot: () => { deleted = true; }, deleteButtons: () => { deleted = true; }, emptyButtonConfig: emptyCardConfig,
  } as any);
  for (let slot = 1; slot <= 4; ++slot) {
    feature.cutSlot(slot);
    check(calls.at(-1)?.slots[0] === slot && calls.at(-1)?.cut, "native mute/volume can be cut without HA");
    feature.copySlot(slot);
    check(calls.at(-1)?.cut === undefined, "native controls can also be copied");
    for (const subpage of [false, true]) {
      let error = "";
      try { feature.entriesFromTransfer({ version: 1, cards: [buttons[slot - 1]] }, subpage); }
      catch (failure) { error = failure instanceof Error ? failure.message : String(failure); }
      check(error.includes("cards have been removed"), "old card codes cannot restore Mac audio cards");
    }
  }
  feature.cutButtons([1, 2, 3, 4]);
  check(calls.at(-1)?.slots.join() === "1,2,3,4" && calls.at(-1)?.cut, "mixed native controls can be cut together");
  check(!deleted && banners.length === 0, "native cut remains transactional and reports no HA error");

  buttons[0] = { ...emptyCardConfig("slider"), entity: "light.office" };
  const before = calls.length;
  feature.cutSlot(1); feature.cutButtons([1, 2]);
  check(calls.length === before && banners.length === 2, "HA-backed sliders and mixed selections are still blocked");
  let rejected = false;
  try { feature.entriesFromTransfer({ version: 1, cards: [buttons[0]] }, false); }
  catch { rejected = true; }
  check(rejected, "HA slider imports remain blocked");

  buttons[0] = { ...emptyCardConfig("subpage"), options: "subpage_connector=mac_companion" };
  state.subpages[1] = { buttons: ids.map(entity => ({ ...emptyCardConfig("slider"), entity })) } as any;
  feature.cutSlot(1);
  check(calls.length === before + 1, "a Mac folder containing native audio controls can be cut");
  (state.subpages[1] as any).buttons.push({ ...emptyCardConfig("slider"), entity: "fan.office" });
  feature.cutSlot(1);
  check(calls.length === before + 1, "a nested HA slider still prevents the cut");
}
