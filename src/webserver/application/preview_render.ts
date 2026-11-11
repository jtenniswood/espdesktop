import { removeRetiredCards } from "../features/retired_cards";
import { cardContractTypeRetired } from "../generated/card_contract";
import { cardRequiresHomeAssistant } from "../model/legacy_home_assistant";
import { state } from "../state/app_instance";
import { cardContractCard } from "../generated/card_contract";
import { WEB_UI_COLORS } from "../state/ui_tokens";
import { COMPANION_APP_ICON_SIDE } from "../generated/companion_capabilities";
import { appIconArtworkBounds, appIconFitSide } from "../model/app_icon_layout";
import { PREVIEW_THEME_COLORS, defaultCardBackgroundColor, previewEffectiveTheme } from "../state/preview_theme";
import { cardIconSize, configOptionValue, cardActiveColor } from "../model/config_primitives";
import { PANEL_CONFIG_MAX_SLOT_COUNT } from "../model/panel_config";
import { escHtml, iconSlug } from "./ui_primitives";
import { companionCardDefaultIcon } from "../model/companion_card";
import { appShortcutPageBackIcon, appShortcutPageOwner, previewSubpageOwner } from "../model/companion_shortcut_page";
import { companionShortcutActionIdValid } from "./companion_shortcut_folder";
import { finderFolderPreview } from "../model/finder_folder_preview";
import type { CompanionAction } from "../api/companion_catalogue";
import { createWeatherDailyPreviewLayout } from "./weather_daily_preview";
import {
    buttonConfigDisabledForDevice as isButtonConfigDisabledForDevice,
    cardPreviewTextColor,
    cardProgressColor,
    cardSliderFillColor,
    applySliderPreviewTextContrast,
    cardPatternHighlightColor,
    cardTypePickerDetails,
    cardTypePickerOptions,
    defaultCardTypeForPicker,
    infoOnlyCardVisible,
    previewValue,
    registryValue,
} from "../features/preview";
import type { CardPickerConnector } from "../features/preview";
import type { ApplicationLayoutState } from "./application_context";
import type { CardRegistry } from "./card_registry";
import type { ConfigConfirmationOptionsFeature } from "./config_confirmation_options";
import type { ConfigCodecFeature } from "./config_codec";
import type { UiRuntimeState } from "./state";
import type { ScreenRotationFeature } from "./screen_rotation_state";
import type { ControlsShellFeature } from "./controls_shell";
import type { GridFeature } from "./grid";
import type { ButtonSettingsSelectionFeature } from "./button_settings_selection";

export interface PreviewRenderDependencies {
    readonly displayDemo?: boolean;
    readonly updateClockBarItemUi: () => void;
    readonly document: Document;
    readonly layout: ApplicationLayoutState;
    readonly cards: CardRegistry;
    readonly confirmationOptions: ConfigConfirmationOptionsFeature;
    readonly codec: ConfigCodecFeature;
    readonly runtime: UiRuntimeState;
    readonly screenRotation: ScreenRotationFeature;
    readonly shell: Pick<ControlsShellFeature, "isPreviewReadOnly">;
    readonly grid: Pick<GridFeature, "ctx" | "resolveIcon" | "sizeClass">;
    readonly selection: Pick<ButtonSettingsSelectionFeature, "renderSelectionBar" | "updatePreviewHint">;
    readonly homeAssistantSupported: () => boolean;
    readonly liveFinderFolders: () => readonly CompanionAction[];
    readonly shortcutPageReady: (owner: string) => boolean | undefined;
}
export interface PreviewRenderFeature {
    render(): void;
    updateShortcutAvailability(): void;
    registryValue(typeDefinition?: any, key?: any, fallback?: any): any;
    configDisabled(button?: any): boolean;
    defaultTypeForPicker(key?: any): any;
    pickerOptions(isSubpage?: any, selectedTypeKey?: any, connector?: CardPickerConnector): any[];
    pickerKeys(isSubpage?: any, selectedTypeKey?: any, connector?: CardPickerConnector): any[];
    typeVisibleInPicker(key?: any, isSubpage?: any): boolean;
}

interface CompanionAppIconPreview {
    dataUrl: string;
    defaultColor: string;
    activeColor: string;
    online: boolean;
    insetLeftPercent: number;
    insetTopPercent: number;
    artworkWidthFraction: number;
    artworkHeightFraction: number;
}

const APP_ICON_STORAGE_KEY = "espdesktop:app-icon-previews:v1";
const APP_ICON_CACHE_LIMIT = 64;
interface CachedAppIcon {
    expiresAt: number;
    value: CompanionAppIconPreview | null;
}
const companionAppIconCache = new Map<string, CachedAppIcon>();
const companionAppIconRequests = new Map<string, Promise<CompanionAppIconPreview | null>>();
let appIconContexts: Record<string, string> = {};
let appIconCacheLoaded = false;
let appIconCacheGeneration = 0;

function loadAppIconCache(): void {
    if (appIconCacheLoaded) return;
    appIconCacheLoaded = true;
    try {
        const stored = JSON.parse(localStorage.getItem(APP_ICON_STORAGE_KEY) || "{}");
        if (!stored || !Array.isArray(stored.entries)) return;
        appIconContexts = stored.contexts || {};
        for (const [key, entry] of stored.entries.slice(-APP_ICON_CACHE_LIMIT)) {
            if (typeof key === "string" && entry?.expiresAt > Date.now() &&
                entry.value?.dataUrl?.startsWith("data:image/png;base64,"))
                companionAppIconCache.set(key, entry);
        }
    } catch { /* Storage can be unavailable or contain an older/corrupt entry. */ }
}

function saveAppIconCache(): void {
    try {
        localStorage.setItem(APP_ICON_STORAGE_KEY, JSON.stringify({
            contexts: appIconContexts,
            entries: Array.from(companionAppIconCache).filter(([, entry]) =>
                entry.value && entry.expiresAt > Date.now()),
        }));
    } catch { /* Memory caching still works when browser storage is full/disabled. */ }
}

// Catalogue and connection snapshots let a page reload reuse unchanged artwork.
// A manual clear has no context and always removes browser copies too.
export function clearCompanionAppIconPreviewCache(context?: { name: string; value: string }): boolean {
    loadAppIconCache();
    if (context && appIconContexts[context.name] === context.value) return false;
    if (context?.name === "catalogue") {
        try {
            const previous = new Map<string, string>(JSON.parse(appIconContexts.catalogue || "[]"));
            const incoming = new Map<string, string>(JSON.parse(context.value));
            const changed = new Set<string>();
            for (const [id, hash] of incoming) {
                // Missing hashes mean an icon fell out of the panel's small flash
                // cache, not that its artwork changed. Keep the browser's copy.
                if (hash && hash !== previous.get(id)) changed.add(id);
                if (!hash) incoming.set(id, previous.get(id) || "");
            }
            for (const id of previous.keys()) if (!incoming.has(id)) changed.add(id);
            appIconContexts.catalogue = JSON.stringify(Array.from(incoming).sort());
            if (changed.size > 0) {
                appIconCacheGeneration++;
                companionAppIconRequests.clear();
                for (const key of companionAppIconCache.keys()) {
                    const [id] = JSON.parse(key) as [string, string];
                    if (changed.has(id)) companionAppIconCache.delete(key);
                }
            }
            saveAppIconCache();
            return changed.size > 0;
        } catch { /* A malformed older snapshot falls back to a full clear. */ }
    }
    appIconContexts = context ? { ...appIconContexts, [context.name]: context.value } : {};
    appIconCacheGeneration++;
    companionAppIconCache.clear();
    companionAppIconRequests.clear();
    saveAppIconCache();
    return true;
}

function cachedAppIcon(cacheKey: string): CachedAppIcon | undefined {
    loadAppIconCache();
    const cached = companionAppIconCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached;
    companionAppIconCache.delete(cacheKey);
    return undefined;
}

export function companionAppIconPreviewData(applicationId: string, backgroundColor: string, document: Document): Promise<CompanionAppIconPreview | null> {
    const cacheKey = JSON.stringify([applicationId, backgroundColor]);
    const cached = cachedAppIcon(cacheKey);
    if (cached) return Promise.resolve(cached.value);
    const pending = companionAppIconRequests.get(cacheKey);
    if (pending) return pending;
    const generation = appIconCacheGeneration;
    if (typeof fetch !== "function") return Promise.resolve(null);
    const query = "appId=" + encodeURIComponent(applicationId) +
        (backgroundColor ? "&background=" + encodeURIComponent(backgroundColor) : "");
    const result = fetch("/companion/app-icon?" + query, {
        credentials: "same-origin",
        cache: "no-store",
    }).then(async function (response) {
        if (!response.ok) return null;
        const bytes = new Uint8Array(await response.arrayBuffer());
        const pixelCount = COMPANION_APP_ICON_SIDE * COMPANION_APP_ICON_SIDE;
        if (bytes.length !== pixelCount * 3) return null;
        const canvas = document.createElement("canvas");
        canvas.width = COMPANION_APP_ICON_SIDE;
        canvas.height = COMPANION_APP_ICON_SIDE;
        const context = canvas.getContext("2d");
        if (!context) return null;
        const image = context.createImageData(COMPANION_APP_ICON_SIDE, COMPANION_APP_ICON_SIDE);
        const online = response.headers.get("X-EspDesktop-Companion-Online") === "true";
        for (let index = 0; index < pixelCount; index++) {
            const packed = (bytes[index * 2] ?? 0) | ((bytes[index * 2 + 1] ?? 0) << 8);
            const red = (packed >> 11) & 0x1f;
            const green = (packed >> 5) & 0x3f;
            const blue = packed & 0x1f;
            const output = index * 4;
            const sourceRed = (red << 3) | (red >> 2);
            const sourceGreen = (green << 2) | (green >> 4);
            const sourceBlue = (blue << 3) | (blue >> 2);
            if (online) {
                image.data[output] = sourceRed;
                image.data[output + 1] = sourceGreen;
                image.data[output + 2] = sourceBlue;
            } else {
                const gray = (sourceRed * 54 + sourceGreen * 183 + sourceBlue * 19) >> 8;
                image.data[output] = gray;
                image.data[output + 1] = gray;
                image.data[output + 2] = gray;
            }
            image.data[output + 3] = bytes[pixelCount * 2 + index] ?? 0;
        }
        context.putImageData(image, 0, 0);
        const insets = appIconArtworkBounds(bytes.subarray(pixelCount * 2), COMPANION_APP_ICON_SIDE);
        const palette = (response.headers.get("X-EspDesktop-App-Icon-Palette") || "").split(",");
        const legacyDefaultColor = response.headers.get("X-EspDesktop-App-Icon-Default") || "";
        const legacyActiveColor = response.headers.get("X-EspDesktop-App-Icon-Active") || "";
        const defaultColor = palette[0] || legacyDefaultColor;
        const activeColor = palette[1] || legacyActiveColor;
        const validDefaultColor = backgroundColor && /^[0-9a-f]{6}$/i.test(defaultColor)
            ? defaultColor : "";
        const validActiveColor = backgroundColor && /^[0-9a-f]{6}$/i.test(activeColor)
            ? activeColor : validDefaultColor;
        return {
            dataUrl: canvas.toDataURL("image/png"),
            defaultColor: validDefaultColor,
            activeColor: validActiveColor,
            online,
            insetLeftPercent: insets.left * 100 / COMPANION_APP_ICON_SIDE,
            insetTopPercent: insets.top * 100 / COMPANION_APP_ICON_SIDE,
            artworkWidthFraction: (COMPANION_APP_ICON_SIDE - insets.left - insets.right) / COMPANION_APP_ICON_SIDE,
            artworkHeightFraction: (COMPANION_APP_ICON_SIDE - insets.top - insets.bottom) / COMPANION_APP_ICON_SIDE,
        };
    }).catch(function () { return null; }).then(function (value) {
        if (generation === appIconCacheGeneration) {
            companionAppIconRequests.delete(cacheKey);
            companionAppIconCache.delete(cacheKey);
            companionAppIconCache.set(cacheKey, {
                expiresAt: Date.now() + (value ? (value.online ? 24 * 60 * 60 * 1000 : 30000) : 5000),
                value,
            });
            while (companionAppIconCache.size > APP_ICON_CACHE_LIMIT)
                companionAppIconCache.delete(companionAppIconCache.keys().next().value!);
            saveAppIconCache();
        }
        return value;
    });
    companionAppIconRequests.set(cacheKey, result);
    return result;
}

export function createPreviewRenderFeature(dependencies: PreviewRenderDependencies): PreviewRenderFeature {
    const document = dependencies.document;
    const els = dependencies.runtime.els;
    const { cardOnPattern } = dependencies.confirmationOptions;
    const { getSubpage, serializeSubpageGrid } = dependencies.codec;
    const { gridPreviewBlocked: gridPreviewBlockedByRotationStartup } = dependencies.screenRotation;
    // Loading and saving block interactions, but the preview can render before those locks clear.
    const isPreviewReadOnly = () => dependencies.displayDemo || dependencies.shell.isPreviewReadOnly();
    const { ctx, resolveIcon, sizeClass } = dependencies.grid;
    const { renderSelectionBar, updatePreviewHint } = dependencies.selection;
    const appIconArtwork = new WeakMap<HTMLImageElement, CompanionAppIconPreview>();
    // Use a single measured side for square images at every card aspect ratio.
    function resizeCardIcon(button: Element): void {
        const fallback = button.querySelector<HTMLElement>(".sp-app-back-icon");
        if (fallback && !fallback.hidden && document.defaultView) {
            const style = document.defaultView.getComputedStyle(button);
            const width = button.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
            const height = button.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
            const scale = Math.max(0.01, Math.min(width / Math.max(1, fallback.offsetWidth), height / Math.max(1, fallback.offsetHeight)));
            fallback.style.transformOrigin = "top left";
            fallback.style.transform = "scale(" + scale + ")";
            return;
        }
        const icon = button.querySelector<HTMLImageElement>(".sp-companion-app-icon");
        const view = document.defaultView;
        if (!icon || !view) return;
        const artwork = appIconArtwork.get(icon);
        if (!artwork) return;
        const style = view.getComputedStyle(button);
        const smallSide = parseFloat(view.getComputedStyle(icon).fontSize);
        const label = button.querySelector<HTMLElement>(".sp-btn-label");
        const labelHeight = label ? label.getBoundingClientRect().height : 0;
        const width = button.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        const height = button.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
        const fitted = appIconFitSide(width, height, labelHeight, Math.max(3, smallSide / 4),
            artwork.artworkWidthFraction, artwork.artworkHeightFraction);
        const size = button.getAttribute("data-icon-size");
        const requested = size === "large" ? fitted : smallSide * (size === "medium" ? 1.5 : 1)
            / artwork.artworkWidthFraction;
        const side = Math.min(fitted, requested);
        icon.style.width = side + "px";
        icon.style.height = side + "px";
        icon.style.left = (parseFloat(style.paddingLeft) - side * artwork.insetLeftPercent / 100) + "px";
        icon.style.top = (parseFloat(style.paddingTop) - side * artwork.insetTopPercent / 100) + "px";
    }
    const appIconResizeObserver = typeof ResizeObserver === "function"
        ? new ResizeObserver(entries => entries.forEach(entry => resizeCardIcon(entry.target.closest(".sp-btn") || entry.target))) : null;
    function loadCardAppIcon(btn: HTMLElement, applicationId: string, backgroundColor: string,
                             fallbackIcon: HTMLElement | null, back = false): void {
        const applyIcon = (previewIcon: CompanionAppIconPreview): void => {
            if (!btn.isConnected) return;
            const appIcon = document.createElement("img");
            appIcon.className = "sp-btn-icon sp-companion-app-icon" + (back ? " sp-back-hit" : "");
            btn.classList.add("sp-companion-app-icon-fit-card");
            appIcon.alt = "";
            appIcon.setAttribute("aria-hidden", "true");
            appIcon.src = previewIcon.dataUrl;
            appIconArtwork.set(appIcon, previewIcon);
            btn.appendChild(appIcon);
            if (fallbackIcon) fallbackIcon.hidden = true;
            resizeCardIcon(btn);
            appIconResizeObserver?.observe(btn);
            const label = btn.querySelector(".sp-btn-label");
            if (label) appIconResizeObserver?.observe(label);
            if (!back && previewIcon.online && previewIcon.defaultColor && previewIcon.activeColor) {
                btn.style.backgroundColor = "#" + previewIcon.defaultColor;
                btn.style.setProperty("--card-text-color", cardPreviewTextColor(previewIcon.defaultColor));
                btn.style.setProperty("--sp-companion-app-icon-active-text", cardPreviewTextColor(previewIcon.activeColor));
                btn.style.setProperty("--sp-companion-app-icon-active", "#" + previewIcon.activeColor);
                btn.classList.add("sp-companion-app-icon-card");
            }
        };
        const loadAppIcon = function (attempt: number): void {
            if (!btn.isConnected) return;
            const cached = cachedAppIcon(JSON.stringify([applicationId, backgroundColor]));
            if (cached?.value) {
                applyIcon(cached.value);
                return;
            }
            void companionAppIconPreviewData(applicationId, backgroundColor, document).then(function (previewIcon) {
                if (!btn.isConnected) return;
                if (!previewIcon) {
                    if (attempt < 12) window.setTimeout(function () {
                        if (btn.isConnected) loadAppIcon(attempt + 1);
                    }, Math.min(5000 * 2 ** Math.min(attempt, 3), 30000));
                    return;
                }
                applyIcon(previewIcon);
            });
        };
        loadAppIcon(0);
    }
    const weatherLayout = createWeatherDailyPreviewLayout(document, dependencies.layout.config,
        () => state.screenRotation === "90" || state.screenRotation === "270");
    // ── Preview rendering (unified) ────────────────────────────────────────
    function previewHtmlValue(this: any, typePreview?: any, key?: any, fallback?: any) {
        return previewValue(typePreview, key, fallback);
    }
    function buttonTypeRegistryValue(this: any, typeDef?: any, key?: any, fallback?: any) {
        return registryValue(typeDef, key, fallback);
    }
    function buttonTypeDisabledForDevice(this: any, key?: any) {
        var disabled: any = dependencies.layout.config.disabledCardTypes || [];
        return disabled.indexOf(key || "") !== -1;
    }
    function buttonConfigDisabledForDevice(this: any, button?: any) {
        return isButtonConfigDisabledForDevice(
            dependencies.cards.definitions,
            dependencies.layout.config.disabledCardTypes || [],
            button,
        );
    }
    function buttonTypeInfoOnlyVisible(this: any, key?: any) {
        return infoOnlyCardVisible(key || "", !!dependencies.layout.config.infoOnly);
    }
    function defaultButtonTypeForPicker(this: any, key?: any) {
        return defaultCardTypeForPicker(key);
    }
    function buttonTypePickerDetails(this: any, key?: any, label?: any) {
        return cardTypePickerDetails(key || "", label || "");
    }
    function buttonTypePickerOptionList(this: any, isSub?: any, selectedTypeKey?: any, connector?: CardPickerConnector) {
        return cardTypePickerOptions(
            dependencies.cards.definitions,
            dependencies.layout.config.disabledCardTypes || [],
            !!dependencies.layout.config.infoOnly,
            !!isSub,
            selectedTypeKey,
            connector,
            dependencies.homeAssistantSupported(),
        );
    }
    function buttonTypePickerKeys(this: any, isSub?: any, selectedTypeKey?: any, connector?: CardPickerConnector) {
        return buttonTypePickerOptionList(!!isSub, selectedTypeKey, connector).map(function (this: any, opt?: any) {
            return opt.key;
        });
    }
    function buttonTypeVisibleInPicker(this: any, key?: any, isSub?: any) {
        return buttonTypePickerKeys(!!isSub, null).indexOf(key) >= 0;
    }
    function appendResizeHandle(card: HTMLElement) {
        if (isPreviewReadOnly()) return;
        const handle = document.createElement("button");
        handle.type = "button";
        handle.className = "sp-resize-handle";
        handle.setAttribute("aria-label", "Resize card");
        handle.title = "Drag to resize";
        handle.innerHTML = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M 27 8 Q 24 24 8 27"/></svg>';
        card.appendChild(handle);
    }
    function makeTitleEditable(card: HTMLElement, image = false) {
        if (isPreviewReadOnly()) return;
        const title = card.querySelector<HTMLElement>(image ? ".sp-image-label-stack" : ".sp-btn-label:not(.sp-media-now-artist)");
        if (!title) return;
        title.classList.add("sp-editable-title");
        title.tabIndex = 0;
        title.setAttribute("role", "button");
        title.setAttribute("aria-label", "Rename card");
        title.title = "Click to rename; Enter to save";
    }
    let renderedShortcutOwner: string | undefined;
    function updateShortcutAvailability() {
        const main = els.previewMain as HTMLElement | undefined;
        if (!main || !renderedShortcutOwner) return;
        const ready = dependencies.shortcutPageReady(renderedShortcutOwner);
        for (const card of main.querySelectorAll<HTMLElement>("[data-preview-shortcut]")) {
            const unavailable = ready === false || card.dataset.previewShortcut === "invalid";
            card.classList.toggle("sp-shortcut-unavailable", unavailable);
            card.title = unavailable ? "Shortcut unavailable on the touchscreen." : "";
        }
    }
    function renderPreview(this: any) {
        appIconResizeObserver?.disconnect();
        const previewColors = PREVIEW_THEME_COLORS[previewEffectiveTheme(state)];
        dependencies.updateClockBarItemUi();
        var main: any = els.previewMain;
        if (dependencies.displayDemo) {
            main.setAttribute("role", "group");
            main.setAttribute("aria-label", "Touchscreen cards");
            if (els.topbar) (els.topbar as HTMLElement).inert = true;
        }
        weatherLayout.disconnect();
        // Keep the active editor and its selection through device state refreshes.
        const editor = main.querySelector(".sp-card-name-input") as HTMLInputElement | null;
        const focused = editor && document.activeElement === editor;
        const selectionStart = editor?.selectionStart ?? null;
        const selectionEnd = editor?.selectionEnd ?? null;
        const editorSlot = editor?.closest("[data-slot]")?.getAttribute("data-slot");
        main.innerHTML = "";
        renderedShortcutOwner = undefined;
        main.className = "sp-main" + (state.subpageChevronsOn ? "" : " sp-hide-subpage-chevrons");
        if (gridPreviewBlockedByRotationStartup()) {
            main.className += " sp-grid-loading";
            main.setAttribute("aria-busy", "true");
            return;
        }
        main.removeAttribute("aria-busy");
        var c: any = ctx();
        const removed = removeRetiredCards(c.grid, c.sizes, c.buttons, dependencies.layout.gridCols);
        if (c.isSub && removed.length) {
            const subpage = getSubpage(state.editingSubpage);
            subpage.order = serializeSubpageGrid(subpage);
        }
        for (const slot of removed) {
            const index = c.selected.indexOf(slot);
            if (index !== -1) c.selected.splice(index, 1);
        }
        updatePreviewHint(c);
        const pageKey = state.editingSubpage;
        const subpage = pageKey ? getSubpage(pageKey) : null;
        const owner = previewSubpageOwner(pageKey, state.buttons, getSubpage);
        const shortcutOwner = appShortcutPageOwner(owner);
        renderedShortcutOwner = shortcutOwner;
        const liveFolders = subpage && shortcutOwner === "com.apple.finder"
            ? finderFolderPreview(subpage.order, c.grid, c.buttons, dependencies.layout.totalSlots,
                dependencies.liveFinderFolders())
            : undefined;
        for (var pos: any = 0; pos < c.maxSlots; pos++) {
            var slot: any = c.grid[pos];
            if (slot === -1)
                continue;
            if (slot === -2) {
                var backBtn: any = document.createElement(dependencies.displayDemo ? "button" : "div");
                if (dependencies.displayDemo) backBtn.type = "button";
                var bkSz: any = c.sizes[-2];
                var backLabel = subpage?.backLabel || "Back";
                if (dependencies.displayDemo) backBtn.setAttribute("aria-label", backLabel);
                var backColor = subpage?.backColor || previewColors.surfaceCard;
                backBtn.className = "sp-btn sp-back-btn" + sizeClass(bkSz) +
                    (c.selected.indexOf(-2) !== -1 ? " sp-selected" : "");
                backBtn.innerHTML =
                    '<span class="sp-btn-icon sp-back-hit mdi mdi-' + (shortcutOwner ? resolveIcon({ icon: appShortcutPageBackIcon(owner?.icon) }) + ' sp-app-back-icon' : 'chevron-left') + '"></span>' +
                        (shortcutOwner ? '<span class="sp-btn-label-row"><span class="sp-subpage-badge sp-back-badge mdi mdi-chevron-left" aria-hidden="true"></span></span>' : '') +
                        '<span class="sp-btn-label">' + escHtml(backLabel) + '</span>';
                backBtn.style.backgroundColor = "#" + backColor;
                backBtn.style.setProperty("--card-text-color", subpage?.backColor
                    ? cardPreviewTextColor(backColor) : "#" + previewColors.textPrimary);
                backBtn.style.cursor = "pointer";
                backBtn.setAttribute("data-pos", pos);
                backBtn.draggable = !isPreviewReadOnly();
                backBtn.setAttribute("data-slot", "-2");
                makeTitleEditable(backBtn);
                appendResizeHandle(backBtn);
                main.appendChild(backBtn);
                if (shortcutOwner) {
                    backBtn.setAttribute("data-icon-size", "large");
                    backBtn.setAttribute("aria-label", backLabel + " — Home");
                    resizeCardIcon(backBtn);
                    appIconResizeObserver?.observe(backBtn);
                    loadCardAppIcon(backBtn, shortcutOwner, subpage?.backColor || "",
                        backBtn.querySelector(".sp-app-back-icon"), true);
                }
            }
            else if (slot > 0) {
                if (slot > PANEL_CONFIG_MAX_SLOT_COUNT || slot > c.buttons.length ||
                    (!c.isSub && slot > dependencies.layout.numSlots)) {
                    var unavailable: any = document.createElement("div");
                    unavailable.className = "sp-empty-cell";
                    unavailable.setAttribute("data-pos", pos);
                    main.appendChild(unavailable);
                    continue;
                }
                var bIdx: any = slot - 1;
                if (c.isSub && bIdx >= c.buttons.length)
                    continue;
                var b: any = c.buttons[bIdx];
                if (state.settingsDraft &&
                    state.settingsDraft.slot === slot &&
                    state.settingsDraft.isSub === c.isSub &&
                    (!c.isSub || state.settingsDraft.homeSlot === state.editingSubpage)) {
                    b = state.settingsDraft.button;
                }
                if (cardContractTypeRetired(b.type) || !buttonTypeInfoOnlyVisible(b.type || "")) {
                    var hidden: any = document.createElement("div");
                    hidden.className = "sp-empty-cell sp-info-only-hidden";
                    hidden.setAttribute("data-pos", pos);
                    main.appendChild(hidden);
                    continue;
                }
                var iconName: any = resolveIcon(b);
                var label: any = b.label || b.entity || "Configure";
                var color: any = defaultCardBackgroundColor(b.type || "", state);
                var previewTypeDef: any = dependencies.cards.definitions[b.type || ""] || null;
                if (previewTypeDef && c.isSub && !buttonTypeRegistryValue(previewTypeDef, "allowInSubpage", false)) {
                    previewTypeDef = null;
                }
                var slotSz: any = c.sizes[slot];
                var cardOffColor: any = configOptionValue(b.options, "card_off_color").replace(/^#/, "").toUpperCase();
                if (!/^[0-9A-F]{6}$/.test(cardOffColor)) cardOffColor = "";
                var cardOnColor: any = cardActiveColor(b.options, state.onColor || WEB_UI_COLORS.primary);
                var typePreview: any = previewTypeDef && previewTypeDef.renderPreview
                    ? previewTypeDef.renderPreview(b, {
                        escHtml: escHtml, cardSize: slotSz || 1,
                        cardBackgroundColor: cardOffColor,
                        cardProgressColor: cardProgressColor(cardOffColor),
                        cardTextColor: cardOffColor ? cardPreviewTextColor(cardOffColor) : "#" + previewColors.textPrimary,
                    })
                    : null;
                const btn: any = document.createElement(dependencies.displayDemo ? "button" : "div");
                if (dependencies.displayDemo) btn.type = "button";
                btn.className = "sp-btn" +
                    (typePreview && typePreview.buttonClass ? " " + typePreview.buttonClass : "") +
                    sizeClass(slotSz) +
                    (c.selected.indexOf(slot) !== -1 ? " sp-selected" : "");
                btn.style.backgroundColor = "#" + (cardOffColor || color);
                btn.style.setProperty("--card-active-color", "#" + (cardOnColor || state.onColor || WEB_UI_COLORS.primary));
                var activeMode: any = configOptionValue(b.options, "card_active_color");
                var customActive: any = configOptionValue(b.options, "card_on_color").replace(/^#/, "");
                var explicitActive: any = activeMode === "theme" || (activeMode === "custom" && /^[0-9A-F]{6}$/i.test(customActive));
                var sliderFillColor: any = cardSliderFillColor(cardOffColor, explicitActive ? cardOnColor : "") || cardOnColor;
                if (sliderFillColor) btn.style.setProperty("--card-slider-fill-color", "#" + sliderFillColor);
                var contrastBackground: any = cardOffColor || color;
                btn.draggable = !isPreviewReadOnly();
                btn.setAttribute("data-pos", pos);
                btn.setAttribute("data-slot", slot);
                var hasWhenOn: any = !typePreview && (b.sensor || (b.icon_on && b.icon_on !== "Auto"));
                if (!typePreview && hasWhenOn && typeof cardOnPattern === "function" && cardOnPattern(b) === "stripes") {
                    var onColor: any = cardOnColor || (state.onColor && state.onColor.length === 6 ? state.onColor : WEB_UI_COLORS.primary);
                    contrastBackground = onColor;
                    btn.style.backgroundImage =
                        "repeating-linear-gradient(135deg,#" + onColor + " 0,#" + onColor +
                            " 12px,#" + cardPatternHighlightColor(onColor) + " 12px,#" + cardPatternHighlightColor(onColor) + " 20px)";
                }
                if (!btn.classList.contains("sp-image-card")) {
                    btn.style.setProperty("--card-text-color", cardOffColor || contrastBackground !== color
                        ? cardPreviewTextColor(contrastBackground) : "#" + previewColors.textPrimary);
                }
                if (shortcutOwner && b.type === "companion" && b.entity?.startsWith("shortcut.")) {
                    btn.dataset.previewShortcut = companionShortcutActionIdValid(b.entity) ? "valid" : "invalid";
                }
                var badgeIcon: any = b.sensor ? "gauge" : "swap-horizontal";
                var sensorBadge: any = hasWhenOn
                    ? '<span class="sp-sensor-badge mdi mdi-' + badgeIcon + '"></span>'
                    : '';
                var labelHtml: any = previewHtmlValue(typePreview, "labelHtml", '<span class="sp-btn-label">' + escHtml(label) + '</span>');
                var iconHtml: any = previewHtmlValue(typePreview, "iconHtml", '<span class="sp-btn-icon mdi mdi-' + iconName + '"></span>');
                btn.innerHTML =
                    sensorBadge +
                        iconHtml +
                        labelHtml;
                if (!dependencies.homeAssistantSupported() && cardRequiresHomeAssistant(b.type || "", b)) {
                    const warning = "Home Assistant unavailable. Saved configuration kept; replace or remove this card.";
                    btn.title = warning;
                    const badge = document.createElement("span");
                    badge.className = "sp-sensor-badge mdi mdi-alert";
                    badge.setAttribute("role", "img");
                    badge.setAttribute("aria-label", warning);
                    btn.appendChild(badge);
                }
                // Offer renaming only when the preview displays a name that can be saved.
                if (cardContractCard(b.type)?.normalization?.fields.label.policy !== "clear" &&
                    previewHtmlValue(typePreview, "labelEditable", true)) {
                    makeTitleEditable(btn, b.type === "image");
                }
                if (dependencies.displayDemo) {
                    const visibleLabel = btn.querySelector(".sp-btn-label")?.textContent?.trim();
                    btn.setAttribute("aria-label", visibleLabel || label);
                }
                appendResizeHandle(btn);
                main.appendChild(btn);
                const appIconSize = typePreview?.appIconId
                    ? cardIconSize(b.options, state.defaultIconSize) : "small";
                btn.setAttribute("data-icon-size", appIconSize);
                if (typePreview && typeof typePreview.appIconId === "string" &&
                    typePreview.appIconId.length > 0) {
                    const fallbackIcon = btn.querySelector(".sp-companion-app-icon-fallback") as HTMLElement | null;
                    const applicationId = typePreview.appIconId;
                    if (dependencies.displayDemo) btn.dataset.demoAppId = applicationId;
                    const backgroundColor = cardOffColor || (typeof typePreview.appIconBackgroundColor === "string"
                        ? typePreview.appIconBackgroundColor : "");
                    loadCardAppIcon(btn, applicationId, backgroundColor, fallbackIcon);
                }
                if (["light_brightness", "fan_speed", "cover", "slider", "light_temperature"].indexOf(b.type) !== -1) {
                    applySliderPreviewTextContrast(btn, cardOffColor ? cardPreviewTextColor(cardOffColor) : "#" + previewColors.textPrimary, sliderFillColor);
                }
                if (btn.classList.contains("sp-weather-daily-card")) weatherLayout.observe(btn);
            }
            else {
                var empty: any = document.createElement("div");
                empty.className = "sp-empty-cell";
                empty.setAttribute("data-pos", pos);
                empty.innerHTML = '<span class="sp-add-pill"><span class="sp-add-icon mdi mdi-plus"></span></span>';
                const folder = liveFolders?.get(pos);
                if (folder) {
                    const tile = document.createElement("div");
                    tile.className = "sp-live-folder-preview";
                    tile.title = "Live Finder folder. Click the cell to add a saved tile.";
                    const icon = document.createElement("span");
                    icon.className = "sp-btn-icon mdi mdi-" + iconSlug(companionCardDefaultIcon("folder"));
                    icon.setAttribute("aria-hidden", "true");
                    const label = document.createElement("span");
                    label.className = "sp-btn-label";
                    label.textContent = folder.label;
                    tile.append(icon, label);
                    empty.style.backgroundColor = "#" + defaultCardBackgroundColor("companion", state);
                    empty.appendChild(tile);
                }
                main.appendChild(empty);
            }
        }
        if (focused && editor && editor.dataset.homeSlot === String(state.editingSubpage || "")) {
            const title = (main as HTMLElement).querySelector('[data-slot="' + editorSlot + '"] .sp-editable-title');
            if (title) {
                title.closest<HTMLElement>("[data-slot]")!.draggable = false;
                title.replaceChildren(editor);
                editor.focus();
                editor.setSelectionRange(selectionStart, selectionEnd);
            }
        }
        updateShortcutAvailability();
        renderSelectionBar(c);
    }
    document.addEventListener("espdesktop:app-icon-cache-cleared", function (event) {
        const context = (event as CustomEvent<{ name: string; value: string }>).detail;
        if (clearCompanionAppIconPreviewCache(context)) renderPreview();
    });
    return {
        render: renderPreview,
        updateShortcutAvailability,
        registryValue: buttonTypeRegistryValue,
        configDisabled: buttonConfigDisabledForDevice,
        defaultTypeForPicker: defaultButtonTypeForPicker,
        pickerOptions: buttonTypePickerOptionList,
        pickerKeys: buttonTypePickerKeys,
        typeVisibleInPicker: buttonTypeVisibleInPicker,
    };
}
