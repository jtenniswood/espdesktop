import { buildAppleHomePage } from "../../src/webserver/model/apple_home_page";
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
    const original = new NativeLayoutDraft(empty());
    original.writeRootCard(3, shortcut("shortcut.command+1", "Existing card"));
    original.writeSetting("button_order", ",,3");
    const configured = buildAppleHomePage(original.finish());
    check(configured, "Creates an Apple Home page");
    const { document, layout } = decodePanelPageSnapshot(configured);
    check(document.settings.button_order === "1,,3", "Preserves root positions");
    check(JSON.stringify(layout.rootCards.map(({ slot, config }) => [slot, config.label])) ===
        JSON.stringify([[1, "Apple Home"], [3, "Existing card"]]), "Preserves existing cards");
    check(layout.pages[0]?.order === "B,1,2,3,4,5,6,7,8", "Leaves space for Back");
    check(layout.pages[0]?.cards[7]?.config.entity === "shortcut.command+control+option+shift+8",
        "Uses the existing shortcut action contract");
    check(buildAppleHomePage(configured) === null, "Repeated setup is idempotent");

    const cleared = new NativeLayoutDraft(empty());
    for (let slot = 1; slot <= 9; ++slot) cleared.writeRootCard(slot, emptyCardConfig());
    cleared.writeSetting("button_order", "9,8,7,6,5,4,3,2,1");
    const clearedPage = buildAppleHomePage(cleared.finish());
    check(clearedPage && decodePanelPageSnapshot(clearedPage).document.settings.button_order === "1",
        "Cleared cards stored as empty records do not occupy space");

    const smaller = buildAppleHomePage(empty("guition-esp32-p4-jc4880p443"));
    check(smaller && decodePanelPageSnapshot(smaller).layout.pages[0]?.cards.length === 5,
        "Respects smaller display capacity");
    rejects(() => buildAppleHomePage(empty("unsupported")), /unsupported/);

    const occupied = new NativeLayoutDraft(empty());
    for (let slot = 1; slot <= 9; ++slot) {
        occupied.writeRootCard(slot, shortcut("shortcut.command+" + slot, "Existing card"));
    }
    rejects(() => buildAppleHomePage(occupied.finish()), /Free one tile/);

    const conflict = new NativeLayoutDraft(configured);
    conflict.writeRootCard(4, shortcut("shortcut.command+control+option+shift+2", "Existing shortcut"));
    rejects(() => buildAppleHomePage(conflict.finish()), /reserved/);
}
