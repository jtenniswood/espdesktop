import { createCompanionCatalogue, type CompanionAction } from "../api/companion_catalogue";
import type { CardConfig } from "../contracts/types";
import type { NativePanelConfigController } from "../controllers/native_panel_config_controller";
import { emptyCardConfig, isEmptyCardConfig, OBS_FADER_PREFIX } from "../model/card";
import { companionCardDefaultIcon } from "../model/companion_card";
import { COMPANION_DEFAULT_BROWSER, companionUrlConfig, OBS_BRB_ID, OBS_CONNECTION_ID, YOUTUBE_STATUS_ID, OBS_REPLAY_BUFFER_ID, OBS_REPLAY_ID, OBS_STUDIO_ID, OBS_TAKE_ID, OBS_TRANSITION_ID, obsInputName, savedOBSSceneTarget } from "../model/companion_card_codec";
import { parseGridOrder } from "../model/grid";
import { childPageKey } from "../model/page_keys";
import { FIRST_RUN_COMPLETE } from "./first_run_setup";
import type { NativeLayoutDraft } from "../model/native_layout_draft";
import type { NativePanelConfigGraph } from "../model/panel_config_conversion";
import type { ApplicationLayoutState } from "./application_context";
import type { ControlsShellFeature } from "./controls_shell";

type Geometry = Pick<ApplicationLayoutState, "numSlots" | "previewSlots" | "totalSlots" | "gridCols">;
type Choices = { main: string; away: string; mic: string; layout?: "grouped" | "youtube-live"; liveAction?: "take" | "save-replay" };
type Controls = ReturnType<typeof obsStarterControls>;

export function obsStarterControls(actions: readonly CompanionAction[]) {
    const ids = new Set(actions.map(action => action.id));
    const scenes = actions.flatMap(action => {
        const id = savedOBSSceneTarget(action.id);
        return id ? [{ id, label: action.label }] : [];
    });
    const mics = actions.filter(action => /^obs\.mute\.[0-9a-f-]{36}$/.test(action.id))
        .map(action => ({ id: action.id, label: obsInputName(action.label) }));
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
    if (!scenes.some(scene => scene.id === choices.main) || (choices.away &&
        (choices.main === choices.away || !scenes.some(scene => scene.id === choices.away))) ||
        (choices.mic && !mics.some(mic => mic.id === choices.mic))) {
        throw new Error("Choose scenes and a microphone from the current OBS collection.");
    }
    const { slot, order } = starterSlot(current, geometry);
    if (geometry.numSlots < 6) throw new Error("OBS setup needs at least six grid cells.");
    const card = (entity: string, icon: string, label = "", type = "companion"): CardConfig =>
        ({ ...emptyCardConfig(), entity, icon, type, label });
    const folder = (label: string, icon: string): CardConfig =>
        ({ ...card("", icon, label, "subpage"), options: "subpage_connector=mac_companion" });
    const savePage = (key: number, cards: CardConfig[]) =>
        draft.writePage(key, { order: ["B", ...cards.map((_, index) => index + 1)].join(","), cards });
    if (choices.layout === "youtube-live") {
        const status = [card(OBS_CONNECTION_ID, "Monitor"), card(YOUTUBE_STATUS_ID, "Broadcast")];
        const controls = [card(choices.main, companionCardDefaultIcon("obs"))];
        if (choices.mic) controls.push(card(choices.mic, "Microphone"));
        if (choices.away) controls.push(card(choices.away, companionCardDefaultIcon("obs")));
        const canReplay = [...ids].some(id => id.startsWith(OBS_REPLAY_BUFFER_ID + "."));
        const replay = choices.liveAction === "save-replay" && canReplay;
        controls.push(card(replay ? OBS_REPLAY_ID : OBS_TAKE_ID, replay ? "History" : "Arrow Right"));
        controls.push(card("obs.output.record", "Record"));
        if ([...ids].some(id => id.startsWith("obs.brb.scene."))) {
            controls.push(card(OBS_BRB_ID, companionCardDefaultIcon("obs_brb")));
        }
        const controlRoom = card(COMPANION_DEFAULT_BROWSER, "Web", "YouTube Studio");
        controlRoom.sensor = companionUrlConfig("https://studio.youtube.com/");
        const tools = [card("obs.output.stream", "Broadcast"), controlRoom,
            replay ? card(OBS_REPLAY_BUFFER_ID, "Repeat")
                : card(OBS_STUDIO_ID, companionCardDefaultIcon("obs_studio"))];
        const visibleControls = controls.splice(0, Math.max(0, geometry.numSlots - status.length - 2));
        // Compact grids keep the same essential controls and move overflow to the controls page.
        draft.writeRootCard(slot, folder("YouTube Live", "Broadcast"));
        savePage(slot, [...status, ...visibleControls, folder("Controls", "View Grid")]);
        const controlsSlot = status.length + visibleControls.length + 1;
        savePage(childPageKey(slot, controlsSlot), [...controls, ...tools].slice(0, geometry.numSlots - 1));
        draft.writeSetting("button_order", order);
        draft.writeSetting(FIRST_RUN_COMPLETE, "1");
        return;
    }
    const switching = [card(choices.main, companionCardDefaultIcon("obs"))];
    if (choices.away) switching.push(card(choices.away, companionCardDefaultIcon("obs")));
    switching.push(card(OBS_STUDIO_ID, companionCardDefaultIcon("obs_studio")), card(OBS_TAKE_ID, "Arrow Right"));
    if ([...ids].some(id => id === OBS_TRANSITION_ID || id.startsWith(OBS_TRANSITION_ID + ".")))
        switching.push(card(OBS_TRANSITION_ID, companionCardDefaultIcon("obs_transition")));

    const outputs = [card("obs.output.stream", "Broadcast"), card("obs.output.record", "Record")];
    if (ids.has(OBS_REPLAY_ID) || [...ids].some(id => id.startsWith(OBS_REPLAY_BUFFER_ID + "."))) {
        outputs.push(card(OBS_REPLAY_BUFFER_ID, "Repeat"), card(OBS_REPLAY_ID, "History"));
    }
    const groups = [
        { card: folder("Switching", "Image"), cards: switching },
        { card: folder("Outputs", "Broadcast"), cards: outputs },
    ];
    if (choices.mic) {
        const uuid = choices.mic.slice("obs.mute.".length);
        const audio = [card(choices.mic, "Microphone", "Mic")];
        if (ids.has(OBS_FADER_PREFIX + uuid))
            audio.push(card(OBS_FADER_PREFIX + uuid, "Microphone", "Mic level", "slider"));
        if (ids.has("obs.cough." + uuid))
            audio.push(card("obs.cough." + uuid, "Microphone Off", "", "companion_obs_cough"));
        groups.splice(1, 0, { card: folder("Audio", "Microphone"), cards: audio });
    }
    const landing = [...groups.map(group => group.card), card("obs.status.program", "Monitor")];
    if (choices.away && ids.has("obs.brb.scene." + choices.away.slice("obs.target.".length)))
        landing.push(card(OBS_BRB_ID, companionCardDefaultIcon("obs_brb")));

    draft.writeRootCard(slot, folder("OBS Studio", "Monitor"));
    savePage(slot, landing);
    groups.forEach((group, index) => savePage(childPageKey(slot, index + 1), group.cards));
    draft.writeSetting("button_order", order);
    draft.writeSetting(FIRST_RUN_COMPLETE, "1");
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

    return function openOBSStarterPage(onPinned?: () => void): void {
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

        function field(label: string, required = false) {
            const row = document.createElement("label");
            row.className = "sp-field";
            row.append(label);
            const select = document.createElement("select");
            select.required = required;
            select.disabled = true;
            row.append(select);
            return { row, select };
        }
        const layoutChoice = field("Layout", true);
        layoutChoice.select.append(new Option("OBS Studio", "grouped"), new Option("YouTube Live", "youtube-live"));
        const main = field("Main scene", true);
        const away = field("Break scene");
        const mic = field("Microphone");
        const liveAction = field("Live action", true);
        const replayOption = new Option("Save Replay", "save-replay");
        liveAction.select.append(new Option("Take Live", "take"), replayOption);
        liveAction.row.hidden = true;
        const layoutInfo = () => {
            const youtube = layoutChoice.select.value === "youtube-live";
            liveAction.row.hidden = !youtube;
            const awayLabel = away.row.firstChild;
            if (awayLabel) awayLabel.textContent = youtube ? "Second scene" : "Break scene";
            status.textContent = youtube
                ? "Adds a YouTube Live page with your scenes, mic and broadcast status."
                : "Adds an OBS Studio folder on Home with Switching, Outputs and optional Audio controls.";
        };
        layoutChoice.select.onchange = layoutInfo;
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
        form.append(title, status, layoutChoice.row, main.row, away.row, mic.row, liveAction.row, buttons);
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
            const firstScene = controls.scenes[0];
            if (!firstScene) {
                status.textContent = "Connect OBS in Mac Companion and open a scene collection, then reopen setup.";
                return;
            }
            const program = actions.find(action => action.id === "obs.status.program")?.label.slice("Program · ".length);
            const configuredBreak = controls.scenes.find(scene => controls.ids.has("obs.brb.scene." + scene.id.slice("obs.target.".length)));
            const mainScene = controls.scenes.find(scene => scene.label === program)
                ?? controls.scenes.find(scene => scene !== configuredBreak) ?? firstScene;
            const breakScene = configuredBreak !== mainScene ? configuredBreak : undefined;
            for (const [select, items, value] of [
                [main.select, controls.scenes, mainScene.id],
                [away.select, controls.scenes, (breakScene ?? controls.scenes.find(scene => scene !== mainScene))?.id],
                [mic.select, controls.mics, (controls.mics.find(input => /mic/i.test(input.label)) ?? controls.mics[0])?.id],
            ] as const) {
                if (!select.required) select.append(new Option("None", ""));
                select.append(...items.map(item => new Option(item.label, item.id)));
                select.value = value ?? "";
                select.disabled = items.length === 0;
            }
            layoutChoice.select.disabled = false;
            liveAction.select.disabled = false;
            const replayAvailable = actions.some(action => action.id.startsWith(OBS_REPLAY_BUFFER_ID + "."));
            replayOption.disabled = !replayAvailable;
            layoutInfo();
            pin.disabled = false;
        }).catch(() => { status.textContent = "Could not load OBS. Check Mac Companion and reopen setup."; });

        form.onsubmit = async event => {
            event.preventDefault();
            if (pin.disabled) return;
            if (away.select.value && main.select.value === away.select.value) {
                status.textContent = "Choose two different scenes.";
                return;
            }
            pin.disabled = cancel.disabled = true;
            try {
                if (deps.shell.isConfigLocked() || await native.waitForDiscovery() !== true ||
                    native.writableNavigationDepth() < 2) throw new Error("Reconnect the display before pinning the page.");
                const choices: Choices = {
                    main: main.select.value, away: away.select.value, mic: mic.select.value,
                    layout: layoutChoice.select.value === "youtube-live" ? "youtube-live" : "grouped",
                    liveAction: liveAction.select.value === "save-replay" ? "save-replay" : "take",
                };
                const fresh = obsStarterControls(await catalogue.load(true));
                const existing = await native.readSnapshot();
                if (!existing?.layout) throw new Error("Could not read the current Home layout.");
                const result = await native.schedule(Object.assign(
                    () => { throw new Error("The OBS page needs native layout support."); },
                    { editNative: (draft: NativeLayoutDraft, current: NativePanelConfigGraph) =>
                        pinOBSStarterPage(draft, current, fresh, choices, layout) },
                ));
                if (result !== "saved" && result !== "mirror-failed")
                    throw new Error("Could not pin the OBS page. Reload to check Home before retrying.");
                dialog.close();
                onPinned?.();
                deps.onSaved(result === "mirror-failed");
            } catch (error) {
                status.textContent = error instanceof Error ? error.message : "Could not pin the OBS page.";
            } finally {
                pin.disabled = cancel.disabled = false;
            }
        };
    };
}
