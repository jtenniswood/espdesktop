import type { AppFeature } from "./app";

const startupState = globalThis as typeof globalThis & {
    __ESPDESKTOP_RELOAD_EMBEDDED__?: () => void;
    __ESPDESKTOP_UI_STARTED__?: boolean;
    __ESPDESKTOP_UI_STARTING__?: boolean;
};

export function startApp(app: Pick<AppFeature, "init">): void {
    // ── Start ──────────────────────────────────────────────────────────────
    function start(this: any) {
        startupState.__ESPDESKTOP_UI_STARTING__ = true;
        try {
            app.init();
            startupState.__ESPDESKTOP_UI_STARTED__ = true;
        }
        catch (error) {
            startupState.__ESPDESKTOP_UI_STARTED__ = false;
            const reload = startupState.__ESPDESKTOP_RELOAD_EMBEDDED__;
            if (typeof reload === "function") {
                reload();
                return;
            }
            throw error;
        }
        finally {
            startupState.__ESPDESKTOP_UI_STARTING__ = false;
        }
    }
    if (document.readyState === "loading") {
        startupState.__ESPDESKTOP_UI_STARTING__ = true;
        document.addEventListener("DOMContentLoaded", start);
    }
    else {
        start();
    }
}
