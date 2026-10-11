export const APP_ICON_CUSTOM_COLOUR_CONTROL_SETTING = "companion_app_custom_colour_control";
export const APP_ICON_AUTO_COLOUR_GENERATION_SETTING = "companion_app_auto_colour_generation";

export function panelSettingEnabled(value: string | undefined, fallback = true): boolean {
    if (value === "true") return true;
    if (value === "false") return false;
    return fallback;
}
