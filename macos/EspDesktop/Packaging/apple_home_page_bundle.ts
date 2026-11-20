import { buildAppleHomePage } from "../../../src/webserver/model/apple_home_page";

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
    buildAppleHomePage(source: number[]): number[] | null {
        const layout = buildAppleHomePage(Uint8Array.from(source));
        return layout === null ? null : Array.from(layout);
    },
});
