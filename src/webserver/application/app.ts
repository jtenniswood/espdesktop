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

export function createAppFeature(pageTitle: AppTitleFeature, webStyles: string, core: Pick<CoreFeature, "syncPreviewOrientation">, screenRotation: ScreenRotationFeature, clockBar: ClockBarFeature, shell: Pick<ControlsShellFeature, "buildUI" | "syncTabChrome">, appEvents: Pick<AppEventsFeature, "connect">, statusPreview: Pick<AppStatusPreviewFeature, "updateClock">, selection: Pick<ButtonSettingsSelectionFeature, "handleDocumentSelectionMouseDown">, contextMenu: Pick<PreviewContextMenuFeature, "hide">, interactions: Pick<PreviewInteractionsFeature, "setup">, preview: Pick<PreviewRenderFeature, "render">, buttonSettings: Pick<ButtonSettingsFeature, "render">, connectorsPage: Pick<ConnectorsPageFeature, "start">, firstRunSetup?: { start(): void }): AppFeature {
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
        firstRunSetup?.start();
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
