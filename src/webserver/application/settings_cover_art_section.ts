import { state } from "../state/app_instance";
import type { UiRuntimeState } from "./state";
import type { ArtworkPostApiFeature } from "./artwork_post_api";
import type { ControlsFieldsFeature } from "./controls_fields";
import type { SettingsPageHelpersFeature } from "./settings_page_helpers";
import type { CoverArtScreensaverController } from "../features/cover_art_screensaver_controller";

export interface SettingsCoverArtSectionFeature {
    buildCoverArtSettingsCard(...args: any[]): any;
}

export function createSettingsCoverArtSectionFeature(
    runtime: UiRuntimeState,
    artworkPostApi: Pick<ArtworkPostApiFeature, "postCoverArtScreensaver" | "postCoverArtDelay" | "postCoverArtTrackOverlayDuration">,
    fields: Pick<ControlsFieldsFeature, "condField" | "fieldLabel" | "makeCollapsibleCard" | "toggleRow">,
    helpers: Pick<SettingsPageHelpersFeature, "applyCoverArtScreensaverState" | "coverArtScreensaverState" |
        "coverArtTrackOverlayDurationSupported" | "statusBadge" | "syncCoverArtScreensaverUi">,
    coverArtScreensaver: CoverArtScreensaverController,
): SettingsCoverArtSectionFeature {
    const { applyCoverArtScreensaverState, coverArtScreensaverState, coverArtTrackOverlayDurationSupported,
        statusBadge, syncCoverArtScreensaverUi } = helpers;
    const { condField, fieldLabel, makeCollapsibleCard, toggleRow } = fields;
    const els = runtime.els;
    function buildCoverArtSettingsCard() {
        const body = document.createElement("div");
        const toggle = toggleRow("Show Cover Art", "sp-set-ss-cover-art-enable", state.coverArtScreensaverOn);
        body.appendChild(toggle.row);
        els.setCoverArtToggle = toggle.input;
        toggle.input.addEventListener("change", () => {
            applyCoverArtScreensaverState(coverArtScreensaver.setEnabled(coverArtScreensaverState(), toggle.input.checked));
            artworkPostApi.postCoverArtScreensaver(state.coverArtScreensaverOn);
            syncCoverArtScreensaverUi();
        });
        const options = condField();
        function durationField(label: string, id: string, values: Array<[number, string]>, value: number,
            change: (value: string) => void): HTMLSelectElement {
            const field = document.createElement("div");
            field.className = "sp-field";
            field.appendChild(fieldLabel(label, id));
            const select = document.createElement("select");
            select.id = id;
            select.className = "sp-select";
            values.forEach(([seconds, text]) => {
                const option = document.createElement("option");
                option.value = String(seconds);
                option.textContent = text;
                select.appendChild(option);
            });
            select.value = String(value);
            select.addEventListener("change", () => change(select.value));
            field.appendChild(select);
            options.appendChild(field);
            return select;
        }
        els.setCoverArtDelay = durationField("Show After", "sp-set-ss-cover-art-delay",
            [[3, "3 seconds"], [5, "5 seconds"], [10, "10 seconds"], [30, "30 seconds"], [60, "1 minute"], [300, "5 minutes"]],
            state.coverArtDelay, value => {
                applyCoverArtScreensaverState(coverArtScreensaver.setDelay(coverArtScreensaverState(), value));
                artworkPostApi.postCoverArtDelay(state.coverArtDelay);
            });
        if (coverArtTrackOverlayDurationSupported()) {
            els.setCoverArtTrackOverlayDuration = durationField("Show Track Details For", "sp-set-ss-track-overlay",
                [[0, "Never"], [3, "3 seconds"], [5, "5 seconds"], [10, "10 seconds"], [15, "15 seconds"],
                 [20, "20 seconds"], [30, "30 seconds"], [60, "60 seconds"], [-1, "Always"]],
                state.coverArtTrackOverlayDuration, value => {
                    applyCoverArtScreensaverState(coverArtScreensaver.setTrackOverlayDuration(coverArtScreensaverState(), value));
                    artworkPostApi.postCoverArtTrackOverlayDuration(state.coverArtTrackOverlayDuration);
                });
        }
        els.setCoverArtOptions = options;
        body.appendChild(options);
        const badge = statusBadge("Media cover art on");
        els.setCoverArtBadge = badge;
        syncCoverArtScreensaverUi();
        return makeCollapsibleCard("Cover Art Screen Saver", body, true, badge);
    }
    return { buildCoverArtSettingsCard };
}
