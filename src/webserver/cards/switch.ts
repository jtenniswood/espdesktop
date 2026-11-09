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
import type { CardRegistry } from "../application/card_registry";
import type { ConfigConfirmationOptionsFeature } from "../application/config_confirmation_options";
import type { LightCardRegistration } from "./light_temperature";
import type { ControlsFieldsFeature } from "../application/controls_fields";
import {
    SWITCH_CONFIRM_DEFAULT_MESSAGE,
    SWITCH_CONFIRM_DEFAULT_NO,
    SWITCH_CONFIRM_DEFAULT_YES,
} from "../application/config_option_core";
export function registerSwitchCardTypes(
    registry: CardRegistry,
    confirmationOptions: ConfigConfirmationOptionsFeature,
    lightCards: LightCardRegistration,
    fields: ControlsFieldsFeature,
): void {
    const { cardBadgeLabelHtml, cardLargeNumbersActiveForCardSize, cardSensorPreviewHtml, condField } = fields;
    const {
        controlTypeMetadata: LIGHT_CONTROL_TYPE_METADATA,
        renderControlTypeField: renderLightControlTypeField,
    } = lightCards;
    const {
        setSwitchConfirmationOptions,
        switchConfirmationDefaultMessageForMode,
        switchConfirmationEnabled,
        switchConfirmationMessage,
        switchConfirmationMode,
        switchConfirmationNoText,
        switchConfirmationYesText,
    } = confirmationOptions;
    // Default button type: HA entity toggle (on/off switch)
    const SWITCH_CARD_METADATA: any = {
        entity: {
            label: "Entity",
            placeholder: "e.g. light.kitchen",
            domains: function (this: any) { return cardContractDomains(""); },
            requiredMessage: "Add an entity before saving.",
        },
        labelField: {
            label: "Label",
            placeholder: "e.g. Kitchen",
        },
        iconOff: {
            field: "icon",
            fallback: "Auto",
            label: "Off Icon",
        },
        iconOn: {
            field: "icon_on",
            fallback: "Auto",
            label: "On Icon",
        },
        activeDisplay: {
            label: "Active Display",
            idSuffix: "sensor-when-on-toggle",
            checked: function (this: any, b?: any) { return !!b.sensor; },
        },
        largeNumbers: {
            label: "Large Active Display Numbers",
            idSuffix: "large-active-display-numbers",
            supported: function (this: any, b?: any) {
                return !!(b && b.sensor && b.precision !== "text");
            },
        },
        sensorMode: {
            label: "Type",
            options: [
                ["numeric", "Numeric"],
                ["text", "Text"],
            ],
        },
        sensorEntity: {
            label: "Sensor Entity",
            idSuffix: "sensor",
            placeholder: "e.g. sensor.printer_percent_complete",
            domains: ["sensor", "binary_sensor", "text_sensor"],
            bindName: "sensor",
        },
        unitField: {
            label: "Unit",
            idSuffix: "unit",
            placeholder: "e.g. %",
            bindName: "unit",
            rerender: false,
        },
        confirmationToggle: {
            label: "Confirmation Required",
            idSuffix: "confirm-toggle",
            checked: function (this: any, b?: any) { return switchConfirmationEnabled(b); },
        },
        confirmationMode: {
            label: "When",
            options: [
                ["off", "Off"],
                ["on", "On"],
                ["both", "Both"],
            ],
        },
        confirmationMessage: {
            label: "Message",
            idSuffix: "confirm-message",
            placeholder: SWITCH_CONFIRM_DEFAULT_MESSAGE,
            bindName: null,
            value: function (this: any, b?: any) { return switchConfirmationMessage(b); },
        },
        confirmationYes: {
            label: "Confirm Button",
            idSuffix: "confirm-yes",
            placeholder: SWITCH_CONFIRM_DEFAULT_YES,
            bindName: null,
            value: function (this: any, b?: any) { return switchConfirmationYesText(b); },
        },
        confirmationNo: {
            label: "Cancel Button",
            idSuffix: "confirm-no",
            placeholder: SWITCH_CONFIRM_DEFAULT_NO,
            bindName: null,
            value: function (this: any, b?: any) { return switchConfirmationNoText(b); },
        },
        preview: {
            switchBadge: "toggle-switch-variant-off",
            numericBadge: "gauge",
            textBadge: "format-text",
        },
    };
    const LIGHT_SWITCH_CARD_METADATA: any = {
        mode: LIGHT_CONTROL_TYPE_METADATA.mode,
        entity: {
            label: "Entity",
            placeholder: "e.g. light.living_room",
            domains: function (this: any) { return cardContractDomains("light_switch"); },
            requiredMessage: "Add a light entity before saving.",
        },
        labelField: {
            label: "Label",
            placeholder: "e.g. Living Room",
        },
        iconOff: {
            field: "icon",
            fallback: "Auto",
            label: "Off Icon",
        },
        iconOn: {
            field: "icon_on",
            fallback: "Auto",
            label: "On Icon",
        },
        preview: {
            badge: "lightbulb",
        },
    };
    registry.register("", {
        label: function (this: any) { return cardContractCardLabel(""); },
        allowInSubpage: function (this: any) { return cardContractAllowInSubpage(""); },
        pickerKey: function (this: any) { return cardContractPickerKey(""); },
        hidden: function (this: any) { return cardContractHidden(""); },
        hideLabel: true,
        defaultConfig: function (this: any) { return cardContractDefaultConfig(""); },
        cardMetadata: SWITCH_CARD_METADATA,
        renderSettings: renderRetiredCardSettings,
        renderPreview: function (this: any, b?: any, helpers?: any) {
            var label: any = b.label || b.entity || "Configure";
            var badgeIcon: any = b.sensor
                ? (b.precision === "text" ? SWITCH_CARD_METADATA.preview.textBadge : SWITCH_CARD_METADATA.preview.numericBadge)
                : SWITCH_CARD_METADATA.preview.switchBadge;
            var preview: any = {
                labelHtml: cardBadgeLabelHtml(helpers, label, badgeIcon),
            };
            if (b.sensor && b.precision !== "text" &&
                cardLargeNumbersActiveForCardSize(b, helpers, SWITCH_CARD_METADATA)) {
                preview.iconHtml = cardSensorPreviewHtml(b, helpers, "42", b.unit || "");
            }
            return preview;
        },
    });
    registry.register("light_switch", {
        label: function (this: any) { return cardContractCardLabel("light_switch"); },
        allowInSubpage: function (this: any) { return cardContractAllowInSubpage("light_switch"); },
        hideLabel: true,
        pickerKey: function (this: any) { return cardContractPickerKey("light_switch"); },
        hidden: function (this: any) { return cardContractHidden("light_switch"); },
        defaultConfig: function (this: any) { return cardContractDefaultConfig("light_switch"); },
        isAvailable: function (this: any) {
            return false;
        },
        labelPlaceholder: "e.g. Living Room",
        cardMetadata: LIGHT_SWITCH_CARD_METADATA,
        onSelect: null,
        renderSettings: renderRetiredCardSettings,
        renderPreview: function (this: any, b?: any, helpers?: any) {
            var label: any = b.label || b.entity || "Configure";
            return {
                labelHtml: cardBadgeLabelHtml(helpers, label, LIGHT_SWITCH_CARD_METADATA.preview.badge),
            };
        },
    });
}
