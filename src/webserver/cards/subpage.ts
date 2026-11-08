import { companionMetricForEntity } from "../model/companion_card_codec";
import { renderCompanionStorageSelector } from "./companion_storage";
import { state } from "../state/app_instance";
import { setConfigOptionValue } from "../model/config_primitives";
import { escHtml, iconSlug } from "../application/ui_primitives";
import {
    COMPANION_STATS_OPTIONS,
    COMPANION_SYSTEM_METRICS,
    companionMetricPreviewValue,
    companionMetricIcon,
    companionMetricLabel,
} from "./companion";
import type { CardRegistry, CardUiServices } from "../application/card_registry";
import type { ConfigCodecFeature } from "../application/config_codec";
import type { CoreFeature } from "../application/core";
import type { ButtonSettingsSelectionFeature } from "../application/button_settings_selection";
import type { ControlsFieldsFeature } from "../application/controls_fields";
import { SUBPAGE_CONNECTOR_OPTION, SUBPAGE_KIND_OPTION } from "../application/config_option_core";
import {
    applySubpagePresetConfig,
    normalizeSubpageKind,
    normalizeSubpageOptions,
    subpageKind,
    subpagePresetDefaults,
} from "../application/config_subpage_options";

function companionStatMetric(entity: any): any {
    return companionMetricForEntity(entity);
}

function companionStatMode(entity: any): string {
    var metric: any = companionStatMetric(entity);
    return metric && metric.freeId === entity?.split(":")[0] ? "free" : "used";
}

function companionStatEntity(metric: any, mode: string): string {
    return mode === "free" && metric.freeId ? metric.freeId : metric.id;
}

export function registerSubpageCardTypes(
    registry: CardRegistry,
    codec: ConfigCodecFeature,
    core: Pick<CoreFeature, "subpageStateDisplayMode">,
    selection: Pick<ButtonSettingsSelectionFeature, "closeSettings">,
    fields: ControlsFieldsFeature,
    cardUi: CardUiServices,
): void {
    const { renderButtonSettings } = cardUi;
    const { fieldLabel } = fields;
    const { enterSubpage } = codec;
    // Navigation folder: tap opens a nested grid screen with its own button layout
    var SUBPAGE_CARD_METADATA: any = {
        kind: {
            label: "Type",
            idSuffix: "subpage-kind",
            options: [["", "Subpage"], ["companion_stat", "Companion Stat"]],
        },
        labelField: {
            label: "Label",
            placeholder: "e.g. Folder Name",
        },
        icon: {
            field: "icon",
            fallback: "Folder Outline",
            label: "Icon",
        },
        preview: {
            badge: "chevron-right",
        },
    };
    var subpageDefinition: any = {
        label: "Subpage",
        allowInSubpage: false,
        hideLabel: true,
        labelPlaceholder: "e.g. Folder Name",
        cardMetadata: SUBPAGE_CARD_METADATA,
        onSelect: function (this: any, b?: any) {
            b.entity = "";
            b.sensor = "";
            b.unit = "";
            b.icon = "Folder Outline";
            b.icon_on = "Auto";
            b.options = "";
        },
        renderSettings: function (this: any, panel?: any, b?: any, slot?: any, helpers?: any) {
            var savedKind: any = subpageKind(b);
            var kind: any = savedKind === "companion_stat" ? savedKind : "";
            helpers.renderCardModeSelector(panel, b, helpers, {
                mode: Object.assign({}, SUBPAGE_CARD_METADATA.kind, {
                    value: function (this: any) { return kind; },
                    onChange: function (this: any, button?: any, cardHelpers?: any) {
                        var nextKind: any = normalizeSubpageKind(this.value);
                        button.options = setConfigOptionValue(button.options, SUBPAGE_KIND_OPTION, nextKind);
                        button.options = setConfigOptionValue(button.options, SUBPAGE_CONNECTOR_OPTION, nextKind === "companion_stat" ? "mac_companion" : "");
                        if (nextKind === "companion_stat") {
                            var metric: any = COMPANION_SYSTEM_METRICS[0];
                            button.entity = metric ? metric.id : "";
                            button.label = metric ? metric.label : "Processor";
                            button.icon = "Gauge";
                            button.icon_on = "Auto";
                            button.sensor = "indicator";
                            button.unit = metric ? metric.unit : "%";
                            button.precision = "";
                        }
                        else {
                            applySubpagePresetConfig(button, true);
                        }
                        button.options = normalizeSubpageOptions(button.options, button.sensor, button.precision);
                        cardHelpers.saveField("options", button.options);
                        cardHelpers.saveField("label", button.label || "");
                        cardHelpers.saveField("icon", button.icon || "Auto");
                        cardHelpers.saveField("icon_on", button.icon_on || "Auto");
                        cardHelpers.saveField("sensor", button.sensor || "");
                        cardHelpers.saveField("unit", button.unit || "");
                        cardHelpers.saveField("precision", button.precision || "");
                        renderButtonSettings();
                    },
                }),
            });
            if (kind === "companion_stat") {
                var initialMetric: any = companionStatMetric(b.entity) || COMPANION_SYSTEM_METRICS[0];
                if (initialMetric && !companionStatMetric(b.entity)) {
                    b.entity = initialMetric.id;
                    b.sensor = "indicator";
                    b.unit = initialMetric.unit;
                }
                helpers.renderCardTextField(panel, b, helpers, SUBPAGE_CARD_METADATA.labelField);
                helpers.renderCardIconPicker(panel, b, helpers, SUBPAGE_CARD_METADATA.icon);

                var statField: any = document.createElement("div");
                statField.className = "sp-field";
                statField.appendChild(fieldLabel("Statistic", helpers.idPrefix + "companion-stat"));
                var statSelect: any = document.createElement("select");
                statSelect.className = "sp-select";
                statSelect.id = helpers.idPrefix + "companion-stat";
                var statOptions: any = COMPANION_STATS_OPTIONS.filter(([mode]) => mode !== "ip_address");
                statOptions.forEach(function (item: any) {
                    var option: any = document.createElement("option");
                    option.value = item[0];
                    option.textContent = item[1];
                    option.selected = item[0] === initialMetric.mode;
                    statSelect.appendChild(option);
                });
                statField.appendChild(statSelect);
                panel.appendChild(statField);

                if (initialMetric.mode === "storage") renderCompanionStorageSelector(panel, b, helpers);
                var displaySelect: any = null;
                if (initialMetric.freeId) {
                    var displayField: any = document.createElement("div");
                    displayField.className = "sp-field";
                    displayField.appendChild(fieldLabel("Show", helpers.idPrefix + "companion-stat-display"));
                    displaySelect = document.createElement("select");
                    displaySelect.className = "sp-select";
                    displaySelect.id = helpers.idPrefix + "companion-stat-display";
                    [["used", "Used"], ["free", "Free"]].forEach(function (item: any) {
                        var option: any = document.createElement("option");
                        option.value = item[0];
                        option.textContent = item[1];
                        displaySelect.appendChild(option);
                    });
                    displaySelect.value = companionStatMode(b.entity);
                    displayField.appendChild(displaySelect);
                    panel.appendChild(displayField);
                }

                function saveCompanionStat(metric: any, mode: string): void {
                    if (!metric) return;
                    var previousMetric: any = companionStatMetric(b.entity);
                    var currentLabel: string = String(b.label || "");
                    if (!currentLabel || (previousMetric && currentLabel === previousMetric.label)) {
                        b.label = metric.label;
                        helpers.saveField("label", b.label);
                    }
                    const device = metric.mode === "storage" && previousMetric?.mode === "storage" ? b.entity.split(":")[1] : "";
                    b.entity = companionStatEntity(metric, mode) + (device ? ":" + device : "");
                    b.sensor = "indicator";
                    b.unit = metric.unit;
                    b.precision = "";
                    b.icon_on = "Auto";
                    helpers.saveField("entity", b.entity);
                    helpers.saveField("sensor", b.sensor);
                    helpers.saveField("unit", b.unit);
                    helpers.saveField("precision", b.precision);
                    helpers.saveField("icon_on", b.icon_on);
                    renderButtonSettings();
                }
                statSelect.addEventListener("change", function (this: any) {
                    var selectedMode: string = this.value;
                    var metric: any = COMPANION_SYSTEM_METRICS.find(function (candidate) {
                        return candidate.mode === selectedMode;
                    });
                    saveCompanionStat(metric, displaySelect ? displaySelect.value : "used");
                });
                if (displaySelect) {
                    displaySelect.addEventListener("change", function (this: any) {
                        saveCompanionStat(companionStatMetric(b.entity) || initialMetric, this.value);
                    });
                }
                appendEditSubpageButton(panel, slot);
                return;
            }
            if (savedKind || b.entity || b.sensor) {
                const notice = document.createElement("p");
                notice.className = "sp-setting-note";
                notice.textContent = "Home Assistant state and status indicators are retired. This folder still opens its cards. Its saved settings have been kept.";
                panel.appendChild(notice);
            }
            helpers.renderCardTextField(panel, b, helpers, SUBPAGE_CARD_METADATA.labelField);
            helpers.renderCardIconPicker(panel, b, helpers, SUBPAGE_CARD_METADATA.icon);
            appendEditSubpageButton(panel, slot);
        },
        renderPreview: function (this: any, b?: any, helpers?: any) {
            var defaults: any = subpagePresetDefaults(subpageKind(b));
            var companionMetric: any = subpageKind(b) === "companion_stat" ? companionStatMetric(b.entity) : null;
            if (companionMetric) {
                return {
                    iconHtml: '<span class="sp-btn-icon mdi mdi-' + companionMetricIcon(b.entity) + '"></span>',
                    labelHtml: subpageBadgeLabelHtml(helpers, companionMetricLabel(
                        b.entity, companionMetricPreviewValue(b.precision), b.unit || companionMetric.unit)),
                };
            }
            var label: any = b.label || (defaults && defaults.label) || b.entity || "Configure";
            return {
                iconHtml: '<span class="sp-btn-icon mdi mdi-' + (b.icon && b.icon !== "Auto" ? iconSlug(b.icon) : "folder-outline") + '"></span>',
                labelHtml: subpageBadgeLabelHtml(helpers, label),
            };
        },
        contextMenuItems: function (this: any, slot?: any, b?: any, helpers?: any) {
            helpers.addCtxItem("cog", "Edit Subpage", function (this: any) { enterSubpage(slot); });
        },
    };
    const registeredSubpageDefinition = registry.register("subpage", subpageDefinition);
    registry.register("companion_subpage", {
        ...registeredSubpageDefinition,
        label: "Subpage",
        onSelect: function (this: any, b?: any) {
            b.options = setConfigOptionValue(b.options, SUBPAGE_CONNECTOR_OPTION, "mac_companion");
        },
    });
    function subpageBadgeLabelHtml(this: any, helpers?: any, label?: any) {
        return '<span class="sp-btn-label-row"><span class="sp-btn-label">' +
            helpers.escHtml(label) +
            '</span><span class="sp-subpage-badge mdi mdi-' +
            SUBPAGE_CARD_METADATA.preview.badge +
            '"></span></span>';
    }
    function appendEditSubpageButton(this: any, panel?: any, slot?: any) {
        var configBtn: any = document.createElement("button");
        configBtn.className = "sp-action-btn sp-edit-subpage-btn";
        configBtn.textContent = "Edit Subpage";
        configBtn.addEventListener("click", function (this: any) { selection.closeSettings(); enterSubpage(slot); });
        panel.appendChild(configBtn);
    }
}
