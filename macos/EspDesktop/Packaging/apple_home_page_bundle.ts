import { decodePanelPageSnapshot } from "../../../src/webserver/model/panel_config_conversion";
import { APPLE_HOME_CONTROL_PREFIX } from "../../../src/webserver/model/companion_card_codec";

// JavaScriptCore does not include the browser's text encoding globals. The
// companion supplies the two UTF-8 operations for the shared layout codec.
declare function appleHomeEncodeUTF8(value: string): number[];
declare function appleHomeDecodeUTF8(bytes: number[]): string | null;

if (typeof TextEncoder === "undefined") {
    Object.assign(globalThis, {
        TextEncoder: class {
            encode(value: string): Uint8Array { return Uint8Array.from(appleHomeEncodeUTF8(value)); }
        },
        TextDecoder: class {
            decode(value: Uint8Array): string {
                const output = appleHomeDecodeUTF8(Array.from(value));
                if (output === null) throw new TypeError("Invalid UTF-8");
                return output;
            }
        },
    });
}

Object.assign(globalThis, {
    appleHomeSavedCards(source: number[]): { action: string; label: string }[] {
        const { layout } = decodePanelPageSnapshot(Uint8Array.from(source));
        return [...layout.rootCards, ...layout.pages.flatMap(page => page.cards)]
            .filter(({ config }) => config.type === "companion" && !config.sensor &&
                config.entity.startsWith(APPLE_HOME_CONTROL_PREFIX) && config.label.trim())
            .map(({ config }) => ({ action: config.entity, label: config.label }));
    },
});
