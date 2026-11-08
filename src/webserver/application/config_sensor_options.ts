import { preserveCardColorOptions } from "../model/config_primitives";
import type { CardRegistry } from "./card_registry";
import {
    configOptionEnabled,
    configOptionValue,
    setConfigOption,
    setConfigOptionValue,
} from "../model/config_primitives";
import { cardContractLargeNumbersSupported } from "../generated/card_contract";
import {
    SENSOR_ACTIVE_COLOR_OPTION,
    SENSOR_LARGE_NUMBERS_OFF_VALUE,
    SENSOR_LARGE_NUMBERS_OPTION,
    cardContractOptionSupportedFor,
    copyLargeNumbersOption,
    largeNumbersExplicitlyDisabled,
} from "./config_option_core";
export function createConfigSensorOptionsFeature(cardRegistry: CardRegistry) {
    function cardLargeNumbersSupported(this: any, b?: any) {
        if (!b)
            return false;
        var typeDef: any = cardRegistry.definitions[b.type || ""];
        var large: any = typeDef && typeDef.cardMetadata && typeDef.cardMetadata.largeNumbers;
        if (large) {
            return typeof large.supported === "function" ? !!large.supported(b) : large.supported !== false;
        }
        return cardContractLargeNumbersSupported(b.type, b.precision);
    }
    function cardLargeNumbersEnabled(this: any, b?: any) {
        return !!(b && cardLargeNumbersSupported(b) &&
            configOptionEnabled(b.options, SENSOR_LARGE_NUMBERS_OPTION));
    }
    function setSensorLargeNumbersEnabled(this: any, b?: any, enabled?: any) {
        if (!b)
            return "";
        b.options = setConfigOption(b.options, SENSOR_LARGE_NUMBERS_OPTION, false);
        b.options = setConfigOptionValue(b.options, SENSOR_LARGE_NUMBERS_OPTION, enabled ? "" : SENSOR_LARGE_NUMBERS_OFF_VALUE);
        if (enabled)
            b.options = setConfigOption(b.options, SENSOR_LARGE_NUMBERS_OPTION, true);
        return b.options;
    }
    function normalizeDateTimeOptions(this: any, type?: any, options?: any, precision?: any) {
        var out = "";
        if (configOptionEnabled(options, SENSOR_LARGE_NUMBERS_OPTION) &&
            cardContractOptionSupportedFor(type, SENSOR_LARGE_NUMBERS_OPTION, { precision: precision })) {
            out = copyLargeNumbersOption(out, options);
        } else if (largeNumbersExplicitlyDisabled(options) &&
            cardContractOptionSupportedFor(type, SENSOR_LARGE_NUMBERS_OPTION, { precision: precision })) {
            out = copyLargeNumbersOption(out, options);
        }
        if (type === "clock" && configOptionEnabled(options, "center_clock")) {
            out = setConfigOption(out, "center_clock", true);
        }
        return preserveCardColorOptions(options, out);
    }
    function normalizeDoorWindowSubtype(this: any, value?: any) {
        value = String(value || "").trim();
        return value === "window" ? "window" : "door";
    }
    function doorWindowClosedIcon(this: any, subtype?: any) {
        return normalizeDoorWindowSubtype(subtype) === "window" ? "Window Closed" : "Door";
    }
    function doorWindowOpenIcon(this: any, subtype?: any) {
        return normalizeDoorWindowSubtype(subtype) === "window" ? "Window Open" : "Door Open";
    }
    function doorWindowActiveColorEnabled(this: any, b?: any) {
        return !!(b && b.type === "door_window" &&
            configOptionEnabled(b.options, SENSOR_ACTIVE_COLOR_OPTION));
    }
    function setDoorWindowActiveColorEnabled(this: any, b?: any, enabled?: any) {
        if (!b)
            return "";
        b.options = setConfigOption(b.options, SENSOR_ACTIVE_COLOR_OPTION, enabled);
        return b.options;
    }
    function normalizeDoorWindowOptions(this: any, options?: any) {
        var out: any = "";
        if (configOptionEnabled(options, SENSOR_ACTIVE_COLOR_OPTION)) {
            out = setConfigOption(out, SENSOR_ACTIVE_COLOR_OPTION, true);
        }
        return preserveCardColorOptions(options, out);
    }
    function presenceActiveColorEnabled(this: any, b?: any) {
        return !!(b && b.type === "presence" &&
            configOptionEnabled(b.options, SENSOR_ACTIVE_COLOR_OPTION));
    }
    function setPresenceActiveColorEnabled(this: any, b?: any, enabled?: any) {
        if (!b)
            return "";
        b.options = setConfigOption(b.options, SENSOR_ACTIVE_COLOR_OPTION, enabled);
        return b.options;
    }
    function normalizePresenceOptions(this: any, options?: any) {
        var out: any = "";
        if (configOptionEnabled(options, SENSOR_ACTIVE_COLOR_OPTION)) {
            out = setConfigOption(out, SENSOR_ACTIVE_COLOR_OPTION, true);
        }
        return preserveCardColorOptions(options, out);
    }
    return {
        cardLargeNumbersSupported,
        cardLargeNumbersEnabled,
        setSensorLargeNumbersEnabled,
        normalizeDateTimeOptions,
        normalizeDoorWindowSubtype,
        doorWindowClosedIcon,
        doorWindowOpenIcon,
        doorWindowActiveColorEnabled,
        setDoorWindowActiveColorEnabled,
        normalizeDoorWindowOptions,
        presenceActiveColorEnabled,
        setPresenceActiveColorEnabled,
        normalizePresenceOptions,
    };
}

export type ConfigSensorOptionsFeature = ReturnType<typeof createConfigSensorOptionsFeature>;
