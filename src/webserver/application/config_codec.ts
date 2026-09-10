import { state } from "../state/app_instance";
import * as EspDesktopModel from "../model";
import { configOptionEnabled, configOptionValue, setConfigOptionValue } from "../model/config_primitives";
import {
    CARD_SIZE_EXTRA_LARGE,
    CARD_SIZE_LANDSCAPE_LARGE,
    CARD_SIZE_LARGE,
    CARD_SIZE_MAX_TALL,
    CARD_SIZE_MAX_WIDE,
    CARD_SIZE_PORTRAIT_LARGE,
    CARD_SIZE_SINGLE,
    CARD_SIZE_ULTRA_WIDE,
} from "../model/grid";
import {
    cardContractDefaultConfig,
    cardContractFanDefaultIcon,
    cardContractIsBrightnessSliderType,
    cardContractIsFanCardType,
    cardContractIsOptionSelectType,
    cardContractSubpageTypeCode,
    cardContractSubpageTypeFromCode,
} from "../generated/card_contract";
import { COMPANION_SYSTEM_METRICS } from "../generated/companion_capabilities";
import { normalizeCompanionAppShortcutOptions } from "./companion_shortcut_folder";
import type { CardRegistry } from "./card_registry";
import type { ConfigSensorOptionsFeature } from "./config_sensor_options";
import type { ConfigMediaOptionsFeature } from "./config_media_options";
import type { ConfigImageOptionsFeature } from "./config_image_options";
import type { ConfigModalTabOptionsFeature } from "./config_modal_tab_options";
import type { ConfigAccessClimateAlarmOptionsFeature } from "./config_access_climate_alarm_options";
import type { ConfigConfirmationOptionsFeature } from "./config_confirmation_options";
import {
    IMAGE_ICON_OPTION,
    MEDIA_COVER_ART_OPTION,
    copyLargeNumbersOption,
} from "./config_option_core";
import {
    applySubpagePresetConfig,
    normalizeSubpageOptions,
    subpageKind,
} from "./config_subpage_options";
import {
    ACTION_CARD_LOCAL_ACTION,
    ACTION_CARD_OPTION_SELECT_ACTION,
} from "./config_action_contract";
import { normalizeCoverMode } from "./config_cover_contract";
import type { ConfigWeatherOptionsFeature } from "./config_weather_options";
import type { ConfigWebhookOptionsFeature } from "./config_webhook_options";
import type { ConfigLockOptionsFeature } from "./config_lock_options";
import type { ConfigDateTimeOptionsFeature } from "./config_date_time_options";
import type { ApplicationLayoutState } from "./application_context";
import type { ApplicationApiFeature } from "./api";
import type { ConfigPersistenceFeature } from "./config_post_api";
import type { ButtonSettingsRenderQueueFeature } from "./button_settings_render_queue";
export function createConfigCodecFeature(
    cardRegistry: CardRegistry,
    sensorOptions: ConfigSensorOptionsFeature,
    mediaOptions: ConfigMediaOptionsFeature,
    imageOptions: ConfigImageOptionsFeature,
    weatherOptions: ConfigWeatherOptionsFeature,
    webhookOptions: ConfigWebhookOptionsFeature,
    lockOptions: ConfigLockOptionsFeature,
    dateTimeOptions: ConfigDateTimeOptionsFeature,
    modalTabs: ConfigModalTabOptionsFeature,
    accessOptions: ConfigAccessClimateAlarmOptionsFeature,
    confirmationOptions: ConfigConfirmationOptionsFeature,
    layout: ApplicationLayoutState,
    configPersistence: Pick<ConfigPersistenceFeature, "saveSubpageEntity" | "scheduleSliderSubpageMigration">,
    renderQueue: ButtonSettingsRenderQueueFeature,
    rendering: { renderPreview(): void; renderButtonSettings(force?: boolean): void },
) {
    const { renderPreview, renderButtonSettings } = rendering;
    const { saveSubpageEntity, scheduleSliderSubpageMigration } = configPersistence;
    let requestApi: Pick<ApplicationApiFeature, "postText"> | undefined;
    function connectRequestApi(value: Pick<ApplicationApiFeature, "postText">) {
        requestApi = value;
    }
    function requests(): Pick<ApplicationApiFeature, "postText"> {
        if (!requestApi)
            throw new Error("Configuration codec used before the application API was connected");
        return requestApi;
    }
    const { normalizeDateTimeOptions } = sensorOptions;
    const { normalizeWebhookConfig } = webhookOptions;
    // ── Subpage helpers ────────────────────────────────────────────────────
    function normalizeWithRegisteredCardType(this: any, b?: any) {
        if (!b)
            return false;
        var typeDef: any = cardRegistry.definitions[b.type || ""];
        if (!typeDef || typeof typeDef.normalizeConfig !== "function")
            return false;
        typeDef.normalizeConfig(b);
        return true;
    }
    function cardRequiresSquareSize(this: any, b?: any) {
        return false;
    }
    function cardIsWifiSharing(this: any, b?: any) {
        return !!(b && (b.type === "wifi_qr" || b.type === "wifi_qr_card"));
    }
    function cardSupportsWifiPortraitSizes(this: any, b?: any) {
        return cardIsWifiSharing(b) && (
            layout.deviceId === "guition-esp32-p4-jc8012p4a1" ||
            layout.deviceId === "guition-esp32-p4-jc8012p4a1-v2"
        );
    }
    function cardSupportsExtraLargeSize(this: any, b?: any) {
        return cardRequiresSquareSize(b) || cardIsWifiSharing(b);
    }
    function cardSupportsMaxSize(this: any, b?: any) {
        return !!(b && b.type === "image");
    }
    function cardSupportsPortraitLargeSize(this: any, b?: any) {
        return (cardRequiresSquareSize(b) || cardSupportsMaxSize(b)) && layout.gridRows >= 4 && layout.gridCols >= 3;
    }
    function cardSupportsLandscapeLargeSize(this: any, b?: any) {
        return cardSupportsMaxSize(b) && layout.gridRows >= 3 && layout.gridCols >= 4;
    }
    function cardSupportsUltraWideSize(this: any, b?: any) {
        return !cardRequiresSquareSize(b) && layout.gridCols >= 5;
    }
    function normalizeCardSizeForConfig(this: any, b?: any, size?: any) {
        size = size || CARD_SIZE_SINGLE;
        // Wi-Fi sharing keeps its own allow-list, so it stays ahead of the
        // wider spans and never resolves to Ultra Wide.
        if (cardIsWifiSharing(b)) {
            if (size === CARD_SIZE_SINGLE || size === CARD_SIZE_LARGE)
                return size;
            if (size === CARD_SIZE_EXTRA_LARGE)
                return layout.gridCols >= 3 && layout.gridRows >= 3 ? size : CARD_SIZE_SINGLE;
            if (cardSupportsWifiPortraitSizes(b) &&
                (size === CARD_SIZE_MAX_TALL || size === CARD_SIZE_PORTRAIT_LARGE))
                return size;
            return CARD_SIZE_SINGLE;
        }
        if (size === CARD_SIZE_ULTRA_WIDE)
            return cardSupportsUltraWideSize(b) ? size : CARD_SIZE_SINGLE;
        if (size === CARD_SIZE_LANDSCAPE_LARGE)
            return cardSupportsLandscapeLargeSize(b) ? size : CARD_SIZE_SINGLE;
        if (size === CARD_SIZE_PORTRAIT_LARGE)
            return cardSupportsPortraitLargeSize(b) ? size : CARD_SIZE_SINGLE;
        if (size === CARD_SIZE_MAX_WIDE || size === CARD_SIZE_MAX_TALL)
            return cardSupportsMaxSize(b) ? size : CARD_SIZE_SINGLE;
        if (!cardRequiresSquareSize(b))
            return size;
        return size === CARD_SIZE_LARGE || size === CARD_SIZE_EXTRA_LARGE
            ? size
            : CARD_SIZE_SINGLE;
    }
    function normalizeButtonConfig(this: any, value?: any) {
        const b = value || EspDesktopModel.emptyCardConfig();
        if (!b.type) return EspDesktopModel.emptyCardConfig();
        if (!cardRegistry.definitions[b.type]) return EspDesktopModel.emptyCardConfig();
        b.options = b.options || "";
        b.icon_on = "Auto";
        normalizeWithRegisteredCardType(b);
        if (b.type === "webhook") normalizeWebhookConfig(b);
        else if (b.type === "subpage") {
            b.options = normalizeSubpageOptions(b.options, b.sensor, b.precision);
        } else if (["calendar", "clock", "timezone"].includes(b.type)) {
            b.label = "";
            b.sensor = "";
            if (b.type !== "timezone") b.entity = "";
            b.options = normalizeDateTimeOptions(b.type, b.options, b.precision);
        } else if (b.type === "screen_lock") {
            b.entity = ""; b.label = ""; b.sensor = "";
            b.unit = ""; b.precision = ""; b.options = "";
        }
        return b;
    }
    function isBrightnessSliderType(this: any, type?: any) {
        return cardContractIsBrightnessSliderType(type);
    }
    function isFanCardType(this: any, type?: any) {
        return cardContractIsFanCardType(type);
    }
    function isClimateCardType(this: any, type?: any) {
        return type === "climate" || type === "climate_control";
    }
    function isOptionSelectType(this: any, type?: any) {
        return cardContractIsOptionSelectType(type);
    }
    function fanCardDefaultIcon(this: any, type?: any) {
        return cardContractFanDefaultIcon(type);
    }
    function buttonConfigChangedByNormalize(this: any, raw?: any) {
        var before: any = EspDesktopModel.cloneCardConfig(raw || {});
        var after: any = normalizeButtonConfig(EspDesktopModel.cloneCardConfig(before));
        return EspDesktopModel.cardConfigChanged(before, after);
    }
    function trimConfigFields(this: any, fields?: any) {
        return EspDesktopModel.trimConfigFields(fields);
    }
    function buttonConfigFields(this: any, value?: any) {
        const b = normalizeButtonConfig(EspDesktopModel.cloneCardConfig(value || {}));
        return trimConfigFields(EspDesktopModel.CARD_CONFIG_FIELDS.map(key => b[key] || ""));
    }
    function encodeConfigField(this: any, value?: any) {
        return EspDesktopModel.encodeConfigField(value);
    }
    function decodeConfigField(this: any, value?: any) {
        return EspDesktopModel.decodeConfigField(value);
    }
    function legacyButtonConfigSafe(this: any, fields?: any) {
        return EspDesktopModel.legacyButtonConfigSafe(fields);
    }
    function serializeButtonConfig(this: any, b?: any) {
        var fields: any = buttonConfigFields(b || {});
        if (legacyButtonConfigSafe(fields))
            return fields.join(";");
        return "~" + fields.map(encodeConfigField).join(",");
    }
    function parseRawButtonConfig(this: any, str?: any) {
        return EspDesktopModel.parseRawButtonConfig(str);
    }
    function parseButtonConfig(this: any, str?: any) {
        return normalizeButtonConfig(parseRawButtonConfig(str));
    }
    function hasLegacySliderDirection(this: any, b?: any) {
        return !!(b && isBrightnessSliderType(b.type) && b.sensor);
    }
    function buttonConfigHasLegacySliderDirection(this: any, str?: any) {
        return hasLegacySliderDirection(parseRawButtonConfig(str || ""));
    }
    function buttonConfigNeedsMigration(this: any, str?: any) {
        return buttonConfigChangedByNormalize(parseRawButtonConfig(str || ""));
    }
    function parseBackOrderToken(this: any, value?: any) {
        return EspDesktopModel.parseBackOrderToken(value);
    }
    function backOrderToken(this: any, baseToken?: any, label?: any) {
        return EspDesktopModel.backOrderToken(baseToken, label);
    }
    function backLabelFromOrder(this: any, order?: any) {
        return EspDesktopModel.backLabelFromOrder(order);
    }
    function parseSubpageOrder(this: any, orderStr?: any) {
        return EspDesktopModel.parseSubpageOrder(orderStr);
    }
    function subpageOrderForSerialize(this: any, sp?: any) {
        return EspDesktopModel.subpageOrderForSerialize((sp && sp.order) || [], sp && sp.backLabel);
    }
    function subpageSerializedOrder(this: any, sp?: any) {
        if (!sp)
            return [];
        if (sp.order && sp.order.length)
            return subpageOrderForSerialize(sp);
        if (sp.grid && sp.grid.length)
            return serializeSubpageGrid(sp);
        return [];
    }
    function parseSubpageConfig(this: any, str?: any, raw?: any) {
        var parsed: any = EspDesktopModel.parseRawSubpageConfig(str, subpageTypeFromCode);
        if (raw)
            return parsed;
        var compactButtonTokens: any = String(str || "").charAt(0) === "~"
            ? String(str || "").split("|").slice(1)
            : [];
        parsed.buttons = parsed.buttons.map(function (this: any, button?: any, index?: any) {
            var normalized: any = normalizeButtonConfig(button);
            if (button && button.type === "calendar" && (!button.entity || compactButtonTokens[index] === "D"))
                normalized.entity = "";
            return normalized;
        });
        return parsed;
    }
    function subpageTypeCode(this: any, type?: any) {
        return cardContractSubpageTypeCode(type);
    }
    function subpageTypeFromCode(this: any, code?: any) {
        return cardContractSubpageTypeFromCode(code);
    }
    function encodeSubpageField(this: any, value?: any) {
        return encodeConfigField(value);
    }
    function decodeSubpageField(this: any, value?: any) {
        return decodeConfigField(value);
    }
    function parseCompactSubpageConfig(this: any, str?: any, raw?: any) {
        var parsed: any = EspDesktopModel.parseCompactSubpageConfig(str, subpageTypeFromCode);
        if (raw)
            return parsed;
        var compactButtonTokens: any = String(str || "").split("|").slice(1);
        parsed.buttons = parsed.buttons.map(function (this: any, button?: any, index?: any) {
            var normalized: any = normalizeButtonConfig(button);
            if (button && button.type === "calendar" && compactButtonTokens[index] === "D")
                normalized.entity = "";
            return normalized;
        });
        return parsed;
    }
    function subpageConfigHasLegacySliderDirection(this: any, str?: any) {
        var sp: any = parseSubpageConfig(str, true);
        for (var i: any = 0; i < sp.buttons.length; i++) {
            if (hasLegacySliderDirection(sp.buttons[i]))
                return true;
        }
        return false;
    }
    function subpageConfigNeedsMigration(this: any, str?: any) {
        var sp: any = parseSubpageConfig(str, true);
        for (var i: any = 0; i < sp.buttons.length; i++) {
            if (buttonConfigChangedByNormalize(sp.buttons[i]))
                return true;
        }
        return false;
    }
    function serializeSubpageConfig(this: any, sp?: any) {
        var order: any = subpageSerializedOrder(sp);
        var legacy: any = legacySubpageConfigSafe(sp) ? serializeLegacySubpageConfig(sp) : "";
        var compact: any = serializeCompactSubpageConfig(sp);
        return EspDesktopModel.chooseSerializedSubpageConfig(order, sp && sp.buttons ? sp.buttons.length : 0, legacy, compact);
    }
    function subpageLegacyButtonFields(this: any, b?: any) {
        var fields: any = buttonConfigFields(b || {});
        if (fields.length > 1 && fields[fields.length - 1] === "Auto") {
            while (fields.length > 1 && (fields[fields.length - 1] === "Auto" || !fields[fields.length - 1]))
                fields.pop();
        }
        return fields;
    }
    function subpageCompactButtonFields(this: any, b?: any) {
        var fields: any = buttonConfigFields(b || {});
        var compact: any = [
            subpageTypeCode(fields[6] || ""),
            encodeSubpageField(fields[0]),
            encodeSubpageField(fields[1]),
            fields[2] && fields[2] !== "Auto" ? encodeSubpageField(fields[2]) : "",
            fields[3] && fields[3] !== "Auto" ? encodeSubpageField(fields[3]) : "",
            encodeSubpageField(fields[4]),
            encodeSubpageField(fields[5]),
            encodeSubpageField(fields[7]),
            encodeSubpageField(fields[8]),
        ];
        while (compact.length > 1 && !compact[compact.length - 1])
            compact.pop();
        return compact;
    }
    function legacySubpageConfigSafe(this: any, sp?: any) {
        var fields: any = ((sp && sp.buttons) || []).map(subpageLegacyButtonFields);
        return EspDesktopModel.legacySubpageFieldsSafe(fields);
    }
    function serializeLegacySubpageConfig(this: any, sp?: any) {
        if (!sp)
            return "";
        return EspDesktopModel.serializeLegacySubpageConfig(subpageSerializedOrder(sp), ((sp && sp.buttons) || []).map(subpageLegacyButtonFields));
    }
    function serializeCompactSubpageConfig(this: any, sp?: any) {
        if (!sp || !sp.buttons || sp.buttons.length === 0)
            return "";
        return EspDesktopModel.serializeCompactSubpageConfig(subpageSerializedOrder(sp), sp.buttons.map(subpageCompactButtonFields));
    }
    function applySubpageRaw(this: any, slot?: any) {
        var raw: any = state.subpageRaw[slot];
        var combined: any = (raw && raw.main || "") + (raw && raw.ext || "") +
            (raw && raw.ext2 || "") + (raw && raw.ext3 || "") +
            (raw && raw.ext4 || "") + (raw && raw.ext5 || "") +
            (raw && raw.ext6 || "") + (raw && raw.ext7 || "");
        var pending: any = state.subpageSavePending[slot];
        if (pending) {
            if (combined !== pending) {
                if (state.editingSubpage === slot)
                    renderQueue.schedule();
                return;
            }
            delete state.subpageSavePending[slot];
        }
        var local: any = state.subpages[slot];
        var localHasData: any = local && ((local.buttons && local.buttons.length > 0) ||
            (local.order && local.order.length > 0));
        if (state.editingSubpage === slot && localHasData) {
            var localSerialized: any = serializeSubpageConfig(local);
            if (combined !== localSerialized) {
                renderQueue.schedule();
                return;
            }
        }
        if (combined) {
            var migrateConfig: any = subpageConfigNeedsMigration(combined);
            var sp: any = parseSubpageConfig(combined);
            sp.sizes = sp.sizes || {};
            var layoutNormalized: any = buildSubpageGridAndNormalizeOrder(sp);
            state.subpages[slot] = sp;
            if (migrateConfig || layoutNormalized)
                scheduleSliderSubpageMigration(slot);
        }
        else {
            delete state.subpages[slot];
        }
        if (state.editingSubpage === slot) {
            renderQueue.schedule();
        }
    }
    function getSubpage(this: any, homeSlot?: any) {
        var subpage = state.subpages[homeSlot];
        if (!subpage) {
            subpage = { order: [], buttons: [], grid: [], sizes: {}, backLabel: "Back" };
            state.subpages[homeSlot] = subpage;
        }
        else if (!subpage.backLabel) {
            subpage.backLabel = backLabelFromOrder(subpage.order);
        }
        return subpage;
    }
    function buildSubpageGrid(this: any, sp?: any) {
        var result: any = EspDesktopModel.buildSubpageGrid(sp, layout.numSlots, layout.gridCols);
        sp.grid = result.grid;
        sp.sizes = result.sizes;
        return sp.grid;
    }
    function buildSubpageGridAndNormalizeOrder(this: any, sp?: any) {
        var previousOrder: any = JSON.stringify((sp && sp.order) || []);
        buildSubpageGrid(sp);
        sp.order = serializeSubpageGrid(sp);
        return JSON.stringify(sp.order) !== previousOrder;
    }
    function serializeSubpageGrid(this: any, sp?: any) {
        return EspDesktopModel.serializeSubpageGrid(sp.grid, sp.sizes || {}, sp.backLabel || "Back");
    }
    function enterSubpage(this: any, homeSlot?: any) {
        state.editingSubpage = homeSlot;
        state.subpageSelectedSlots = [];
        state.subpageLastClicked = -1;
        var sp: any = getSubpage(homeSlot);
        buildSubpageGrid(sp);
        renderPreview();
        renderButtonSettings();
    }
    function exitSubpage(this: any) {
        state.editingSubpage = null;
        state.subpageSelectedSlots = [];
        state.subpageLastClicked = -1;
        renderPreview();
        renderButtonSettings();
    }
    function saveSubpageConfig(this: any, homeSlot?: any) {
        var sp: any = getSubpage(homeSlot);
        sp.order = serializeSubpageGrid(sp);
        return saveSubpageEntity(homeSlot);
    }
    function subpageFirstFreeSlot(this: any, sp?: any) {
        var used: any = {};
        sp.grid.forEach(function (this: any, s?: any) {
            if (s > 0)
                used[s] = true;
        });
        for (var i: any = 1; i <= sp.buttons.length + 1; i++) {
            if (!used[i])
                return i;
        }
        return sp.buttons.length + 1;
    }
    function bindTextPost(this: any, input?: any, postName?: any, opts?: any) {
        input.addEventListener("blur", function (this: any) {
            if (opts && opts.onBlur)
                opts.onBlur(this.value);
            if (opts && opts.post)
                opts.post(this.value);
            else
                requests().postText(postName, this.value);
            if (opts && opts.rerender)
                renderPreview();
        });
        input.addEventListener("keydown", function (this: any, e?: any) {
            if (e.key === "Enter")
                this.blur();
        });
    }
    const feature = {
        normalizeWithRegisteredCardType,
        normalizeButtonConfig,
        cardRequiresSquareSize,
        cardIsWifiSharing,
        cardSupportsWifiPortraitSizes,
        cardSupportsExtraLargeSize,
        cardSupportsMaxSize,
        cardSupportsPortraitLargeSize,
        cardSupportsLandscapeLargeSize,
        cardSupportsUltraWideSize,
        normalizeCardSizeForConfig,
        isBrightnessSliderType,
        isFanCardType,
        isClimateCardType,
        isOptionSelectType,
        fanCardDefaultIcon,
        buttonConfigChangedByNormalize,
        trimConfigFields,
        buttonConfigFields,
        encodeConfigField,
        decodeConfigField,
        legacyButtonConfigSafe,
        serializeButtonConfig,
        parseRawButtonConfig,
        parseButtonConfig,
        hasLegacySliderDirection,
        buttonConfigHasLegacySliderDirection,
        buttonConfigNeedsMigration,
        parseBackOrderToken,
        backOrderToken,
        backLabelFromOrder,
        parseSubpageOrder,
        subpageOrderForSerialize,
        subpageSerializedOrder,
        parseSubpageConfig,
        subpageTypeCode,
        subpageTypeFromCode,
        encodeSubpageField,
        decodeSubpageField,
        parseCompactSubpageConfig,
        subpageConfigHasLegacySliderDirection,
        subpageConfigNeedsMigration,
        serializeSubpageConfig,
        subpageLegacyButtonFields,
        subpageCompactButtonFields,
        legacySubpageConfigSafe,
        serializeLegacySubpageConfig,
        serializeCompactSubpageConfig,
        applySubpageRaw,
        getSubpage,
        buildSubpageGrid,
        buildSubpageGridAndNormalizeOrder,
        serializeSubpageGrid,
        enterSubpage,
        exitSubpage,
        saveSubpageConfig,
        subpageFirstFreeSlot,
        bindTextPost,
        connectRequestApi,
    };
    return feature;
}

export type ConfigCodecFeature = ReturnType<typeof createConfigCodecFeature>;
