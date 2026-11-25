import type { CardDefinition, CardUiServices } from "../application/card_registry";
import type { ControlsFieldsFeature } from "../application/controls_fields";
import { iconSlug } from "../application/ui_primitives";
import type { CompanionAction } from "../api/companion_catalogue";
import { cardContractDefaultConfig, cardContractPickerKey } from "../generated/card_contract";

const volumePrefix = "app.volume.";

export function targetedAudioCard(
    supported: boolean,
    loadApps: () => Promise<readonly CompanionAction[]>,
    cardUi: CardUiServices,
    fields: ControlsFieldsFeature,
    type: string,
    inputDevice = false,
    renderComputerField?: (panel: HTMLElement, card: any, helpers: any) => void,
): CardDefinition {
    const defaults = cardContractDefaultConfig(type);
    const prefix = inputDevice ? "input.level." : volumePrefix;
    const targetName = inputDevice ? "Input device" : "Application";
    const metadata = { icon: { fallback: defaults.icon } };
    return {
        label: defaults.label || (inputDevice ? "Input per device level" : "App Volume"),
        pickerKey: cardContractPickerKey(type),
        cardMetadata: metadata,
        allowInSubpage: true,
        isAvailable: () => supported,
        defaultConfig: () => defaults,
        onSelect: (card) => Object.assign(card, defaults),
        renderSettingsBeforeLabel: (panel, card, _slot, helpers) => {
            renderComputerField?.(panel, card, helpers);
            const savedEntity = card.entity;
            const apps = new Map<string, string>();
            const placeholder = ["", "Select"];
            const savedLabel = card.label || savedEntity.slice(prefix.length);
            const savedOption = savedEntity ? [[savedEntity, savedLabel]] : [];
            const { field, select } = helpers.selectField(
                targetName, helpers.idPrefix + "audio-target", [placeholder, ...savedOption], savedEntity,
                () => {
                    const label = apps.get(select.value);
                    if (!label) {
                        select.value = card.entity;
                        return;
                    }
                    const previousLabel = apps.get(card.entity);
                    if (!card.label || card.label === previousLabel) {
                        card.label = label;
                        helpers.saveField("label", label);
                    }
                    card.entity = select.value;
                    helpers.saveField("entity", card.entity);
                    cardUi.renderButtonSettings(true);
                },
            ) as { field: HTMLElement; select: HTMLSelectElement };
            panel.appendChild(field);
            helpers.markCardPrimaryField(field, "entity");
            helpers.requireField(select, inputDevice ? "Choose an input device before saving." : "Choose an enabled app before saving.");
            const note = panel.ownerDocument.createElement("p");
            note.className = "sp-setting-note";
            note.textContent = inputDevice ? "Loading input devices…" : "Loading enabled apps…";
            field.appendChild(note);
            select.disabled = true;
            void loadApps().then((actions) => {
                for (const app of actions) {
                    if (inputDevice ? /^input\.level\.[0-9a-f]{64}$/.test(app.id) : /^[A-Za-z0-9.-]{1,96}$/.test(app.id)) {
                        apps.set(inputDevice ? app.id : prefix + app.id, app.label);
                    }
                }
                const options = [...apps].map(([value, label]) => new Option(label, value));
                if (savedEntity && !apps.has(savedEntity)) {
                    options.unshift(new Option(savedLabel, savedEntity));
                }
                select.replaceChildren(new Option(placeholder[1], ""), ...options);
                select.value = savedEntity;
                select.disabled = apps.size === 0;
                note.hidden = apps.size > 0 && (!savedEntity || apps.has(savedEntity));
                note.textContent = inputDevice ? "Connect an input device with an adjustable level." : apps.size > 0
                    ? "Enable this app in EspDesktop to use its volume control."
                    : "Connect the companion app and enable apps in its Apps settings.";
            }).catch(() => {
                note.textContent = "Connect the companion app to load the available choices.";
            });
        },
        renderSettings: (panel, card, _slot, helpers) => {
            helpers.renderCardIconPicker(panel, card, helpers, metadata.icon);
        },
        renderPreview: (card, helpers) => ({
            iconHtml: '<span class="sp-btn-icon mdi mdi-' + iconSlug(card.icon && card.icon !== "Auto" ? card.icon : defaults.icon) +
                '"></span><span class="sp-slider-preview"><span class="sp-slider-track">' +
                '<span class="sp-slider-fill"></span></span></span>',
            labelHtml: fields.cardBadgeLabelHtml(helpers, card.label || (inputDevice ? targetName : "App Volume"), ""),
        }),
    };
}
