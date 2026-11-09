import { state } from "../state/app_instance";
import {
    cardContractAllowInSubpage,
    cardContractCardLabel,
    cardContractDefaultConfig,
    cardContractHidden,
    cardContractPickerKey,
} from "../generated/card_contract";
import { PREVIEW_THEME_COLORS, previewEffectiveTheme } from "../state/preview_theme";
import { iconSlug } from "../application/ui_primitives";
import type { CardRegistry } from "../application/card_registry";
import type { ConfigMediaOptionsFeature } from "../application/config_media_options";
import type { ControlsFieldsFeature } from "../application/controls_fields";
import { CARD_SIZE_SINGLE } from "../model/grid";
export function registerMediaCardTypes(
    registry: CardRegistry,
    mediaOptions: ConfigMediaOptionsFeature,
    deviceId: string,
    fields: ControlsFieldsFeature,
): void {
    const { cardBadgeLabelHtml, cardLargeNumbersActiveForCardSize, cardSensorPreviewHtml } = fields;
    const {
        mediaEditorValidMode, mediaNowPlayingControls, normalizeMediaOptions,
        mediaCoverArtDetailsEnabled, mediaLabelDisplayMode, mediaNumberDisplayMode,
    } = mediaOptions;
    // Media player card: playback buttons, volume, track position, or now-playing details.
    function mediaNowPlayingProgressEnabled(this: any, b?: any) {
        return mediaNowPlayingControls(b) === "progress";
    }
    function mediaNowPlayingPlayPauseEnabled(this: any, b?: any) {
        return mediaNowPlayingControls(b) === "play_pause";
    }
    const MEDIA_CARD_METADATA = { preview: { badge: "speaker" } };
    registry.register("media", {
        label: function (this: any) { return cardContractCardLabel("media"); },
        allowInSubpage: function (this: any) { return cardContractAllowInSubpage("media"); },
        pickerKey: function (this: any) { return cardContractPickerKey("media"); },
        hidden: function (this: any) { return cardContractHidden("media"); },
        hideLabel: true,
        labelPlaceholder: "e.g. Living Room Speaker",
        defaultConfig: function (this: any) { return cardContractDefaultConfig("media"); },
        cardMetadata: {},
        renderSettings: function (panel: any) {
            const warning = document.createElement("p");
            warning.className = "sp-setting-note";
            warning.textContent = "This saved media card needs Home Assistant. Its configuration has been kept. Replace the card to use Mac Companion or a local control.";
            panel.appendChild(warning);
        },
        renderPreview: function (this: any, b?: any, helpers?: any) {
            const neutralPreview = PREVIEW_THEME_COLORS[previewEffectiveTheme(state)];
            const customBackground = helpers && helpers.cardBackgroundColor || "";
            const customProgress = helpers && helpers.cardProgressColor || "";
            const fallbackTextColor = helpers && helpers.cardTextColor || "#" + neutralPreview.textPrimary;
            function modeInfo(this: any, value?: any) {
                if (value === "controls")
                    value = "play_pause";
                if (value === "previous")
                    return { mode: "previous", label: "Previous", icon: "skip-previous" };
                if (value === "next")
                    return { mode: "next", label: "Next", icon: "skip-next" };
                if (value === "volume")
                    return { mode: "volume", label: "Volume", icon: "volume-high" };
                if (value === "position")
                    return { mode: "position", label: "Position", icon: "progress-clock" };
                if (value === "now_playing")
                    return { mode: "now_playing", label: "Now Playing", icon: "music" };
                if (value === "cover_art")
                    return { mode: "cover_art", label: "Cover Art", icon: "music" };
                if (value === "control_modal")
                    return { mode: "control_modal", label: "All Controls", icon: "play-pause" };
                if (value === "speaker_group")
                    return { mode: "speaker_group", label: "Speaker Group", icon: "speaker-multiple" };
                if (value === "playlist")
                    return { mode: "playlist", label: "Playlist", icon: "music" };
                return { mode: "play_pause", label: "Play/Pause", icon: "play-pause" };
            }
            var info: any = modeInfo(mediaEditorValidMode(b.sensor));
            var mode: any = info.mode;
            var label: any = (b.label && b.label.trim()) || info.label;
            if (mode === "control_modal") {
                var controlIcon: any = b.icon && b.icon !== "Auto" ? iconSlug(b.icon) : info.icon;
                return {
                    iconHtml: mediaNumberDisplayMode(b) === "volume"
                        ? cardSensorPreviewHtml(b, helpers, "42", null)
                        : '<span class="sp-btn-icon mdi mdi-' + controlIcon + '"></span>',
                    labelHtml: cardBadgeLabelHtml(helpers, mediaLabelDisplayMode(b) === "status" ? "Playing" : label, MEDIA_CARD_METADATA.preview.badge),
                    labelEditable: mediaLabelDisplayMode(b) === "label",
                };
            }
            if (mode === "speaker_group") {
                var groupIcon: any = b.icon && b.icon !== "Auto" ? iconSlug(b.icon) : info.icon;
                return {
                    buttonClass: "sp-media-group-active",
                    iconHtml: '<span class="sp-btn-icon mdi mdi-' + groupIcon + '"></span>',
                    labelHtml: cardBadgeLabelHtml(helpers, label, MEDIA_CARD_METADATA.preview.badge),
                };
            }
            if (mode === "volume") {
                return {
                    iconHtml: cardSensorPreviewHtml(b, helpers, "42", null),
                    labelHtml: cardBadgeLabelHtml(helpers, label, MEDIA_CARD_METADATA.preview.badge),
                };
            }
            if (mode === "position") {
                var bgColor: any = customBackground || neutralPreview.surfacePrimary;
                var progressColor: any = customProgress || neutralPreview.trackBackground;
                var positionLabel: any = b.precision === "state" ? "Paused" : label;
                var positionClass: any = "sp-sensor-preview sp-media-position-time" +
                    (cardLargeNumbersActiveForCardSize(b, helpers, MEDIA_CARD_METADATA) ? " sp-sensor-preview-large" : "");
                return {
                    iconHtml: '<span class="sp-slider-preview" style="inset:-2px;background:#' + helpers.escHtml(bgColor) + '">' +
                        '<span class="sp-slider-track"><span class="sp-slider-fill" style="width:50%;height:100%;background:#' +
                        helpers.escHtml(progressColor) + '"></span></span></span>' +
                        '<span class="' + positionClass + '">' +
                        '<span class="sp-sensor-value">0:00</span></span>',
                    labelHtml: cardBadgeLabelHtml(helpers, positionLabel, MEDIA_CARD_METADATA.preview.badge),
                    labelEditable: b.precision !== "state",
                };
            }
            if (mode === "cover_art") {
                var coverArtColor: any = customBackground || neutralPreview.surfaceCard;
                if (mediaCoverArtDetailsEnabled(b)) {
                    var singleCoverArtCard: any = ((helpers && helpers.cardSize) || CARD_SIZE_SINGLE) === CARD_SIZE_SINGLE;
                    var controlFontClass: any = (deviceId === "guition-esp32-p4-jc4880p443" ||
                        deviceId === "guition-esp32-p4-jc4880p443-v3")
                        ? " sp-media-cover-control-fonts"
                        : "";
                    return {
                        buttonClass: "sp-image-card sp-media-cover-details-card" + controlFontClass +
                            (singleCoverArtCard ? " sp-media-cover-details-single" : ""),
                        iconHtml: '<span class="sp-image-preview sp-media-cover-artwork" style="background-color:#' +
                            helpers.escHtml(coverArtColor) + '"></span>' +
                            '<span class="sp-media-cover-tint"></span>' +
                            '<span class="sp-media-now-title sp-media-cover-details-title">Track Title</span>',
                        labelHtml: '<span class="sp-btn-label-row sp-media-cover-details-row"><span class="sp-btn-label sp-media-now-artist">Artist Name</span></span>',
                    };
                }
                return {
                    buttonClass: "sp-image-card sp-media-cover-placeholder",
                    iconHtml: '<span class="sp-image-preview" style="background:#' +
                        helpers.escHtml(coverArtColor) + '"></span>',
                    labelHtml: '<span class="sp-image-label"><span class="sp-image-label-stack">' +
                        '<span class="sp-image-label-text sp-image-label-shadow" aria-hidden="true">Cover Art</span>' +
                        '<span class="sp-image-label-text sp-image-label-main" style="color:' + helpers.escHtml(fallbackTextColor) + '">Cover Art</span></span></span>',
                };
            }
            if (mode === "now_playing") {
                var progressBg: any = "";
                if (mediaNowPlayingProgressEnabled(b)) {
                    var nowBgColor: any = customBackground || neutralPreview.surfacePrimary;
                    var nowProgressColor: any = customProgress || neutralPreview.trackBackground;
                    progressBg =
                        '<span class="sp-slider-preview" style="inset:-2px;background:#' + helpers.escHtml(nowBgColor) + '">' +
                            '<span class="sp-slider-track"><span class="sp-slider-fill" style="width:50%;height:100%;background:#' + helpers.escHtml(nowProgressColor) + '">' +
                            '</span></span></span>';
                }
                else if (mediaNowPlayingPlayPauseEnabled(b)) {
                    var playBgColor: any = customBackground || neutralPreview.surfacePrimary;
                    progressBg =
                        '<span class="sp-slider-preview" style="inset:-2px;background:#' + helpers.escHtml(playBgColor) + '">' +
                            '</span>';
                }
                return {
                    iconHtml: progressBg + '<span class="sp-media-now-title">Track Title</span>',
                    labelHtml: '<span class="sp-btn-label-row"><span class="sp-btn-label sp-media-now-artist">Artist Name</span></span>',
                };
            }
            return {
                iconHtml: '<span class="sp-btn-icon mdi mdi-' + (b.icon && b.icon !== "Auto" ? iconSlug(b.icon) : info.icon) + '"></span>',
                labelHtml: cardBadgeLabelHtml(helpers, mode === "play_pause" && b.precision === "state" ? "Playing" : label, MEDIA_CARD_METADATA.preview.badge),
                labelEditable: mode !== "play_pause" || b.precision !== "state",
            };
        },
    });
    registry.register("media_cover_art", {
        label: "Cover Art",
        allowInSubpage: function (this: any) { return cardContractAllowInSubpage("media"); },
        // Retain the old registration only to normalize any saved alias. Cover Art is
        // selected from the Media card's Type field and is not a top-level card type.
        pickerKey: "media",
        hidden: true,
        hideLabel: true,
        cardMetadata: {},
        defaultConfig: function (this: any) {
            var config: any = cardContractDefaultConfig("media");
            config.sensor = "cover_art";
            config.label = "Cover Art";
            return config;
        },
        normalizeConfig: function (this: any, config?: any) {
            config.type = "media";
            config.sensor = "cover_art";
            config.unit = "";
            config.precision = "";
            config.icon_on = "Auto";
            config.options = normalizeMediaOptions(config.options, config.sensor);
        },
    });
}
