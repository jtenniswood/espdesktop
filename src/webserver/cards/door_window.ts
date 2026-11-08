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
import type { ConfigSensorOptionsFeature } from "../application/config_sensor_options";
import type { ControlsFieldsFeature } from "../application/controls_fields";
export function registerDoorWindowCardTypes(
    registry: CardRegistry,
    sensorOptions: ConfigSensorOptionsFeature,
    fields: ControlsFieldsFeature,
): void {
    const { cardBadgePreview } = fields;
    const {
        normalizeDoorWindowSubtype,
        doorWindowActiveColorEnabled,
        normalizeDoorWindowOptions,
        doorWindowClosedIcon,
        doorWindowOpenIcon,
        setDoorWindowActiveColorEnabled,
    } = sensorOptions;
    // Read-only door/window card: shows a binary sensor with subtype-specific icons.
    const DOOR_WINDOW_CARD_METADATA: any = {
        mode: {
            label: "Type",
            idSuffix: "door-window-type",
            options: [
                ["door", "Door"],
                ["window", "Window"],
            ],
            value: function (this: any, b?: any) {
                return normalizeDoorWindowSubtype(b.precision);
            },
        },
        entity: {
            label: "Sensor Entity",
            idSuffix: "sensor",
            placeholder: "e.g. binary_sensor.patio_door",
            domains: function (this: any) { return cardContractDomains("door_window"); },
            bindName: "sensor",
            rerender: true,
            requiredMessage: "Add a door or window sensor before saving.",
        },
        labelField: {
            label: "Label",
            idSuffix: "label",
            field: "label",
            placeholder: "e.g. Patio Door",
            rerender: true,
        },
        activeColor: {
            label: "Lit When Open",
            idSuffix: "door-window-active-color",
            checked: doorWindowActiveColorEnabled,
        },
    };
    registry.register("door_window", {
        label: function (this: any) { return cardContractCardLabel("door_window"); },
        allowInSubpage: function (this: any) { return cardContractAllowInSubpage("door_window"); },
        pickerKey: function (this: any) { return cardContractPickerKey("door_window"); },
        hidden: function (this: any) { return cardContractHidden("door_window"); },
        hideLabel: true,
        defaultConfig: function (this: any) { return cardContractDefaultConfig("door_window"); },
        cardMetadata: DOOR_WINDOW_CARD_METADATA,
        onSelect: null,
        renderSettings: renderRetiredCardSettings,
        renderPreview: function (this: any, b?: any, helpers?: any) {
            var subtype: any = normalizeDoorWindowSubtype(b.precision);
            var label: any = b.label || b.sensor || (subtype === "window" ? "Window" : "Door");
            return cardBadgePreview(b, helpers, {
                label: label,
                iconFallback: doorWindowClosedIcon(subtype),
                badge: subtype === "window" ? "window-closed" : "door",
            });
        },
    });
}
