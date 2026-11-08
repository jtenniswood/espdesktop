import { renderRetiredCardSettings } from "../application/card_registry";
import {
    cardContractAllowInSubpage,
    cardContractCard,
    cardContractCardLabel,
    cardContractDefaultConfig,
    cardContractDomains,
    cardContractHidden,
    cardContractPickerKey,
} from "../generated/card_contract";
import { iconSlug } from "../application/ui_primitives";
import type { CardRegistry } from "../application/card_registry";
import type { ConfigModalTabOptionsFeature } from "../application/config_modal_tab_options";
import type { ConfigAccessClimateAlarmOptionsFeature } from "../application/config_access_climate_alarm_options";
import type { ClockBarFeature } from "../application/clock_bar_state";
import type { ButtonSettingsRenderQueueFeature } from "../application/button_settings_render_queue";
import type { ControlsFieldsFeature } from "../application/controls_fields";
export function registerClimateCardTypes(
    registry: CardRegistry,
    modalTabs: ConfigModalTabOptionsFeature,
    accessOptions: ConfigAccessClimateAlarmOptionsFeature,
    clockBar: Pick<ClockBarFeature, "temperatureUnitSymbol">,
    renderQueue: ButtonSettingsRenderQueueFeature,
    fields: ControlsFieldsFeature,
): void {
    const { cardBadgeLabelHtml, cardSensorPreviewHtml, condField } = fields;
    const { temperatureUnitSymbol } = clockBar;
    const {
        climateControlTabDefinitions,
        climateControlTabs,
        setClimateControlTabs,
        renderModalTabSettings,
    } = modalTabs;
    const {
        normalizeClimateOptions,
        climateLabelDisplayMode,
        setClimateLabelDisplayMode,
        climateNumberDisplayMode,
        setClimateNumberDisplayMode,
        climateTemperatureStep,
        setClimateTemperatureStep,
        parseClimatePrecisionConfig,
        climatePrecisionConfig,
    } = accessOptions;
    // Climate card: thermostat status plus full-screen climate controls.
    const CLIMATE_CARD_METADATA: any = {
        entity: {
            label: "Climate Entity",
            idSuffix: "entity",
            placeholder: "e.g. climate.living_room",
            domains: function (this: any) { return cardContractDomains("climate"); },
            bindName: "entity",
            rerender: true,
            requiredMessage: "Add a climate entity before saving.",
        },
        labelDisplay: {
            label: "Label Display",
            options: [
                ["label", "Label"],
                ["status", "Status"],
                ["actual", "Actual"],
                ["target", "Target"],
            ],
        },
        numberDisplay: {
            label: "Icon & Temperatures",
            options: [
                ["icon", "Icon"],
                ["actual", "Actual"],
                ["target", "Target"],
            ],
        },
        temperatureStep: {
            label: "Temperature Step",
            options: [
                ["1", "1 degree"],
                ["0.5", "0.5 degree"],
            ],
        },
        largeNumbers: {
            label: "Large Temperature Numbers",
            idSuffix: "large-temperature-numbers",
            supported: function (this: any, b?: any) {
                return climateNumberDisplayMode(b) !== "icon";
            },
        },
        preview: {
            badge: "thermostat",
        },
    };
    registry.register("climate", {
        label: function (this: any) { return cardContractCardLabel("climate"); },
        allowInSubpage: function (this: any) { return cardContractAllowInSubpage("climate"); },
        pickerKey: function (this: any) { return cardContractPickerKey("climate"); },
        hidden: function (this: any) { return cardContractHidden("climate"); },
        hideLabel: true,
        labelPlaceholder: "e.g. Living Room",
        defaultConfig: function (this: any) { return cardContractDefaultConfig("climate"); },
        cardMetadata: CLIMATE_CARD_METADATA,
        onSelect: null,
        renderSettings: renderRetiredCardSettings,
        renderPreview: function (this: any, b?: any, helpers?: any) {
            var climateConfig: any = parseClimatePrecisionConfig(b.precision);
            var prec: any = parseInt(climateConfig.precision || "0", 10) || 0;
            var unit: any = temperatureUnitSymbol();
            var actualVal: any = (21).toFixed(prec);
            var targetVal: any = (20).toFixed(prec);
            var numberMode: any = climateNumberDisplayMode(b);
            var numberVal: any = numberMode === "actual" ? actualVal : targetVal;
            var labelMode: any = climateLabelDisplayMode(b);
            var label: any = (b.label && b.label.trim()) || "Climate";
            if (labelMode === "status") {
                label = "Idle";
            }
            else if (labelMode === "actual") {
                label = actualVal + unit;
            }
            else if (labelMode === "target") {
                label = targetVal + unit;
            }
            function climateLabelHtml(this: any) {
                return cardBadgeLabelHtml(helpers, label, CLIMATE_CARD_METADATA.preview.badge);
            }
            if (numberMode === "icon") {
                var iconName: any = b.icon && b.icon !== "Auto" ? b.icon : "Thermostat";
                return {
                    iconHtml: '<span class="sp-btn-icon mdi mdi-' + iconSlug(iconName) + '"></span>',
                    labelHtml: climateLabelHtml(),
                    labelEditable: labelMode === "label",
                };
            }
            return {
                buttonClass: "sp-climate-temp-card",
                iconHtml: cardSensorPreviewHtml(b, helpers, numberVal, unit),
                labelHtml: climateLabelHtml(),
                labelEditable: labelMode === "label",
            };
        },
    });
    registry.register("climate_control", Object.assign({}, registry.definitions.climate, {
        label: function (this: any) { return cardContractCardLabel("climate_control"); },
        allowInSubpage: function (this: any) { return cardContractAllowInSubpage("climate_control"); },
        pickerKey: function (this: any) { return cardContractPickerKey("climate_control"); },
        hidden: function (this: any) { return cardContractHidden("climate_control"); },
        defaultConfig: function (this: any) { return cardContractDefaultConfig("climate_control"); },
    }));
}
