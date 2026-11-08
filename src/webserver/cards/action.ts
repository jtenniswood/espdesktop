import { preserveCardColorOptions } from "../model/config_primitives";
import { iconSlug } from "../application/ui_primitives";
import type { CardRegistry } from "../application/card_registry";
import type { ControlsFieldsFeature } from "../application/controls_fields";

export function registerActionCardTypes(
    registry: CardRegistry,
    fields: Pick<ControlsFieldsFeature, "cardBadgeLabelHtml">,
): void {
    registry.register("action", {
        label: "Local Action",
        allowInSubpage: true,
        labelPlaceholder: "e.g. Mute microphone",
        cardMetadata: { entity: { label: "Local Action", idSuffix: "action-sel", requiredMessage: "Choose a local action before saving." } },
        onSelect(button: any) {
            Object.assign(button, { entity: "", sensor: "local", unit: "", icon: "Gesture Tap",
                icon_on: "Auto", precision: "", options: preserveCardColorOptions(button.options, "") });
        },
        renderSettings(panel: any, button: any, slot: any, helpers: any) {
            if (button.sensor !== "local") {
                const warning = document.createElement("div");
                warning.className = "sp-banner sp-error";
                warning.textContent = "This saved action needs Home Assistant. Its configuration has been kept. Replace the card to choose a local action.";
                panel.appendChild(warning);
                return;
            }
            renderActionCardLocalSettings(panel, button, slot, helpers);
        },
        renderPreview(button: any, helpers: any) {
            const icon = button.icon && button.icon !== "Auto" ? iconSlug(button.icon) : "gesture-tap";
            return {
                iconHtml: '<span class="sp-btn-icon mdi mdi-' + icon + '"></span>',
                labelHtml: fields.cardBadgeLabelHtml(helpers, button.label || button.entity || "Local Action", "chip"),
            };
        },
    });
    function renderActionCardLocalSettings(this: any, panel?: any, b?: any, slot?: any, helpers?: any) {
        var pickerSection: any = document.createElement("div");
        pickerSection.className = "sp-field";
        panel.appendChild(pickerSection);
        helpers.markCardPrimaryField(pickerSection, "entity");
        helpers.renderCardIconPicker(panel, b, helpers, {
            pickerIdSuffix: "icon-picker",
            idSuffix: "icon",
            field: "icon",
            fallback: "Gesture Tap",
        });
        function buildDropdown(this: any, actions?: any) {
            pickerSection.innerHTML = "";
            pickerSection.className = "sp-field";
            pickerSection.appendChild(helpers.fieldLabel("Local Action", helpers.idPrefix + "action-sel"));
            var sel: any = document.createElement("select");
            sel.className = "sp-select";
            sel.id = helpers.idPrefix + "action-sel";
            var placeholder: any = document.createElement("option");
            placeholder.value = "";
            placeholder.textContent = "Choose an action…";
            sel.appendChild(placeholder);
            actions.forEach(function (this: any, a?: any) {
                var opt: any = document.createElement("option");
                opt.value = a.key;
                opt.textContent = a.label ? a.label + " (" + a.key + ")" : a.key;
                if (a.key === b.entity)
                    opt.selected = true;
                sel.appendChild(opt);
            });
            if (b.entity && !actions.some(function (this: any, a?: any) { return a.key === b.entity; })) {
                var curOpt: any = document.createElement("option");
                curOpt.value = b.entity;
                curOpt.textContent = b.entity + " (current)";
                curOpt.selected = true;
                sel.appendChild(curOpt);
            }
            sel.addEventListener("change", function (this: any) {
                var key: any = this.value;
                if (!key)
                    return;
                b.entity = key;
                helpers.saveField("entity", key);
                var action: any = actions.find(function (this: any, a?: any) { return a.key === key; });
                if (action && action.label && !b.label) {
                    b.label = action.label;
                    helpers.saveField("label", action.label);
                    var labelInp: any = document.getElementById(helpers.idPrefix + "label");
                    if (labelInp)
                        labelInp.value = action.label;
                }
            });
            pickerSection.appendChild(sel);
        }
        function buildEmpty(this: any) {
            pickerSection.innerHTML = "";
            pickerSection.className = "";
            var banner: any = document.createElement("div");
            banner.className = "sp-banner sp-error";
            banner.textContent =
                "No local actions are available on this device.";
            pickerSection.appendChild(banner);
        }
        function buildFallback(this: any) {
            pickerSection.innerHTML = "";
            pickerSection.className = "sp-local-picker-fallback";
            var banner: any = document.createElement("div");
            banner.className = "sp-banner sp-error";
            banner.textContent = "Could not reach device. Enter the action key manually.";
            pickerSection.appendChild(banner);
            var kf: any = document.createElement("div");
            kf.className = "sp-field";
            kf.appendChild(helpers.fieldLabel("Action Key", helpers.idPrefix + "local-key"));
            var keyInp: any = helpers.textInput(helpers.idPrefix + "local-key", b.entity, "e.g. zoom_mute");
            kf.appendChild(keyInp);
            pickerSection.appendChild(kf);
            helpers.bindField(keyInp, "entity", true);
            helpers.requireField(keyInp, "Add an action key before saving.");
        }
        pickerSection.textContent = "Loading actions…";
        fetch("/local_actions", { credentials: "include" })
            .then(function (this: any, resp?: any) {
            if (!resp.ok)
                throw new Error("HTTP " + resp.status);
            return resp.json();
        })
            .then(function (this: any, data?: any) {
            if (!data.length) {
                buildEmpty();
            }
            else {
                buildDropdown(data);
            }
        })
            .catch(function (this: any) {
            buildFallback();
        });
    }
}
