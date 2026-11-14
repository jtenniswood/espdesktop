import type { CardRegistry, CardUiServices } from "../application/card_registry";
import type { ControlsFieldsFeature } from "../application/controls_fields";
import { cardContractDefaultConfig } from "../generated/card_contract";
import { configOptionValue, setConfigOptionValue } from "../model/config_primitives";
import { TOKEN_USAGE_ICONS } from "./token_usage_icons";

const SERVICES = [
  ["codex", "ChatGPT (Codex)"],
  ["claude", "Claude"],
  ["both", "ChatGPT (Codex) and Claude"],
] as const;

function selectedServices(options: string): typeof SERVICES[number][0] {
  const value = configOptionValue(options, "services");
  return value === "claude" || value === "both" ? value : "codex";
}

export function normalizeTokenUsageOptions(options: string): string {
  const services = selectedServices(options);
  return services === "codex" ? "" : "services=" + services;
}

export function registerTokenUsageCard(
  registry: CardRegistry, supported: boolean,
  fields: ControlsFieldsFeature, cardUi: CardUiServices,
): void {
  const defaults = cardContractDefaultConfig("token_usage");
  registry.register("token_usage", {
    label: "Token Usage",
    hideLabel: true,
    cardMetadata: { icon: { fallback: "Gauge" } },
    allowInSubpage: true,
    isAvailable: () => supported,
    defaultConfig: () => ({ ...defaults }),
    onSelect: (card) => Object.assign(card, defaults),
    normalizeConfig: (card) => {
      Object.assign(card, defaults, { options: normalizeTokenUsageOptions(card.options) });
    },
    renderSettings: (panel, card, _slot, helpers) => {
      const field = fields.selectField("Services", helpers.idPrefix + "token-usage-services",
        SERVICES, selectedServices(card.options), () => {
          const value = field.select.value;
          card.options = setConfigOptionValue(card.options, "services", value === "codex" ? "" : value);
          helpers.saveField("options", card.options);
          cardUi.renderPreview();
        });
      fields.markCardPrimaryField(field.field, "type");
      panel.append(field.field);
    },
    renderPreview: (card, helpers) => {
      const selected = selectedServices(card.options);
      const icon = (id: keyof typeof TOKEN_USAGE_ICONS) =>
        '<img class="sp-token-usage-icon" alt="' + (id === "codex" ? "Codex" : "Claude") +
        '" src="' + TOKEN_USAGE_ICONS[id] + '">';
      const reading = (left: string, reset: string) =>
        '<span class="sp-btn-label sp-token-usage-value">' + helpers.escHtml(left) +
        '</span><span class="sp-token-usage-reset">' + helpers.escHtml(reset) + '</span>';
      if (selected === "both") {
        return {
          iconHtml: '',
          labelHtml: '<span class="sp-token-usage-services"><span class="sp-token-usage-row">' +
            icon("codex") + '<span>' + reading("41% left", "Resets in 2d") +
            '</span></span><span class="sp-token-usage-row">' + icon("claude") +
            '<span>' + reading("72% left", "Resets in 4d") + '</span></span></span>',
          labelEditable: false,
        };
      }
      return {
        iconHtml: icon(selected),
        labelHtml: '<span class="sp-btn-label-row sp-token-usage-single">' + reading("41% left", "Resets in 2d") + '</span>',
        labelEditable: false,
      };
    },
  });
}
