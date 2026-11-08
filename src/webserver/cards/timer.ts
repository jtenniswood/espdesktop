import { renderRetiredCardSettings } from "../application/card_registry";
import type { CardRegistry } from "../application/card_registry";
import { cardContractDefaultConfig, cardContractCardLabel, cardContractAllowInSubpage } from "../generated/card_contract";

// Timer card: counts down a Home Assistant timer.* entity.
// Tap while idle = start, tap while running = cancel (optionally confirmed),
// tap while paused = resume.
// Storage: sensor="confirm" (enables confirm step), unit="<seconds>" (timeout, default 3).

function timerParseConfirmTimeout(unit: string) {
  var n = parseInt(unit, 10);
  if (!isFinite(n) || n < 1) n = 3;
  if (n > 30) n = 30;
  return n;
}

export function registerTimerCardTypes(registry: CardRegistry): void {
registry.register("timer", {
  label: () => cardContractCardLabel("timer"),
  allowInSubpage: () => cardContractAllowInSubpage("timer"),
  hideLabel: true,
  cardMetadata: { preview: { badge: "timer-outline" } },
  defaultConfig: () => cardContractDefaultConfig("timer"),
  onSelect: null,
  renderSettings: renderRetiredCardSettings,
  renderPreview: function (b, helpers) {
    var label = b.label || b.entity || "Timer";
    return {
      iconHtml:
        '<span class="sp-sensor-preview">' +
          '<span class="sp-sensor-value">0:00</span>' +
        '</span>',
      labelHtml:
        '<span class="sp-btn-label-row"><span class="sp-btn-label">' + helpers.escHtml(label) + '</span>' +
        '<span class="sp-type-badge mdi mdi-timer-outline"></span></span>',
    };
  },
});

}
