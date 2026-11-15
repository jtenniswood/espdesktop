import type { CardRegistry, CardUiServices } from "../application/card_registry";
import type { ControlsFieldsFeature } from "../application/controls_fields";
import { cardContractDefaultConfig } from "../generated/card_contract";
import { configOptionValue, setConfigOptionValue } from "../model/config_primitives";

const SERVICES = [
  ["codex", "ChatGPT (Codex)"],
  ["claude", "Claude"],
  ["opencode-go", "OpenCode Go"],
  ["cursor", "Cursor"],
  ["antigravity", "Google Antigravity (Gemini)"],
  ["synthetic", "Synthetic"],
  ["openrouter", "OpenRouter"],
  ["deepseek", "DeepSeek"],
] as const;

function selectedServices(options: string): typeof SERVICES[number][0] | "claude-enterprise" {
  const value = configOptionValue(options, "services");
  if (value === "claude-enterprise") return value;
  return SERVICES.find(([id]) => id === value)?.[0] ?? "codex";
}

export function normalizeTokenUsageOptions(options: string): string {
  const services = selectedServices(options);
  if (services === "codex") return "";
  return "services=" + services + (services === "opencode-go" && openCodeLimit(options) === "monthly" ? ",limit=monthly" : "");
}

function openCodeLimit(options: string): "weekly" | "monthly" {
  return configOptionValue(options, "limit") === "monthly" ? "monthly" : "weekly";
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
          card.options = normalizeTokenUsageOptions(setConfigOptionValue(card.options, "services", value));
          limit.field.style.display = value === "opencode-go" ? "" : "none";
          limit.select.value = openCodeLimit(card.options);
          helpers.saveField("options", card.options);
          cardUi.renderPreview();
        });
      const limit = fields.selectField("Time period", helpers.idPrefix + "token-usage-limit",
        [["weekly", "Weekly"], ["monthly", "Monthly"]], openCodeLimit(card.options), () => {
          card.options = normalizeTokenUsageOptions(setConfigOptionValue(card.options, "limit", limit.select.value));
          helpers.saveField("options", card.options);
          cardUi.renderPreview();
        });
      limit.field.classList.add("sp-token-usage-limit");
      limit.field.style.display = selectedServices(card.options) === "opencode-go" ? "" : "none";
      const usageFields = panel.ownerDocument.createElement("div");
      usageFields.append(field.field, limit.field);
      fields.markCardPrimaryField(usageFields, "type");
      panel.append(usageFields);
    },
    renderPreview: (card, helpers) => {
      const selected = selectedServices(card.options);
      const unavailable = selected === "claude-enterprise";
      const glyphs: Partial<Record<typeof selected, string>> = {
        codex: "\uE900", claude: "\uE901", "opencode-go": "\uE902",
        "claude-enterprise": "\uE901", cursor: "\uE903", antigravity: "\uE904",
      };
      const name = unavailable ? "Claude" : selected === "codex" ? "Codex" : SERVICES.find(([id]) => id === selected)![1];
      const iconLabel = ' role="img" aria-label="' + helpers.escHtml(name) + '"></span>';
      const glyph = glyphs[selected];
      const icon = glyph
        ? '<span class="sp-btn-icon sp-token-usage-icon" role="img" aria-label="' + helpers.escHtml(name) + '">' + glyph + '</span>'
        : selected === "openrouter" ? '<span class="sp-btn-icon mdi mdi-router-network"' + iconLabel
        : selected === "deepseek" ? '<span class="sp-btn-icon mdi mdi-database-outline"' + iconLabel
        : '<span class="sp-btn-icon mdi mdi-gauge"' + iconLabel;
      let sampleValue = "41% left";
      let sampleDetail = selected === "opencode-go" && openCodeLimit(card.options) === "monthly" ? "Resets 19d 9h" : "Resets 2d 9h";
      if (selected === "openrouter") {
        sampleValue = "$12.40";
        sampleDetail = "Key budget left";
      } else if (selected === "deepseek") {
        sampleValue = "$8.50";
        sampleDetail = "Balance";
      } else if (selected === "synthetic") {
        sampleDetail = "Resets 2h";
      }
      const value = (left: string) =>
        '<span class="sp-btn-label sp-token-usage-value">' + helpers.escHtml(left) + '</span>';
      const reset = (text: string) =>
        '<span class="sp-token-usage-reset">' + helpers.escHtml(text) + '</span>';
      return {
        iconHtml: icon,
        labelHtml: '<span class="sp-btn-label-row sp-token-usage-single">' + value(unavailable ? "Unavailable" : sampleValue) + (unavailable ? "" : reset(sampleDetail)) + '</span>',
        labelEditable: false,
      };
    },
  });
}
