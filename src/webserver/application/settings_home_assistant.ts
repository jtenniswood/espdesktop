import type { ControlsFieldsFeature } from "./controls_fields";
import type { ControlsShellFeature } from "./controls_shell";

export function buildHomeAssistantSettings(
    makeCard: ControlsFieldsFeature["makeCollapsibleCard"],
    makeButton: ControlsShellFeature["createActionButton"],
): HTMLElement {
    const body = document.createElement("div");
    const status = document.createElement("p");
    status.setAttribute("role", "status");
    const pair = makeButton("sp-action-btn", "Pair Home Assistant", "link");
    const disconnect = makeButton("sp-action-btn", "Disconnect", "link-off");
    const card = makeCard("Home Assistant", body, true) as HTMLElement;
    card.hidden = true;
    body.append(status, pair, disconnect);
    let pending = false;
    let timer: number | undefined;
    async function update(action?: "pair" | "disconnect") {
        if (pending) return;
        pending = true;
        pair.disabled = disconnect.disabled = true;
        try {
            const response = await fetch("/api/v1/home-assistant", {
                method: action ? "POST" : "GET",
                headers: action ? { "X-EspDesktop-Request": action } : {},
                cache: "no-store",
            });
            if (!response.ok) throw new Error("Setup failed");
            const { paired } = await response.json();
            if (typeof paired !== "boolean") return;
            card.hidden = false;
            disconnect.hidden = !paired;
            status.textContent = action === "pair" ?
                "Enter the fingerprint and code shown on the unlocked display in Home Assistant." :
                paired ? "Home Assistant is paired." : "Home Assistant is disconnected.";
            if (action === "pair") {
                window.clearTimeout(timer);
                const end = Date.now() + 120_000;
                const poll = async () => {
                    if (!card.isConnected || Date.now() >= end) return;
                    try {
                        const response = await fetch("/api/v1/home-assistant", { cache: "no-store" });
                        if (response.ok && (await response.json()).paired) {
                            await update();
                            return;
                        }
                    } catch { /* Try again during the pairing window. */ }
                    timer = window.setTimeout(poll, 3000);
                };
                timer = window.setTimeout(poll, 3000);
            }
        } catch {
            if (action) status.textContent = "Home Assistant setup could not be changed. Try again.";
        } finally {
            pending = false;
            pair.disabled = disconnect.disabled = false;
        }
    }
    pair.addEventListener("click", () => void update("pair"));
    disconnect.addEventListener("click", () => {
        window.clearTimeout(timer);
        void update("disconnect");
    });
    void update();
    return card;
}
