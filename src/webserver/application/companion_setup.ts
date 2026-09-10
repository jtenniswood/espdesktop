import type { ControlsShellFeature } from "./controls_shell";
import type { CompanionPairingState, SettingsCompanionSectionFeature } from "./settings_companion_section";

export function createCompanionSetupFeature(
    shell: Pick<ControlsShellFeature, "setOnboardingComplete">,
    section: SettingsCompanionSectionFeature,
    supported: boolean,
) {
    let paired = false;
    let receivedStatus = false;
    const listeners: Array<() => void> = [];
    function applyStatus(value: CompanionPairingState): void {
        const announce = receivedStatus && !paired && value.paired;
        const changed = !receivedStatus || paired !== value.paired;
        paired = value.paired;
        receivedStatus = true;
        if (changed) shell.setOnboardingComplete(paired, announce);
        listeners.forEach(listener => listener());
    }
    function buildSettingsCard(): HTMLElement | null {
        return supported ? section.buildCompanionSettingsCard(applyStatus, false) : null;
    }
    return {
        buildSettingsCard,
        companionConfigured: () => paired,
        onStatusChange: (callback: () => void) => { listeners.push(callback); },
    };
}
export type CompanionSetupFeature = ReturnType<typeof createCompanionSetupFeature>;
