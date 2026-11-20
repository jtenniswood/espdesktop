import { buildAppleHomePage } from "../../src/webserver/model/apple_home_page";
import { companionCardHasAppIcon, companionSavedCardMode } from "../../src/webserver/model/companion_card_codec";
import { emptyCardConfig } from "../../src/webserver/model/card";
import { NativeLayoutDraft } from "../../src/webserver/model/native_layout_draft";
import { decodePanelPageSnapshot, encodePanelPageDocument } from "../../src/webserver/model/panel_config_conversion";

function check(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}

function rejects(action: () => unknown, expected: RegExp): void {
    try { action(); }
    catch (error) {
        check(error instanceof Error && expected.test(error.message), "Unexpected error: " + error);
        return;
    }
    throw new Error("Expected an error");
}

export function runAppleHomePageTests(): void {
    const empty = (deviceProfile = "guition-esp32-s3-4848s040") => encodePanelPageDocument({
        deviceProfile, buttons: {}, subpages: {}, settings: {},
    });
    const shortcut = (entity: string, label: string) => ({ ...emptyCardConfig(), type: "companion", entity, label });
    const scene = "applehome.control.00000000-0000-4000-8000-000000000001";
    const other = "applehome.control.00000000-0000-4000-8000-000000000002";
    const original = new NativeLayoutDraft(empty());
    original.writeRootCard(3, shortcut("shortcut.command+1", "Existing card"));
    original.writeSetting("button_order", ",,3");
    const configured = buildAppleHomePage(original.finish(), scene, "Desk Light");
    check(configured, "Creates an Apple Home page");
    const { document, layout } = decodePanelPageSnapshot(configured);
    check(document.settings.button_order === "1,,3", "Preserves root positions");
    check(JSON.stringify(layout.rootCards.map(({ slot, config }) => [slot, config.label])) ===
        JSON.stringify([[1, "Apple Home"], [3, "Existing card"]]), "Preserves existing cards");
    check(layout.pages[0]?.order === "B,1", "Leaves space for Back and adds a single selected scene");
    const card = layout.pages[0]?.cards[0]?.config;
    check(card?.entity === scene && companionSavedCardMode(card) === "apple_home" && !companionCardHasAppIcon(card),
        "Uses a dedicated Apple Home card and command");
    check(buildAppleHomePage(configured, scene, "Desk Light") === null, "Repeated saves are idempotent");
    const renamed = buildAppleHomePage(configured, scene, "Evening Light");
    check(renamed && decodePanelPageSnapshot(renamed).layout.pages[0]?.cards[0]?.config.label === "Evening Light",
        "Changes the selected card label without duplicating the tile");

    const cleared = new NativeLayoutDraft(empty());
    for (let slot = 1; slot <= 9; ++slot) cleared.writeRootCard(slot, emptyCardConfig());
    cleared.writeSetting("button_order", "9,8,7,6,5,4,3,2,1");
    const clearedPage = buildAppleHomePage(cleared.finish(), scene, "Desk Light");
    check(clearedPage && decodePanelPageSnapshot(clearedPage).document.settings.button_order === "1",
        "Cleared cards stored as empty records do not occupy space");

    rejects(() => buildAppleHomePage(empty("unsupported"), scene, "Desk Light"), /unsupported/);
    rejects(() => buildAppleHomePage(empty(), "shortcut.command+1", "Desk Light"), /Choose a control/);
    const occupied = new NativeLayoutDraft(empty());
    for (let slot = 1; slot <= 9; ++slot) {
        occupied.writeRootCard(slot, shortcut("shortcut.command+" + slot, "Existing card"));
    }
    rejects(() => buildAppleHomePage(occupied.finish(), scene, "Desk Light"), /Free one tile/);

    const legacy = new NativeLayoutDraft(configured);
    legacy.writePage(1, { order: "B,2,1", cards: [
        shortcut("shortcut.command+control+option+shift+1", "Scene 1"),
        shortcut("shortcut.command+a", "Keep this card"),
    ] });
    const migrated = buildAppleHomePage(legacy.finish(), other, "Kitchen Lamp");
    const migratedPage = migrated && decodePanelPageSnapshot(migrated).layout.pages[0];
    check(migratedPage?.order === "B,2,1", "Reuses a numbered position and preserves other cards");
    check(JSON.stringify(migratedPage.cards.map(c => c.config.label)) === '["Kitchen Lamp","Keep this card"]',
        "Replaces only prototype scene cards");
}
