import manifest from "../../../devices/manifest.json";
import { emptyCardConfig } from "./card";
import { configOptionValue, setConfigOptionValue } from "./config_primitives";
import { parseGridOrder, serializeGridOrder } from "./grid";
import { NativeLayoutDraft } from "./native_layout_draft";
import { decodePanelPageSnapshot } from "./panel_config_conversion";

const marker = "espdesktop_apple_home";
const actionPrefix = "shortcut.command+control+option+shift+";
const slotLimit = 8;

export function buildAppleHomePage(input: Uint8Array): Uint8Array | null {
    const { document, layout } = decodePanelPageSnapshot(input);
    const profile = (manifest.devices as Record<string, { slots: number; layout: { cols: number } }>)[document.deviceProfile];
    if (!profile) throw new Error("This display profile is unsupported.");
    const owners = layout.rootCards.filter(({ config }) =>
        config.type === "subpage" && configOptionValue(config.options, marker) === "1");
    const usedActions = new Set(Array.from({ length: slotLimit }, (_, index) => actionPrefix + (index + 1)));
    if (owners.length === 1) {
        const ownerPage = layout.pages.find(page => page.key === owners[0]!.slot);
        if (!ownerPage?.cards.some(({ config }) => usedActions.has(config.entity)))
            throw new Error("The existing Apple Home page has no scene tiles.");
    }
    const existingPage = owners.length === 1 ? owners[0]!.slot : 0;
    if (owners.length > 1 || [...layout.rootCards, ...layout.pages.filter(page => page.key !== existingPage)
        .flatMap(page => page.cards)].some(({ config }) => usedActions.has(config.entity))) {
        throw new Error("This layout already uses keys reserved for Apple Home scene tiles.");
    }
    if (existingPage) return null;

    const occupied = new Set(layout.rootCards.map(card => card.slot));
    const newSlot = Array.from({ length: profile.slots }, (_, index) => index + 1)
        .find(slot => !occupied.has(slot));
    const { grid, sizes } = parseGridOrder(document.settings.button_order ||
        layout.rootCards.map(card => card.slot).join(","), profile.slots, profile.layout.cols);
    const cell = grid.indexOf(0);
    if (newSlot === undefined || cell < 0) throw new Error("Free one tile on the display home page, then try again.");

    const draft = new NativeLayoutDraft(input);
    const owner = { ...emptyCardConfig(), type: "subpage", label: "Apple Home", icon: "Home",
        options: setConfigOptionValue("", marker, "1") };
    draft.writeRootCard(newSlot, owner);
    const cards = Array.from({ length: Math.min(slotLimit, profile.slots - 1) }, (_, index) => ({
        ...emptyCardConfig(), type: "companion", entity: actionPrefix + (index + 1),
        label: "Scene " + (index + 1), icon: "Home",
    }));
    draft.writePage(newSlot, { order: ["B", ...cards.map((_, index) => index + 1)].join(","), cards });
    grid[cell] = newSlot;
    draft.writeSetting("button_order", serializeGridOrder(grid, sizes));
    return draft.finish();
}
