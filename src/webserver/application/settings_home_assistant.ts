import { resetAwareFetch } from "../api/reset_session";
import type { ControlsFieldsFeature } from "./controls_fields";

const PATH = "/api/v1/home-assistant";

export function buildHomeAssistantSettings(
    makeCard: ControlsFieldsFeature["makeCollapsibleCard"],
    toggleRow: ControlsFieldsFeature["toggleRow"],
): HTMLElement {
    const body = document.createElement("div");
    const control = toggleRow("Enable ESPHome API", "sp-enable-esphome-api", false);
    const status = document.createElement("p");
    status.className = "sp-setting-note";
    status.setAttribute("role", "status");
    status.textContent = "Changing this setting restarts the display.";
    body.append(control.row, status);
    const card = makeCard("Home Assistant", body, true) as HTMLElement;
    card.hidden = true;
    let enabled = false;

    void resetAwareFetch(PATH, { cache: "no-store" }).then(async response => {
        if (!response.ok) return;
        const settings = await response.json();
        if (typeof settings.enabled !== "boolean") return;
        enabled = settings.enabled;
        control.input.checked = enabled;
        card.hidden = false;
    }).catch(() => {});

    control.input.addEventListener("change", async () => {
        const next = control.input.checked;
        control.input.disabled = true;
        try {
            const response = await resetAwareFetch(PATH, {
                method: "POST",
                headers: { "X-EspDesktop-Request": next ? "enable-esphome" : "disable-esphome" },
            });
            if (!response.ok || (await response.json()).enabled !== next) throw new Error("Save failed");
            enabled = next;
            status.textContent = "Setting saved. The display is restarting.";
        } catch {
            control.input.checked = enabled;
            status.textContent = "Could not save the setting. Try again.";
        } finally {
            control.input.disabled = false;
        }
    });
    return card;
}
