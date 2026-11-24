import { resetAwareFetch } from "../api/reset_session";
import type { SettingsUiFeature } from "../features/settings";
import type { ControlsFieldsFeature } from "./controls_fields";

const PATH = "/api/v1/home-assistant";

export function buildHomeAssistantSettings(
    makeCard: ControlsFieldsFeature["makeCollapsibleCard"],
    toggleRow: ControlsFieldsFeature["toggleRow"],
    { infoPanel, statusBadge }: Pick<SettingsUiFeature, "infoPanel" | "statusBadge">,
): HTMLElement {
    const body = document.createElement("div");
    const control = toggleRow("Enable ESPHome API", "sp-enable-esphome-api", false);
    const status = document.createElement("div");
    status.setAttribute("role", "status");
    const note = document.createElement("p");
    note.className = "sp-setting-note";
    note.textContent = "Changing this setting restarts the display.";
    status.append(note);
    const actions = document.createElement("div");
    actions.className = "sp-btn-row";
    const resync = document.createElement("button");
    resync.type = "button";
    resync.className = "sp-action-btn sp-neutral-btn";
    resync.textContent = "Resync buttons";
    resync.disabled = true;
    actions.append(resync);
    body.append(control.row, status, actions);
    const badge = statusBadge("ESPHome API enabled");
    badge.classList.add("sp-card-badge", "sp-hidden");
    const card = makeCard("Home Assistant", body, true, badge) as HTMLElement;
    card.hidden = true;
    let enabled = false;

    void resetAwareFetch(PATH, { cache: "no-store" }).then(async response => {
        if (!response.ok) return;
        const settings = await response.json();
        if (typeof settings.enabled !== "boolean") return;
        enabled = settings.enabled;
        badge.classList.toggle("sp-hidden", !enabled);
        control.input.checked = enabled;
        resync.disabled = !enabled;
        card.hidden = false;
    }).catch(() => {});

    control.input.addEventListener("change", async () => {
        const next = control.input.checked;
        control.input.disabled = true;
        resync.disabled = true;
        try {
            const response = await resetAwareFetch(PATH, {
                method: "POST",
                headers: { "X-EspDesktop-Request": next ? "enable-esphome" : "disable-esphome" },
            });
            if (!response.ok || (await response.json()).enabled !== next) throw new Error("Save failed");
            enabled = next;
            badge.classList.toggle("sp-hidden", !enabled);
            status.replaceChildren(infoPanel(
                "sp-esphome-restarting",
                "Setting saved. The display is restarting.",
            ));
        } catch {
            control.input.checked = enabled;
            note.textContent = "Could not save the setting. Try again.";
            status.replaceChildren(note);
            control.input.disabled = false;
            resync.disabled = !enabled;
        }
    });

    resync.addEventListener("click", async () => {
        control.input.disabled = true;
        resync.disabled = true;
        try {
            const response = await resetAwareFetch(PATH, {
                method: "POST",
                headers: { "X-EspDesktop-Request": "resync-buttons" },
            });
            if (!response.ok) throw new Error("Resync failed");
            status.replaceChildren(infoPanel(
                "sp-esphome-resync",
                "Button refresh requested. Home Assistant will reconnect shortly.",
            ));
        } catch {
            note.textContent = "Could not request a button refresh. Try again.";
            status.replaceChildren(note);
        } finally {
            control.input.disabled = false;
            resync.disabled = !enabled;
        }
    });
    return card;
}
