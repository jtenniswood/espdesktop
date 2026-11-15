import { createCompanionCatalogue, type CompanionAction } from "../api/companion_catalogue";
import type { CardConfig } from "../contracts/types";
import type { NativePanelConfigController } from "../controllers/native_panel_config_controller";
import { emptyCardConfig, isEmptyCardConfig, OBS_FADER_PREFIX } from "../model/card";
import { OBS_BRB_ID, OBS_TAKE_ID, savedOBSSceneTarget } from "../model/companion_card_codec";
import { parseGridOrder } from "../model/grid";
import type { NativeLayoutDraft } from "../model/native_layout_draft";
import type { NativePanelConfigGraph } from "../model/panel_config_conversion";
import type { ApplicationLayoutState } from "./application_context";
import type { ControlsShellFeature } from "./controls_shell";

type Geometry = Pick<ApplicationLayoutState, "numSlots" | "previewSlots" | "totalSlots" | "gridCols">;
type Choices = { main: string; away: string; mic: string };
type Controls = ReturnType<typeof obsStarterControls>;

export function obsStarterControls(actions: readonly CompanionAction[]) {
    const ids = new Set(actions.map(action => action.id));
    const scenes = actions.flatMap(action => {
        const id = savedOBSSceneTarget(action.id);
        return id ? [{ id, label: action.label.replace(/^(Preview|Queue|Program|On air) · /, "") }] : [];
    });
    const mics = actions.filter(action => /^obs\.mute\.[0-9a-f-]{36}$/.test(action.id))
        .map(action => ({ id: action.id, label: action.label.replace(/^(Muted|Unmuted) · /, "") }));
    return { ids, scenes, mics };
}

function starterSlot({ document, layout }: NativePanelConfigGraph, geometry: Geometry) {
    const { totalSlots, previewSlots, gridCols } = geometry;
    const order = document.settings.button_order || "";
    const { grid } = parseGridOrder(order, totalSlots, gridCols, undefined, previewSlots);
    const tokens = order ? order.split(",") : [];
    const cell = grid.findIndex((value, index) => index < previewSlots && value === 0 && !tokens[index]?.trim());
    const savedCards = layout.rootCards.filter(card => !isEmptyCardConfig(card.config));
    const used = new Set([...savedCards.map(card => card.slot), ...layout.pages.map(page => page.key), ...grid]);
    let slot = 1;
    while (used.has(slot)) ++slot;
    if (cell < 0 || slot > previewSlots) throw new Error("Make room for one card on Home, then try again.");
    while (tokens.length <= cell) tokens.push("");
    tokens[cell] = String(slot);
    return { slot, order: tokens.join(",") };
}

export function pinOBSStarterPage(draft: NativeLayoutDraft, current: NativePanelConfigGraph,
    controls: Controls, choices: Choices, geometry: Geometry): void {
    const { ids, scenes, mics } = controls;
    if (choices.main === choices.away || !scenes.some(scene => scene.id === choices.main) ||
        !scenes.some(scene => scene.id === choices.away) || !mics.some(mic => mic.id === choices.mic)) {
        throw new Error("Choose two different scenes and a mic from the current OBS collection.");
    }
    const { slot, order } = starterSlot(current, geometry);
    const card = (entity: string, icon: string, type = "companion", label = ""): CardConfig =>
        ({ ...emptyCardConfig(), entity, icon, type, label });
    const cards = [
        card("obs.status.program", "Monitor"),
        card(choices.main, "Monitor", "companion", "Main scene"),
        card(choices.away, "Monitor", "companion", "Break scene"),
        card(choices.mic, "Microphone", "companion", "Mic"),
        card(OBS_TAKE_ID, "Arrow Right"),
        card("obs.status.stream", "Monitor"),
    ];
    const awayUuid = choices.away.slice("obs.target.".length);
    if (ids.has("obs.brb.scene." + awayUuid)) cards.push(card(OBS_BRB_ID, "Monitor"));
    const micLevel = OBS_FADER_PREFIX + choices.mic.slice("obs.mute.".length);
    if (ids.has(micLevel)) cards.push(card(micLevel, "Microphone", "slider", "Mic level"));
    if (ids.has("obs.replay")) cards.push(card("obs.replay", "History"));
    const visible = cards.slice(0, geometry.numSlots - 1);
    const folder = card("", "Monitor", "subpage", "OBS Studio");
    folder.options = "subpage_connector=mac_companion";
    draft.writeRootCard(slot, folder);
    draft.writePage(slot, { order: ["B", ...visible.map((_, index) => String(index + 1))].join(","), cards: visible });
    draft.writeSetting("button_order", order);
}

export function createOBSStarterPage(deps: {
    document: Document;
    fetch: typeof fetch;
    native: NativePanelConfigController;
    layout: Geometry;
    shell: Pick<ControlsShellFeature, "isConfigLocked" | "showBanner">;
    onSaved(mirrorFailed: boolean): void;
}) {
    const catalogue = createCompanionCatalogue(deps.fetch);
    let open: HTMLDialogElement | null = null;

    return function openOBSStarterPage(): void {
        if (open) return;
        const { document, native, layout } = deps;
        const dialog = document.createElement("dialog");
        open = dialog;
        dialog.className = "sp-settings-modal sp-config sp-first-run";
        dialog.setAttribute("aria-labelledby", "sp-obs-starter-title");
        const form = document.createElement("form");
        const title = document.createElement("h1");
        title.id = "sp-obs-starter-title";
        title.className = "sp-setup-title";
        title.textContent = "Add OBS starter page";
        const status = document.createElement("p");
        status.setAttribute("role", "status");
        status.textContent = "Loading scenes and inputs from OBS…";

        function field(label: string) {
            const row = document.createElement("label");
            row.className = "sp-field";
            row.append(label);
            const select = document.createElement("select");
            select.required = true;
            select.disabled = true;
            row.append(select);
            return { row, select };
        }
        const main = field("Main scene");
        const away = field("Break scene");
        const mic = field("Microphone");
        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.className = "sp-action-btn sp-cancel-btn";
        cancel.textContent = "Cancel";
        const pin = document.createElement("button");
        pin.className = "sp-action-btn sp-save-btn";
        pin.textContent = "Pin to Home";
        pin.disabled = true;
        const buttons = document.createElement("div");
        buttons.className = "sp-setup-actions";
        buttons.append(cancel, pin);
        form.append(title, status, main.row, away.row, mic.row, buttons);
        dialog.append(form);
        document.body.append(dialog);
        dialog.addEventListener("close", () => { dialog.remove(); open = null; });
        cancel.onclick = () => dialog.close();
        dialog.addEventListener("cancel", event => {
            if (cancel.disabled) event.preventDefault();
        });
        dialog.showModal();

        void catalogue.load(true).then(actions => {
            if (!dialog.isConnected) return;
            const controls = obsStarterControls(actions);
            if (controls.scenes.length < 2 || !controls.mics.length) {
                status.textContent = "Connect OBS in Mac Companion and open a collection with two scenes and a mic.";
                return;
            }
            for (const [select, items] of [[main.select, controls.scenes], [away.select, controls.scenes],
                [mic.select, controls.mics]] as const) {
                select.append(new Option("Choose…", ""), ...items.map(item => new Option(item.label, item.id)));
                select.disabled = false;
            }
            status.textContent = "Pins an editable OBS folder in a free slot on Home.";
            pin.disabled = false;
        }).catch(() => { status.textContent = "Could not load OBS. Check Mac Companion and reopen setup."; });

        form.onsubmit = async event => {
            event.preventDefault();
            if (pin.disabled) return;
            if (main.select.value === away.select.value) {
                status.textContent = "Choose two different scenes.";
                return;
            }
            pin.disabled = cancel.disabled = true;
            try {
                if (deps.shell.isConfigLocked() || await native.waitForDiscovery() !== true ||
                    native.writableNavigationDepth() < 2) throw new Error("Reconnect the display before pinning the page.");
                const choices = { main: main.select.value, away: away.select.value, mic: mic.select.value };
                const fresh = obsStarterControls(await catalogue.load(true));
                const existing = await native.readSnapshot();
                if (!existing?.layout) throw new Error("Could not read the current Home layout.");
                starterSlot({ ...existing, layout: existing.layout }, layout);
                const result = await native.schedule(Object.assign(
                    () => { throw new Error("The OBS page needs native layout support."); },
                    { editNative: (draft: NativeLayoutDraft, current: NativePanelConfigGraph) =>
                        pinOBSStarterPage(draft, current, fresh, choices, layout) },
                ));
                if (result !== "saved" && result !== "mirror-failed")
                    throw new Error("Could not pin the OBS page. Reload to check Home before retrying.");
                dialog.close();
                deps.onSaved(result === "mirror-failed");
            } catch (error) {
                status.textContent = error instanceof Error ? error.message : "Could not pin the OBS page.";
            } finally {
                pin.disabled = cancel.disabled = false;
            }
        };
    };
}
