import type { CardRegistry, CardUiServices } from "../application/card_registry";
import type { ControlsFieldsFeature } from "../application/controls_fields";
import { iconSlug } from "../application/ui_primitives";
import type { CompanionAction } from "../api/companion_catalogue";
import { cardContractDefaultConfig } from "../generated/card_contract";

const volumePrefix = "app.volume.";

export function registerAppVolumeCard(
    registry: CardRegistry,
    supported: boolean,
    loadApps: () => Promise<readonly CompanionAction[]>,
    cardUi: CardUiServices,
    fields: ControlsFieldsFeature,
): void {
    const defaults = cardContractDefaultConfig("companion_app_volume");
    const metadata = { icon: { fallback: defaults.icon } };
    registry.register("companion_app_volume", {
        label: "App Volume",
        cardMetadata: metadata,
        allowInSubpage: true,
        isAvailable: () => supported,
        defaultConfig: () => defaults,
        onSelect: (card) => Object.assign(card, defaults),
        renderSettingsBeforeLabel: (panel, card, _slot, helpers) => {
            const savedEntity = card.entity;
            const apps = new Map<string, string>();
            const placeholder = ["", "Choose an app…"];
            const savedLabel = card.label || savedEntity.slice(volumePrefix.length);
            const savedOption = savedEntity ? [[savedEntity, savedLabel]] : [];
            const { field, select } = helpers.selectField(
                "Application", helpers.idPrefix + "volume-app", [placeholder, ...savedOption], savedEntity,
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
            helpers.markCardPrimaryField(field, "type");
            helpers.requireField(select, "Choose an enabled Mac app before saving.");
            const note = panel.ownerDocument.createElement("p");
            note.className = "sp-setting-note";
            note.textContent = "Loading enabled apps…";
            field.appendChild(note);
            select.disabled = true;
            void loadApps().then((actions) => {
                for (const app of actions) {
                    if (/^[A-Za-z0-9.-]{1,96}$/.test(app.id)) apps.set(volumePrefix + app.id, app.label);
                }
                const options = [...apps].map(([value, label]) => new Option(label, value));
                if (savedEntity && !apps.has(savedEntity)) {
                    options.unshift(new Option(savedLabel, savedEntity));
                }
                select.replaceChildren(new Option(placeholder[1], ""), ...options);
                select.value = savedEntity;
                select.disabled = apps.size === 0;
                note.hidden = apps.size > 0 && (!savedEntity || apps.has(savedEntity));
                note.textContent = apps.size > 0
                    ? "Enable this app in EspDesktop on the Mac to use its volume control."
                    : "Connect the Mac companion and enable apps in its Apps settings.";
            }).catch(() => {
                note.textContent = "Connect the Mac companion to load its enabled apps.";
            });
        },
        renderSettings: (panel, card, _slot, helpers) => {
            helpers.renderCardIconPicker(panel, card, helpers, metadata.icon);
        },
        renderPreview: (card, helpers) => ({
            iconHtml: '<span class="sp-btn-icon mdi mdi-' + iconSlug(card.icon && card.icon !== "Auto" ? card.icon : defaults.icon) +
                '"></span><span class="sp-slider-preview"><span class="sp-slider-track">' +
                '<span class="sp-slider-fill"></span></span></span>',
            labelHtml: fields.cardBadgeLabelHtml(helpers, card.label || "App Volume", ""),
        }),
    });
}
