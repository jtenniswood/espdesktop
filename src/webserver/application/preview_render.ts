import { state } from "../state/app_instance";
import { WEB_UI_COLORS } from "../state/ui_tokens";
import { COMPANION_APP_ICON_SIDE } from "../generated/companion_capabilities";
import { appIconArtworkInsets } from "../model/app_icon_layout";
import { escHtml } from "./ui_primitives";
import {
    buttonConfigDisabledForDevice as isButtonConfigDisabledForDevice,
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
        const insets = appIconArtworkInsets(bytes.subarray(pixelCount * 2), COMPANION_APP_ICON_SIDE);
        const palette = (response.headers.get("X-EspDesktop-App-Icon-Palette") || "").split(",");
        const legacyDefaultColor = response.headers.get("X-EspDesktop-App-Icon-Default") || "";
        const legacyActiveColor = response.headers.get("X-EspDesktop-App-Icon-Active") || "";
        const defaultColor = palette[0] || legacyDefaultColor;
        const activeColor = palette[1] || legacyActiveColor;
        const validDefaultColor = /^[0-9a-f]{6}$/i.test(defaultColor)
            ? defaultColor : "";
        const validActiveColor = /^[0-9a-f]{6}$/i.test(activeColor)
            ? activeColor : validDefaultColor;
        return {
            dataUrl: canvas.toDataURL("image/png"),
            defaultColor: validDefaultColor,
            activeColor: validActiveColor,
            online,
            insetLeftPercent: insets.left * 100 / COMPANION_APP_ICON_SIDE,
            insetTopPercent: insets.top * 100 / COMPANION_APP_ICON_SIDE,
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
    function renderPreview(this: any) {
        dependencies.updateClockBarItemUi();
        var main: any = els.previewMain;
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
                var backLabel: any = c.isSub ? (getSubpage(state.editingSubpage).backLabel || "Back") : "Back";
                backBtn.className = "sp-btn sp-back-btn" + sizeClass(bkSz) +
                    (c.selected.indexOf(-2) !== -1 ? " sp-selected" : "");
                backBtn.innerHTML =
                    '<span class="sp-btn-icon sp-back-hit mdi mdi-chevron-left"></span>' +
                        '<span class="sp-btn-label">' + escHtml(backLabel) + '</span>';
                backBtn.style.backgroundColor = "#" + WEB_UI_COLORS.secondary;
                backBtn.style.cursor = "pointer";
                backBtn.setAttribute("data-pos", pos);
                backBtn.draggable = !isConfigLocked();
                main.appendChild(backBtn);
            }
            else if (slot > 0) {
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
                var color: any = (b.type === "sensor" || b.type === "local_sensor" || b.type === "door_window" || b.type === "presence" || b.type === "weather" || b.type === "weather_forecast" || b.type === "calendar" || b.type === "clock" || b.type === "timezone")
                    ? WEB_UI_COLORS.tertiary : WEB_UI_COLORS.secondary;
                var previewTypeDef: any = dependencies.cards.definitions[b.type || ""] || null;
                if (previewTypeDef && c.isSub && !buttonTypeRegistryValue(previewTypeDef, "allowInSubpage", false)) {
                    previewTypeDef = null;
                }
                var slotSz: any = c.sizes[slot];
                var typePreview: any = previewTypeDef && previewTypeDef.renderPreview
                    ? previewTypeDef.renderPreview(b, { escHtml: escHtml, cardSize: slotSz || 1 })
                    : null;
                const btn: any = document.createElement("div");
                btn.className = "sp-btn" +
                    (typePreview && typePreview.buttonClass ? " " + typePreview.buttonClass : "") +
                    sizeClass(slotSz) +
                    (c.selected.indexOf(slot) !== -1 ? " sp-selected" : "");
                btn.style.backgroundColor = "#" + color;
                btn.draggable = !isConfigLocked();
                btn.setAttribute("data-pos", pos);
                btn.setAttribute("data-slot", slot);
                var hasWhenOn: any = !typePreview && (b.sensor || (b.icon_on && b.icon_on !== "Auto"));
                if (!typePreview && hasWhenOn && typeof cardOnPattern === "function" && cardOnPattern(b) === "stripes") {
                    var onColor: any = state.onColor && state.onColor.length === 6 ? state.onColor : WEB_UI_COLORS.primary;
                    btn.style.backgroundImage =
                        "repeating-linear-gradient(135deg,#" + onColor + " 0,#" + onColor +
                            " 12px,rgba(255,255,255,.22) 12px,rgba(255,255,255,.22) 20px)";
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
                main.appendChild(btn);
                if (typePreview && typeof typePreview.appIconId === "string" &&
                    typePreview.appIconId.length > 0) {
                    const fallbackIcon = btn.querySelector(".sp-companion-app-icon-fallback") as HTMLElement | null;
                    const applicationId = typePreview.appIconId;
                    const backgroundColor = typeof typePreview.appIconBackgroundColor === "string"
                        ? typePreview.appIconBackgroundColor : "";
                    const fillCard = typePreview.appIconFill === true;
                    const mediumIcon = !fillCard && typePreview.appIconMedium === true;
                    const mediumIconLabelHidden = mediumIcon && typePreview.appIconLabelHidden === true;
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
                        appIcon.className = "sp-btn-icon sp-companion-app-icon" +
                            (fillCard ? " sp-companion-app-icon-fill" : mediumIcon
                                ? " sp-companion-app-icon-medium" +
                                    (mediumIconLabelHidden ? " sp-companion-app-icon-medium-no-label" : "")
                                : "");
                        if (fillCard) btn.classList.add("sp-companion-app-icon-fill-card");
                        else if (mediumIcon) btn.classList.add("sp-companion-app-icon-medium-card");
                        appIcon.alt = "";
                        appIcon.setAttribute("aria-hidden", "true");
                        appIcon.src = previewIcon.dataUrl;
                        if (!fillCard) appIcon.style.transform =
                            "translate(-" + previewIcon.insetLeftPercent + "%, -" + previewIcon.insetTopPercent + "%)";
                        btn.appendChild(appIcon);
                        if (fallbackIcon) fallbackIcon.hidden = true;
                        if (previewIcon.online && previewIcon.defaultColor && previewIcon.activeColor &&
                            (backgroundColor || state.appIconAutoColourGenerationEnabled)) {
                            btn.style.backgroundColor = "#" + previewIcon.defaultColor;
                            btn.style.setProperty("--sp-companion-app-icon-active", "#" + previewIcon.activeColor);
                            btn.classList.add("sp-companion-app-icon-card");
                        }
                        });
                    };
                    loadAppIcon(0);
                }
            }
            else {
                var empty: any = document.createElement("div");
                empty.className = "sp-empty-cell";
                empty.setAttribute("data-pos", pos);
                empty.innerHTML = '<span class="sp-add-pill"><span class="sp-add-icon mdi mdi-plus"></span></span>';
                main.appendChild(empty);
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
