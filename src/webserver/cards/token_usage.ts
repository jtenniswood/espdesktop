import type { CardRegistry, CardUiServices } from "../application/card_registry";
import type { ControlsFieldsFeature } from "../application/controls_fields";
import { cardContractDefaultConfig } from "../generated/card_contract";
import { configOptionValue, setConfigOptionValue } from "../model/config_primitives";

const SERVICES = [
  ["codex", "ChatGPT (Codex)"],
  ["claude", "Claude"],
  ["opencode-go", "OpenCode Go"],
  ["claude-enterprise", "Claude Enterprise"],
] as const;

function selectedServices(options: string): typeof SERVICES[number][0] {
  const value = configOptionValue(options, "services");
  return SERVICES.find(([id]) => id === value)?.[0] ?? "codex";
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
      const field = fields.selectField("Service", helpers.idPrefix + "token-usage-services",
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
      const enterprise = selected === "claude-enterprise";
      const glyph = selected === "codex" ? "\uE900" : selected === "opencode-go" ? "\uE902" : "\uE901";
      const icon = '<span class="sp-btn-icon sp-token-usage-icon" role="img" aria-label="' +
        (selected === "codex" ? "Codex" : SERVICES.find(([id]) => id === selected)![1]) +
        '">' + glyph + '</span>';
      const value = (left: string) =>
        '<span class="sp-btn-label sp-token-usage-value">' + helpers.escHtml(left) + '</span>';
      const reset = (text: string) =>
        '<span class="sp-token-usage-reset">' + helpers.escHtml(text) + '</span>';
      return {
        iconHtml: icon,
        labelHtml: '<span class="sp-btn-label-row sp-token-usage-single">' + value(enterprise ? "$12.34" : "41% left") + reset(enterprise ? "Last 7 days" : "Resets 2d 9h") + '</span>',
        labelEditable: false,
      };
    },
  });
}
