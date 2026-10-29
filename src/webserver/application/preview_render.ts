import { state } from "../state/app_instance";
import { cardContractCard } from "../generated/card_contract";
import { WEB_UI_COLORS } from "../state/ui_tokens";
import { COMPANION_APP_ICON_SIDE } from "../generated/companion_capabilities";
import { appIconArtworkBounds, appIconFitSide } from "../model/app_icon_layout";
import { PREVIEW_THEME_COLORS, defaultCardBackgroundColor, previewEffectiveTheme } from "../state/preview_theme";
import { cardIconSize, configOptionValue, cardActiveColor } from "../model/config_primitives";
import { escHtml } from "./ui_primitives";
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
    readonly updateClockBarItemUi: () => void;
    readonly document: Document;
    readonly layout: ApplicationLayoutState;
    readonly cards: CardRegistry;
    readonly confirmationOptions: ConfigConfirmationOptionsFeature;
    readonly codec: ConfigCodecFeature;
    readonly runtime: UiRuntimeState;
    readonly screenRotation: ScreenRotationFeature;
    readonly shell: Pick<ControlsShellFeature, "isConfigLocked">;
    readonly grid: Pick<GridFeature, "ctx" | "resolveIcon" | "sizeClass">;
    readonly selection: Pick<ButtonSettingsSelectionFeature, "renderSelectionBar" | "updatePreviewHint">;
    readonly homeAssistantSupported: () => boolean;
}
export interface PreviewRenderFeature {
    render(): void;
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

const companionAppIconCache = new Map<string, {
    expiresAt: number;
    result: Promise<CompanionAppIconPreview | null>;
}>();

export function companionAppIconPreviewData(applicationId: string, backgroundColor: string, document: Document): Promise<CompanionAppIconPreview | null> {
    const cacheKey = applicationId + ":" + backgroundColor;
    const cached = companionAppIconCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.result;
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
        if (!value || !value.online) companionAppIconCache.delete(cacheKey);
        return value;
    });
    companionAppIconCache.set(cacheKey, { expiresAt: Date.now() + 5 * 60 * 1000, result });
    return result;
}

export function createPreviewRenderFeature(dependencies: PreviewRenderDependencies): PreviewRenderFeature {
    const document = dependencies.document;
    const els = dependencies.runtime.els;
    const { cardOnPattern } = dependencies.confirmationOptions;
    const { getSubpage } = dependencies.codec;
    const { gridPreviewBlocked: gridPreviewBlockedByRotationStartup } = dependencies.screenRotation;
    const { isConfigLocked } = dependencies.shell;
    const { ctx, resolveIcon, sizeClass } = dependencies.grid;
    const { renderSelectionBar, updatePreviewHint } = dependencies.selection;
    const appIconArtwork = new WeakMap<HTMLImageElement, CompanionAppIconPreview>();
    function resizeStandardIcon(button: HTMLElement): void {
        const icon = button.querySelector<HTMLElement>(".sp-btn-icon:not(img)");
        const view = document.defaultView;
        if (!icon || !view) return;
        const style = view.getComputedStyle(button);
        const label = button.querySelector<HTMLElement>(".sp-btn-label, .sp-btn-label-row");
        const width = button.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        const height = button.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)
            - (label?.getBoundingClientRect().height || 0) - 4;
        const requested = button.dataset.iconSize === "large" ? 2 : 1.5;
        const scale = Math.max(0.01, Math.min(requested,
            width / Math.max(1, icon.offsetWidth), height / Math.max(1, icon.offsetHeight)));
        icon.style.transformOrigin = "top left";
        icon.style.transform = "scale(" + scale + ")";
    }
    const standardIconResizeObserver = typeof ResizeObserver === "function"
        ? new ResizeObserver(entries => entries.forEach(entry => {
            const button = entry.target.closest<HTMLElement>(".sp-btn");
            if (button) resizeStandardIcon(button);
        })) : null;
    // Use a single measured side for square images at every card aspect ratio.
    function resizeAppIcon(button: Element): void {
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
        const side = appIconFitSide(width, height, labelHeight, Math.max(3, smallSide / 4),
            artwork.artworkWidthFraction, artwork.artworkHeightFraction);
        icon.style.width = side + "px";
        icon.style.height = side + "px";
        icon.style.left = (parseFloat(style.paddingLeft) - side * artwork.insetLeftPercent / 100) + "px";
        icon.style.top = (parseFloat(style.paddingTop) - side * artwork.insetTopPercent / 100) + "px";
    }
    const appIconResizeObserver = typeof ResizeObserver === "function"
        ? new ResizeObserver(entries => entries.forEach(entry => resizeAppIcon(entry.target.closest(".sp-btn") || entry.target))) : null;
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
        return cardTypePickerOptions(dependencies.cards.definitions, dependencies.layout.config.disabledCardTypes || [], !!dependencies.layout.config.infoOnly, !!isSub, selectedTypeKey, connector, dependencies.homeAssistantSupported());
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
        if (isConfigLocked()) return;
        const handle = document.createElement("button");
        handle.type = "button";
        handle.className = "sp-resize-handle";
        handle.setAttribute("aria-label", "Resize card");
        handle.title = "Drag to resize";
        handle.innerHTML = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M 27 8 Q 24 24 8 27"/></svg>';
        card.appendChild(handle);
    }
    function makeTitleEditable(card: HTMLElement, image = false) {
        if (isConfigLocked()) return;
        const title = card.querySelector<HTMLElement>(image ? ".sp-image-label-stack" : ".sp-btn-label:not(.sp-media-now-artist)");
        if (!title) return;
        title.classList.add("sp-editable-title");
        title.tabIndex = 0;
        title.setAttribute("role", "button");
        title.setAttribute("aria-label", "Rename card");
        title.title = "Click to rename; Enter to save";
    }
    function renderPreview(this: any) {
        appIconResizeObserver?.disconnect();
        standardIconResizeObserver?.disconnect();
        const previewColors = PREVIEW_THEME_COLORS[previewEffectiveTheme(state)];
        dependencies.updateClockBarItemUi();
        var main: any = els.previewMain;
        weatherLayout.disconnect();
        // Keep the active editor and its selection through device state refreshes.
        const editor = main.querySelector(".sp-card-name-input") as HTMLInputElement | null;
        const focused = editor && document.activeElement === editor;
        const selectionStart = editor?.selectionStart ?? null;
        const selectionEnd = editor?.selectionEnd ?? null;
        const editorSlot = editor?.closest("[data-slot]")?.getAttribute("data-slot");
        main.innerHTML = "";
        main.className = "sp-main" + (state.subpageChevronsOn ? "" : " sp-hide-subpage-chevrons");
        if (gridPreviewBlockedByRotationStartup()) {
            main.className += " sp-grid-loading";
            main.setAttribute("aria-busy", "true");
            return;
        }
        main.removeAttribute("aria-busy");
        var c: any = ctx();
        updatePreviewHint(c);
        for (var pos: any = 0; pos < c.maxSlots; pos++) {
            var slot: any = c.grid[pos];
            if (slot === -1)
                continue;
            if (slot === -2) {
                var backBtn: any = document.createElement("div");
                var bkSz: any = c.sizes[-2];
                var subpage = c.isSub ? getSubpage(state.editingSubpage) : null;
                var backLabel = subpage?.backLabel || "Back";
                var backColor = subpage?.backColor || previewColors.surfaceCard;
                backBtn.className = "sp-btn sp-back-btn" + sizeClass(bkSz) +
                    (c.selected.indexOf(-2) !== -1 ? " sp-selected" : "");
                backBtn.innerHTML =
                    '<span class="sp-btn-icon sp-back-hit mdi mdi-chevron-left"></span>' +
                        '<span class="sp-btn-label">' + escHtml(backLabel) + '</span>';
                backBtn.style.backgroundColor = "#" + backColor;
                backBtn.style.setProperty("--card-text-color", subpage?.backColor
                    ? cardPreviewTextColor(backColor) : "#" + previewColors.textPrimary);
                backBtn.style.cursor = "pointer";
                backBtn.setAttribute("data-pos", pos);
                backBtn.draggable = !isConfigLocked();
                backBtn.setAttribute("data-slot", "-2");
                makeTitleEditable(backBtn);
                appendResizeHandle(backBtn);
                main.appendChild(backBtn);
            }
            else if (slot > 0) {
                if (slot > (c.isSub ? c.buttons.length : c.maxSlots)) {
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
                if (!buttonTypeInfoOnlyVisible(b.type || "")) {
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
                const btn: any = document.createElement("div");
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
                btn.draggable = !isConfigLocked();
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
                // Offer renaming only when the preview displays a name that can be saved.
                if (cardContractCard(b.type)?.normalization?.fields.label.policy !== "clear" &&
                    previewHtmlValue(typePreview, "labelEditable", true)) {
                    makeTitleEditable(btn, b.type === "image");
                }
                appendResizeHandle(btn);
                main.appendChild(btn);
                const standardIconSize = cardIconSize(b.options);
                if (standardIconSize !== "small" && !typePreview?.appIconId) {
                    btn.dataset.iconSize = standardIconSize;
                    resizeStandardIcon(btn);
                    standardIconResizeObserver?.observe(btn);
                    const title = btn.querySelector(".sp-btn-label, .sp-btn-label-row");
                    if (title) standardIconResizeObserver?.observe(title);
                }
                if (typePreview && typeof typePreview.appIconId === "string" &&
                    typePreview.appIconId.length > 0) {
                    const fallbackIcon = btn.querySelector(".sp-companion-app-icon-fallback") as HTMLElement | null;
                    const applicationId = typePreview.appIconId;
                    const backgroundColor = cardOffColor || (typeof typePreview.appIconBackgroundColor === "string"
                        ? typePreview.appIconBackgroundColor : "");
                    const loadAppIcon = function (attempt: number): void {
                        void companionAppIconPreviewData(applicationId, backgroundColor, document).then(function (previewIcon) {
                            if (!btn.isConnected) return;
                            if (!previewIcon) {
                                if (attempt < 12) window.setTimeout(function () {
                                    loadAppIcon(attempt + 1);
                                }, Math.min(5000 * 2 ** Math.min(attempt, 3), 30000));
                                return;
                            }
                        const appIcon = document.createElement("img");
                        appIcon.className = "sp-btn-icon sp-companion-app-icon";
                        btn.classList.add("sp-companion-app-icon-fit-card");
                        appIcon.alt = "";
                        appIcon.setAttribute("aria-hidden", "true");
                        appIcon.src = previewIcon.dataUrl;
                        appIconArtwork.set(appIcon, previewIcon);
                        btn.appendChild(appIcon);
                        resizeAppIcon(btn);
                        appIconResizeObserver?.observe(btn);
                        const label = btn.querySelector(".sp-btn-label");
                        if (label) appIconResizeObserver?.observe(label);
                        if (fallbackIcon) fallbackIcon.hidden = true;
                        if (previewIcon.online && previewIcon.defaultColor && previewIcon.activeColor) {
                            btn.style.backgroundColor = "#" + previewIcon.defaultColor;
                            btn.style.setProperty("--card-text-color", cardPreviewTextColor(previewIcon.defaultColor));
                            btn.style.setProperty("--sp-companion-app-icon-active-text", cardPreviewTextColor(previewIcon.activeColor));
                            btn.style.setProperty("--sp-companion-app-icon-active", "#" + previewIcon.activeColor);
                            btn.classList.add("sp-companion-app-icon-card");
                        }
                        });
                    };
                    loadAppIcon(0);
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
        renderSelectionBar(c);
    }
    document.addEventListener("espdesktop:app-icon-cache-cleared", function () {
        companionAppIconCache.clear();
        renderPreview();
    });
    return {
        render: renderPreview,
        registryValue: buttonTypeRegistryValue,
        configDisabled: buttonConfigDisabledForDevice,
        defaultTypeForPicker: defaultButtonTypeForPicker,
        pickerOptions: buttonTypePickerOptionList,
        pickerKeys: buttonTypePickerKeys,
        typeVisibleInPicker: buttonTypeVisibleInPicker,
    };
}
