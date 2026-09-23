import type { AppTitleFeature } from "./app_title";
import type { CoreFeature } from "./core";
import type { ScreenRotationFeature } from "./screen_rotation_state";
import type { ClockBarFeature } from "./clock_bar_state";
import type { ControlsShellFeature } from "./controls_shell";
import type { AppEventsFeature } from "./app_events";
import type { AppStatusPreviewFeature } from "./app_status_preview";
import type { ButtonSettingsSelectionFeature } from "./button_settings_selection";
import type { PreviewContextMenuFeature } from "./preview_context_menu";
import type { PreviewInteractionsFeature } from "./preview_interactions";
import type { PreviewRenderFeature } from "./preview_render";
import type { ButtonSettingsFeature } from "./button_settings";
import type { ConnectorsPageFeature } from "./connectors_page";

declare const __ESPDESKTOP_EMBEDDED_MDI_STYLES__: string;

export interface AppFeature {
    init(): void;
}

export function createAppFeature(pageTitle: AppTitleFeature, webStyles: string, core: Pick<CoreFeature, "syncPreviewOrientation">, screenRotation: ScreenRotationFeature, clockBar: ClockBarFeature, shell: Pick<ControlsShellFeature, "buildUI" | "syncTabChrome">, appEvents: Pick<AppEventsFeature, "connect">, statusPreview: Pick<AppStatusPreviewFeature, "updateClock">, selection: Pick<ButtonSettingsSelectionFeature, "handleDocumentSelectionMouseDown">, contextMenu: Pick<PreviewContextMenuFeature, "hide">, interactions: Pick<PreviewInteractionsFeature, "setup">, preview: Pick<PreviewRenderFeature, "render">, buttonSettings: Pick<ButtonSettingsFeature, "render">, connectorsPage: Pick<ConnectorsPageFeature, "start">): AppFeature {
    const { buildUI, syncTabChrome } = shell;
    const { syncPreviewOrientation } = core;
    const { startInitialCheck: startInitialScreenRotationCheck } = screenRotation;
    const { syncUi: syncClockBarUi } = clockBar;
    const { render: renderPreview } = preview;
    const { render: renderButtonSettings } = buttonSettings;
    // ── Init ───────────────────────────────────────────────────────────────
    const FAVICON_PNG = "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";
    function setFavicon(this: any) {
        var link: any = document.querySelector('link[rel="icon"]') || document.createElement("link");
        link.rel = "icon";
        link.type = "image/png";
        link.href = "data:image/png;base64," + FAVICON_PNG;
        if (!link.parentNode)
            document.head.appendChild(link);
    }
    function setViewportMeta(this: any) {
        var meta: any = document.querySelector('meta[name="viewport"]') || document.createElement("meta");
        meta.name = "viewport";
        meta.content = "width=device-width,initial-scale=1";
        if (!meta.parentNode)
            document.head.appendChild(meta);
    }
    function addSupportButton(this: any) {
        if (document.querySelector(".sp-support-btn"))
            return;
        var panel: any = document.createElement("div");
        panel.className = "sp-support-btn";
        var link: any = document.createElement("a");
        link.className = "sp-support-link";
        link.href = "https://www.buymeacoffee.com/jtenniswood";
        link.target = "_blank";
        link.rel = "noopener";
        link.textContent = "Buy me a coffee";
        panel.appendChild(link);
        document.body.appendChild(panel);
        syncTabChrome();
    }
    function installLocalWebAssets(this: any) {
        if (document.getElementById("espdesktop-local-web-assets"))
            return;
        var style: any = document.createElement("style");
        style.id = "espdesktop-local-web-assets";
        style.textContent = __ESPDESKTOP_EMBEDDED_MDI_STYLES__;
        document.head.appendChild(style);
    }
    function init(this: any) {
        setViewportMeta();
        setFavicon();
        pageTitle.applyPageTitle();
        pageTitle.loadPageTitleFromEventStream();
        // Set CSS custom properties from the active device orientation.
        syncPreviewOrientation();
        startInitialScreenRotationCheck();
        var style: any = document.createElement("style");
        style.textContent = webStyles;
        document.head.appendChild(style);
        installLocalWebAssets();
        buildUI();
        connectorsPage.start();
        addSupportButton();
        syncClockBarUi();
        interactions.setup();
        renderPreview();
        renderButtonSettings();
        appEvents.connect();
        statusPreview.updateClock();
        document.addEventListener("click", contextMenu.hide);
        document.addEventListener("mousedown", selection.handleDocumentSelectionMouseDown);
        document.addEventListener("scroll", contextMenu.hide, true);
        document.addEventListener("keydown", function (this: any, e?: any) {
            if (e.key === "Escape")
                contextMenu.hide();
        });
    }
    return {
        init,
    };
}
