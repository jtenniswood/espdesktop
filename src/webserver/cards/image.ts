import {
    cardContractAllowInSubpage,
    cardContractCardLabel,
    cardContractDefaultConfig,
    cardContractHidden,
    cardContractPickerKey,
} from "../generated/card_contract";
import { iconSlug } from "../application/ui_primitives";
import { state } from "../state/app_instance";
import { PREVIEW_THEME_COLORS, previewEffectiveTheme } from "../state/preview_theme";
import type { CardRegistry } from "../application/card_registry";
import type { ConfigImageOptionsFeature } from "../application/config_image_options";
export function registerImageCardTypes(
    registry: CardRegistry,
    imageOptions: ConfigImageOptionsFeature,
): void {
    const { imageLabelEnabled, imageIconEnabled } = imageOptions;
    registry.register("image", {
        label: function (this: any) { return cardContractCardLabel("image"); },
        allowInSubpage: function (this: any) { return cardContractAllowInSubpage("image"); },
        pickerKey: function (this: any) { return cardContractPickerKey("image"); },
        hidden: function (this: any) { return cardContractHidden("image"); },
        hideLabel: true,
        defaultConfig: function (this: any) { return cardContractDefaultConfig("image"); },
        cardMetadata: {},
        // Saved records stay inspectable without altering their legacy fields.
        renderSettings: function (_panel: any, _button: any) {
            const warning = document.createElement("p");
            warning.className = "sp-setting-note";
            warning.textContent = "This saved camera card needs Home Assistant. Its configuration has been kept. Replace the card to use a supported card type.";
            _panel.appendChild(warning);
        },
        renderPreview: function (this: any, b?: any, helpers?: any) {
            var customBackground: any = helpers && helpers.cardBackgroundColor || "";
            var tertiaryColor: any = customBackground || PREVIEW_THEME_COLORS[previewEffectiveTheme(state)].surfaceSecondary;
            var label: any = imageLabelEnabled(b) ? String((b && b.label) || "Camera").trim() : "";
            var iconName: any = b && b.icon && b.icon !== "Auto" ? iconSlug(b.icon) : "camera";
            var iconColor: any = customBackground ? ' style="color:' + helpers.escHtml(helpers.cardTextColor) + '"' : "";
            var icon: any = imageIconEnabled(b) ? '<span class="sp-image-preview-icon mdi mdi-' + iconName + '"' + iconColor + '></span>' : "";
            return {
                buttonClass: "sp-image-card",
                iconHtml: '<span class="sp-image-preview" style="background:#' + helpers.escHtml(tertiaryColor) + '">' +
                    icon +
                    '</span>',
                labelHtml: label
                    ? '<span class="sp-image-label"><span class="sp-image-label-stack">' +
                        '<span class="sp-image-label-text sp-image-label-shadow" aria-hidden="true">' +
                        helpers.escHtml(label) +
                        '</span><span class="sp-image-label-text sp-image-label-main">' +
                        helpers.escHtml(label) +
                        '</span></span></span>'
                    : "",
            };
        },
    });
}
