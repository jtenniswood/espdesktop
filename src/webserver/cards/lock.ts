import { renderRetiredCardSettings } from "../application/card_registry";
import {
    cardContractAllowInSubpage,
    cardContractCard,
    cardContractCardLabel,
    cardContractDefaultConfig,
    cardContractDomains,
    cardContractHidden,
    cardContractPickerKey,
} from "../generated/card_contract";
import type { CardRegistry, CardUiServices } from "../application/card_registry";
import type { ConfigLockOptionsFeature } from "../application/config_lock_options";
import type { ControlsFieldsFeature } from "../application/controls_fields";

export function registerLockCardTypes(
    registry: CardRegistry,
    lockOptions: ConfigLockOptionsFeature,
    fields: ControlsFieldsFeature,
    cardUi: CardUiServices,
): void {
    const { renderButtonSettings } = cardUi;
    const { cardBadgePreview } = fields;
    const {
        lockCommandMode,
        lockModeDefaultIcon,
        lockModeDefaultLabel,
        lockUsesDefaultIcon,
        normalizeLockMode,
    } = lockOptions;
    // Lock card: lock/unlock toggle with safe default-to-lock behavior and state display.
    const LOCK_CARD_METADATA: any = {
        mode: {
            label: "Type",
            idSuffix: "lock-type",
            options: [
                ["", "Toggle"],
                ["lock", "Lock"],
                ["unlock", "Unlock"],
            ],
            value: function (this: any, b?: any) {
                return normalizeLockMode(b.sensor);
            },
        },
        entity: {
            label: "Entity",
            idSuffix: "entity",
            placeholder: "e.g. lock.front_door",
            domains: function (this: any) { return cardContractDomains("lock"); },
            bindName: "entity",
            rerender: true,
            requiredMessage: "Add an entity before saving.",
        },
        labelField: {
            label: "Label",
            idSuffix: "label",
            field: "label",
            rerender: true,
        },
        preview: {
            badge: "lock",
        },
    };
    registry.register("lock", {
        label: function (this: any) { return cardContractCardLabel("lock"); },
        allowInSubpage: function (this: any) { return cardContractAllowInSubpage("lock"); },
        pickerKey: function (this: any) { return cardContractPickerKey("lock"); },
        hidden: function (this: any) { return cardContractHidden("lock"); },
        hideLabel: true,
        defaultConfig: function (this: any) { return cardContractDefaultConfig("lock"); },
        cardMetadata: LOCK_CARD_METADATA,
        onSelect: null,
        renderSettings: renderRetiredCardSettings,
        renderPreview: function (this: any, b?: any, helpers?: any) {
            var mode: any = normalizeLockMode(b.sensor);
            var label: any = b.label || (lockCommandMode(mode) ? lockModeDefaultLabel(mode) : b.entity || "Lock");
            return cardBadgePreview(b, helpers, {
                label: label,
                iconFallback: lockModeDefaultIcon(mode),
                badge: LOCK_CARD_METADATA.preview.badge,
            });
        },
    });
}
