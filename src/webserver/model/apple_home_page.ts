import manifest from "../../../devices/manifest.json";
import { emptyCardConfig, isEmptyCardConfig } from "./card";
import { configOptionValue, setConfigOptionValue } from "./config_primitives";
import { parseGridOrder, serializeGridOrder } from "./grid";
import { NativeLayoutDraft } from "./native_layout_draft";
import { decodePanelPageSnapshot } from "./panel_config_conversion";
import { buildSubpageGrid, parseSubpageOrder, serializeSubpageGrid } from "./subpage";

const marker = "espdesktop_apple_home";

export function buildAppleHomePage(input: Uint8Array, action: string, label: string): Uint8Array | null {
    if (!/^applehome\.control\.[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(action) || !label.trim())
        throw new Error("Choose a control and give its card a label.");

    const { document, layout } = decodePanelPageSnapshot(input);
    const profile = (manifest.devices as Record<string, { slots: number; layout: { cols: number } }>)[document.deviceProfile];
    if (!profile) throw new Error("This display profile is unsupported.");

    const owner = layout.rootCards.find(({ config }) =>
        config.type === "subpage" && configOptionValue(config.options, marker) === "1");
    const draft = new NativeLayoutDraft(input);
    const card = { ...emptyCardConfig(), type: "companion", entity: action, label, icon: "Home" };
    if (!owner) {
        const occupied = new Set(layout.rootCards.filter(({ config }) => !isEmptyCardConfig(config)).map(item => item.slot));
        const slot = Array.from({ length: profile.slots }, (_, index) => index + 1).find(value => !occupied.has(value));
        const savedOrder = document.settings.button_order || [...occupied].join(",");
        const occupiedOrder = savedOrder.split(",").map(token =>
            occupied.has(Number.parseInt(token, 10)) ? token : "").join(",");
        const { grid, sizes } = parseGridOrder(occupiedOrder, profile.slots, profile.layout.cols);
        const cell = grid.indexOf(0);
        if (slot === undefined || cell < 0) throw new Error("Free one tile on the display home page, then try again.");
        draft.writeRootCard(slot, { ...emptyCardConfig(), type: "subpage", label: "Apple Home", icon: "Home",
            options: setConfigOptionValue("", marker, "1") });
        draft.writePage(slot, { order: "B,1", cards: [card] });
        grid[cell] = slot;
        draft.writeSetting("button_order", serializeGridOrder(grid, sizes));
        return draft.finish();
    }

    const page = draft.readPage(owner.slot) ?? { order: "B", cards: [] };
    const existing = page.cards.findIndex(value => value.entity === action);
    if (existing >= 0) {
        if (page.cards[existing]?.label === label) return null;
        draft.renameCard(owner.slot, existing + 1, label);
        return draft.finish();
    }

    const order = parseSubpageOrder(page.order);
    const { grid, sizes } = buildSubpageGrid({ order: order.order, buttons: page.cards },
        profile.slots, profile.layout.cols);
    const changes = new Map<number, ReturnType<typeof emptyCardConfig>>();
    page.cards.forEach((value, index) => {
        const slot = index + 1;
        if (value.type !== "companion" || !/^shortcut\.command\+control\+option\+shift\+([1-8])$/.test(value.entity) ||
            value.label !== "Scene " + value.entity.at(-1)) return;
        const cell = grid.indexOf(slot);
        if (cell >= 0) grid[cell] = 0;
        delete sizes[String(slot)];
        changes.set(slot, emptyCardConfig());
    });
    const cell = grid.indexOf(0);
    if (cell < 0) throw new Error("Free one tile in the Apple Home folder, then try again.");
    const emptySlot = page.cards.findIndex((value, index) => isEmptyCardConfig(value) || changes.has(index + 1));
    const slot = emptySlot < 0 ? page.cards.length + 1 : emptySlot + 1;
    changes.set(slot, card);
    grid[cell] = slot;
    const pageOrder = serializeSubpageGrid(grid, sizes, order.backLabel, order.backColor, order.title).join(",");
    draft.patchPageCards(owner.slot, changes, pageOrder);
    return draft.finish();
}
