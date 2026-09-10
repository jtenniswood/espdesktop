import { createCompanionSetupFeature } from "../../src/webserver/application/companion_setup";
import type { CompanionPairingState } from "../../src/webserver/application/settings_companion_section";

export function runCompanionSetupTests(): void {
  let status!: (value: CompanionPairingState) => void;
  let collapsed: boolean | undefined;
  const transitions: Array<[boolean, boolean | undefined]> = [];
  const card = {} as HTMLElement;
  const setup = createCompanionSetupFeature({
    setOnboardingComplete: (complete, announce) => { transitions.push([complete, announce]); },
  }, {
    buildCompanionSettingsCard: (callback, initialCollapsed) => {
      status = callback!;
      collapsed = initialCollapsed;
      return card;
    },
  }, true);
  if (setup.buildSettingsCard() !== card || collapsed !== false) throw new Error("Settings must show the expanded Companion card");
  const value: CompanionPairingState = { available: true, active: false, paired: false, connected: false, pairing_code: "", expires_in_seconds: 0 };
  status(value);
  status({ ...value, paired: true });
  status({ ...value, paired: true, connected: true });
  if (!setup.companionConfigured() || transitions.length !== 2 || !transitions[1]?.[1]) throw new Error("Pairing must complete setup once, including while the Mac is offline");
  status(value);
  if (setup.companionConfigured() || transitions[2]?.[0]) throw new Error("Removing pairing must return setup to the unpaired state");
}
