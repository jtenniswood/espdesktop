import { state } from "../state/app_instance";
import { AUTO_TIMEZONE_OPTION, FALLBACK_TIMEZONE_OPTION } from "../state/app_state";
import { normalizeLanguage } from "../model/settings";

export interface EnvironmentStateFeature {

    isAutomaticTimezone(value?: any): boolean;
    effectiveTimezoneOptionForWeb(value?: any): any;
    timezoneOptionsWithFallback(options?: any, selected?: any, preserveSelectedAuto?: any): any[];
    monthNameForIndex(index?: any): string;
}

export function createEnvironmentStateFeature(
    defaultTimezoneOptions: () => string[],
): EnvironmentStateFeature {

    function isAutomaticTimezone(value?: any) {
        return String(value || "") === AUTO_TIMEZONE_OPTION || value === "Auto (Home Assistant)";
    }
    function effectiveTimezoneOptionForWeb(value?: any) {
        if (!isAutomaticTimezone(value))
            return value;
        var active: any = String(state && state.activeTimezone || "").trim();
        return active && !isAutomaticTimezone(active) ? active : FALLBACK_TIMEZONE_OPTION;
    }
    function timezoneOptionsWithFallback(options?: any, selected?: any, preserveSelectedAuto?: any) {
        var list: any = Array.isArray(options) && options.length ? options.slice() : defaultTimezoneOptions();
        var supportsAuto: any = list.indexOf(AUTO_TIMEZONE_OPTION) !== -1;
        if (selected && list.indexOf(selected) === -1 &&
            (!isAutomaticTimezone(selected) || supportsAuto || preserveSelectedAuto)) {
            list.unshift(selected);
        }
        return list;
    }
    function monthNameForIndex(index?: any) {
        var monthIndex: any = parseInt(index, 10);
        if (!isFinite(monthIndex) || monthIndex < 0 || monthIndex > 11)
            return "Date";
        try {
            return new Intl.DateTimeFormat(normalizeLanguage(state.language), { month: "long" })
                .format(new Date(Date.UTC(2000, monthIndex, 1)));
        }
        catch (_) {
            return new Intl.DateTimeFormat("en", { month: "long" })
                .format(new Date(Date.UTC(2000, monthIndex, 1)));
        }
    }
    return {

        isAutomaticTimezone,
        effectiveTimezoneOptionForWeb,
        timezoneOptionsWithFallback,
        monthNameForIndex,
    };
}
