import { state } from "../state/app_instance";
import {
    brightnessModeOption,
    normalizeScheduleTrigger,
    normalizeTimeOfDay,
    scheduleModeOption,
} from "../model/settings";
import type { ScreenSchedulePreferences } from "../model/screen_schedule_preferences";
import type { EntityStateFeature } from "./entity_state";
import type { ApplicationApiFeature } from "./api";
export interface ScreenSchedulePostApiFeature {
    postBrightnessMode(value?: any): void;
    postDisplayBacklightBrightness(value?: any): void;
    postBrightnessDawnTime(value?: any): void;
    postBrightnessDuskTime(value?: any): void;
    postScreenSchedulePreferences(patch: Partial<ScreenSchedulePreferences>): Promise<boolean>;
    postScreenScheduleTrigger(value?: any): void;
    postScreenScheduleOnHour(value?: any): void;
    postScreenScheduleOffHour(value?: any): void;
    postScreenScheduleMode(value?: any): void;
    postScreenScheduleWakeTimeout(value?: any): void;
    postScreenScheduleWakeBrightness(value?: any): void;
    postScreenScheduleDimmedBrightness(value?: any): void;
    postScreenScheduleClockBrightness(value?: any): void;
    postScreenScheduleClockTextColor(value: string): void;
}

export function createScreenSchedulePostApiFeature(
    entityState: Pick<EntityStateFeature, "entityName" | "entityObjectIds">,
    requestApi: Pick<ApplicationApiFeature, "postWithObjectIds" | "postTextWithObjectIds" | "postNumberWithObjectIds" | "postSelectWithObjectIds" | "postSwitchWithObjectIds">,
    saveSchedule: (patch: Partial<ScreenSchedulePreferences>, legacy: () => void) => Promise<boolean>,
): ScreenSchedulePostApiFeature {
    const { entityName, entityObjectIds } = entityState;
    const {
        postWithObjectIds,
        postTextWithObjectIds,
        postNumberWithObjectIds,
        postSelectWithObjectIds,
        postSwitchWithObjectIds,
    } = requestApi;
    // ── Screen Schedule Post API ──────────────────────────────────────────
    var SCREEN_SCHEDULE_UNAVAILABLE: any = "Screen schedule is not available on this firmware. Update the device firmware, then reload this page.";
    var SCREEN_SCHEDULE_TRIGGER_UNAVAILABLE: any = "The schedule trigger setting is not available on this firmware. Update the device firmware, then reload this page.";
    var SCREEN_SCHEDULE_WAKE_TIMEOUT_UNAVAILABLE: any = "The schedule wake timeout setting is not available on this firmware. Update the device firmware, then reload this page.";
    var SCREEN_SCHEDULE_WAKE_BRIGHTNESS_UNAVAILABLE: any = "The schedule wake brightness setting is not available on this firmware. Update the device firmware, then reload this page.";
    var SCREEN_SCHEDULE_MODE_UNAVAILABLE: any = "The schedule mode setting is not available on this firmware. Update the device firmware, then reload this page.";
    var SCREEN_SCHEDULE_DIMMED_BRIGHTNESS_UNAVAILABLE: any = "The schedule dimmed brightness setting is not available on this firmware. Update the device firmware, then reload this page.";
    var SCREEN_SCHEDULE_CLOCK_BRIGHTNESS_UNAVAILABLE: any = "The schedule clock brightness setting is not available on this firmware. Update the device firmware, then reload this page.";
    var BRIGHTNESS_MODE_UNAVAILABLE: any = "Brightness modes are not available on this firmware. Update the device firmware, then reload this page.";
    var DISPLAY_BACKLIGHT_UNAVAILABLE: any = "Manual backlight control is not available on this firmware. Update the device firmware, then reload this page.";
    var BRIGHTNESS_TIME_UNAVAILABLE: any = "Manual brightness times are not available on this firmware. Update the device firmware, then reload this page.";
    function postBrightnessMode(this: any, value?: any) {
        postSelectWithObjectIds(entityName("screen_brightness_mode"), entityObjectIds("screen_brightness_mode"), brightnessModeOption(value), BRIGHTNESS_MODE_UNAVAILABLE);
    }
    function postDisplayBacklightBrightness(this: any, value?: any) {
        var percent: any = parseFloat(value);
        if (!isFinite(percent))
            percent = 100;
        percent = Math.max(1, Math.min(100, percent));
        var brightness255: any = Math.round(percent * 2.55);
        postWithObjectIds("light", entityName("display_backlight"), entityObjectIds("display_backlight"), "turn_on?brightness=" + brightness255, DISPLAY_BACKLIGHT_UNAVAILABLE);
    }
    function postBrightnessDawnTime(this: any, value?: any) {
        postTextWithObjectIds(entityName("screen_brightness_dawn_time"), entityObjectIds("screen_brightness_dawn_time"), normalizeTimeOfDay(value, state.brightnessDawnTime || "06:00"), BRIGHTNESS_TIME_UNAVAILABLE);
    }
    function postBrightnessDuskTime(this: any, value?: any) {
        postTextWithObjectIds(entityName("screen_brightness_dusk_time"), entityObjectIds("screen_brightness_dusk_time"), normalizeTimeOfDay(value, state.brightnessDuskTime || "18:00"), BRIGHTNESS_TIME_UNAVAILABLE);
    }
    function postScreenSchedulePreferences(patch: Partial<ScreenSchedulePreferences>): Promise<boolean> {
        return saveSchedule(patch, () => {
            const postNumber = (key: Parameters<typeof entityName>[0], value: number | undefined, message: string) => {
                if (value !== undefined) postNumberWithObjectIds(entityName(key), entityObjectIds(key), value, message);
            };
            if (patch.scheduleTrigger !== undefined) {
                const trigger = normalizeScheduleTrigger(patch.scheduleTrigger, state.scheduleEnabled);
                postTextWithObjectIds(entityName("screen_schedule_trigger"), entityObjectIds("screen_schedule_trigger"),
                    trigger, SCREEN_SCHEDULE_TRIGGER_UNAVAILABLE);
                postSwitchWithObjectIds(entityName("screen_schedule_enabled"), entityObjectIds("screen_schedule_enabled"),
                    trigger === "time", SCREEN_SCHEDULE_UNAVAILABLE);
            }
            postNumber("screen_schedule_on_hour", patch.scheduleOnHour, SCREEN_SCHEDULE_UNAVAILABLE);
            postNumber("screen_schedule_off_hour", patch.scheduleOffHour, SCREEN_SCHEDULE_UNAVAILABLE);
            if (patch.scheduleMode !== undefined) {
                postSelectWithObjectIds(entityName("screen_schedule_mode"), entityObjectIds("screen_schedule_mode"),
                    scheduleModeOption(patch.scheduleMode), SCREEN_SCHEDULE_MODE_UNAVAILABLE);
            }
            postNumber("screen_schedule_wake_timeout", patch.scheduleWakeTimeout, SCREEN_SCHEDULE_WAKE_TIMEOUT_UNAVAILABLE);
            postNumber("screen_schedule_wake_brightness", patch.scheduleWakeBrightness, SCREEN_SCHEDULE_WAKE_BRIGHTNESS_UNAVAILABLE);
            postNumber("screen_schedule_dimmed_brightness", patch.scheduleDimmedBrightness, SCREEN_SCHEDULE_DIMMED_BRIGHTNESS_UNAVAILABLE);
            postNumber("screen_schedule_clock_brightness", patch.scheduleClockBrightness, SCREEN_SCHEDULE_CLOCK_BRIGHTNESS_UNAVAILABLE);
            if (patch.scheduleClockTextColor !== undefined) {
                postTextWithObjectIds(entityName("screen_schedule_clock_text_color"), entityObjectIds("screen_schedule_clock_text_color"),
                    patch.scheduleClockTextColor, SCREEN_SCHEDULE_UNAVAILABLE);
            }
        });
    }
    return {
        postBrightnessMode,
        postDisplayBacklightBrightness,
        postBrightnessDawnTime,
        postBrightnessDuskTime,
        postScreenSchedulePreferences,
        postScreenScheduleTrigger: (value) => { void postScreenSchedulePreferences({ scheduleTrigger: value }); },
        postScreenScheduleOnHour: (value) => { void postScreenSchedulePreferences({ scheduleOnHour: value }); },
        postScreenScheduleOffHour: (value) => { void postScreenSchedulePreferences({ scheduleOffHour: value }); },
        postScreenScheduleMode: (value) => { void postScreenSchedulePreferences({ scheduleMode: value }); },
        postScreenScheduleWakeTimeout: (value) => { void postScreenSchedulePreferences({ scheduleWakeTimeout: value }); },
        postScreenScheduleWakeBrightness: (value) => { void postScreenSchedulePreferences({ scheduleWakeBrightness: value }); },
        postScreenScheduleDimmedBrightness: (value) => { void postScreenSchedulePreferences({ scheduleDimmedBrightness: value }); },
        postScreenScheduleClockBrightness: (value) => { void postScreenSchedulePreferences({ scheduleClockBrightness: value }); },
        postScreenScheduleClockTextColor: (value) => { void postScreenSchedulePreferences({ scheduleClockTextColor: value }); },
    };
}
