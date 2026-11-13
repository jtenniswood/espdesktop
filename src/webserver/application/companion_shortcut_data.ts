import {
    EXPANDED_SHORTCUTS,
    EXPANDED_SHORTCUT_ICONS,
    EXPANDED_SHORTCUT_KEYS,
    type AppShortcutDefinition,
} from "../generated/app_shortcuts";

export const SCOPED_SHORTCUT_PREFIX = "shortcut.scoped.";
const alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_";
const modifiers = ["command", "control", "option", "shift", "function"];
const cache = new Map<string, readonly AppShortcutDefinition[]>();

/** Decode only the app being edited. See scripts/app_shortcuts_codegen.py for the packed layout. */
export function bundledExpandedShortcuts(appId: string): readonly AppShortcutDefinition[] {
    const cached = cache.get(appId);
    if (cached) return cached;
    const packed = Object.hasOwn(EXPANDED_SHORTCUTS, appId) ? EXPANDED_SHORTCUTS[appId] : undefined;
    if (!packed) return [];
    const pair = (row: string, offset: number) =>
        alphabet.indexOf(row.charAt(offset)) * 64 + alphabet.indexOf(row.charAt(offset + 1));
    const decoded = packed.split("\n").map(row => {
        const header = alphabet.indexOf(row.charAt(4));
        const scoped = header > 3;
        const count = scoped ? header - 3 : header;
        const strokes = Array.from({ length: count }, (_, index) => {
            const offset = 5 + index * 3;
            const flags = alphabet.indexOf(row.charAt(offset));
            return [...modifiers.filter((_, i) => (flags & (1 << i)) !== 0),
                EXPANDED_SHORTCUT_KEYS[pair(row, offset + 1)]].join("+");
        });
        return {
            id: String(pair(row, 0)),
            icon: EXPANDED_SHORTCUT_ICONS[pair(row, 2)] ?? "Shortcut Command",
            label: row.slice(5 + count * 3),
            shortcut: (scoped ? "scoped." : "") + strokes.join("~"),
        };
    });
    cache.set(appId, decoded);
    return decoded;
}
