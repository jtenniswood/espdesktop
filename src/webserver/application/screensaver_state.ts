import { state } from "../state/app_instance";
import { normalizeScreensaverMode } from "../model/settings";

export function getActiveScreensaverMode() {
    return normalizeScreensaverMode(state.screensaverMode);
}
