import {
  connectorOnboardingComplete,
  homeAssistantPickerAvailable,
  homeAssistantConnectorStatusText,
  requestedConnectorFromSearch,
  createConnectorsPageFeature,
  type ConnectorsStatus,
} from "../../src/webserver/application/connectors_page";

function status(overrides: Partial<ConnectorsStatus> = {}): ConnectorsStatus {
  return {
    onboarding_complete: false,
    home_assistant: {
      available: true,
      configured: false,
      connected: false,
      actions_confirmed: false,
    },
    mac_companion: {
      available: true,
      configured: false,
      paired: false,
      connected: false,
    },
    ...overrides,
  };
}

export async function runConnectorsFeatureTests(): Promise<void> {
  if (requestedConnectorFromSearch("?tab=connectors") !== "mac_companion") {
    throw new Error("The legacy connectors pairing URL must open Mac Companion");
  }
  if (requestedConnectorFromSearch("?tab=connectors&connector=mac_companion") !== "mac_companion") {
    throw new Error("The explicit Mac Companion URL must open Mac Companion");
  }
  if (requestedConnectorFromSearch("?tab=settings") !== null) {
    throw new Error("Unrelated deep links must not select a connector");
  }
  if (connectorOnboardingComplete(status())) {
    throw new Error("An unconfigured display must remain in onboarding");
  }
  if (!connectorOnboardingComplete(status({
    home_assistant: {
      available: true,
      configured: true,
      connected: false,
      actions_confirmed: true,
    },
  }))) {
    throw new Error("A configured Home Assistant connector must complete onboarding while offline");
  }
  if (!connectorOnboardingComplete(status({
    mac_companion: {
      available: true,
      configured: true,
      paired: true,
      connected: false,
    },
  }))) {
    throw new Error("A trusted Mac pairing must complete onboarding while offline");
  }
  const permissionStatus = homeAssistantConnectorStatusText({
    available: true,
    configured: false,
    connected: true,
    actions_confirmed: false,
  });
  if (permissionStatus !== "Home Assistant connected") {
    throw new Error("Connected Home Assistant setup must not show a confirmation action");
  }
  const disconnectedHomeAssistant = homeAssistantConnectorStatusText({
    available: true,
    configured: true,
    connected: false,
    actions_confirmed: true,
  });
  if (disconnectedHomeAssistant !== "Configured but disconnected") {
    throw new Error("Configured Home Assistant should use the concise disconnected status");
  }
  const offlineHomeAssistant = status({
    onboarding_complete: true,
    home_assistant: {
      available: true,
      configured: true,
      connected: false,
      actions_confirmed: true,
    },
  });
  if (!homeAssistantPickerAvailable(offlineHomeAssistant, false)) {
    throw new Error("Older firmware without connector status must retain Home Assistant cards");
  }
  if (homeAssistantPickerAvailable(offlineHomeAssistant, true)) {
    throw new Error("New firmware must hide Home Assistant cards while its connector is offline");
  }
  const connectedHomeAssistant = status({
    home_assistant: {
      available: true,
      configured: true,
      connected: true,
      actions_confirmed: true,
    },
  });
  if (!homeAssistantPickerAvailable(connectedHomeAssistant, true)) {
    throw new Error("New firmware must show Home Assistant cards while its connector is connected");
  }

  const statuses = [
    status(),
    status({ mac_companion: { available: true, configured: true, paired: true, connected: true } }),
    status({ mac_companion: { available: true, configured: true, paired: true, connected: true } }),
  ];
  let nextStatus = 0;
  const pollStatus: { callback?: () => void } = {};
  const feature = createConnectorsPageFeature(
    {
      document: {} as Document,
      window: {
        setInterval(callback: () => void) { pollStatus.callback = callback; return 1; },
        clearInterval() {},
      } as unknown as Window,
      fetch: (async () => ({
        ok: true,
        json: async () => statuses[Math.min(nextStatus++, statuses.length - 1)] as ConnectorsStatus,
      })) as unknown as typeof fetch,
    },
    { setOnboardingComplete() {} } as any,
    {} as any,
    {} as any,
    true,
  );
  const transitions: boolean[] = [];
  feature.onCompanionConnectionChange((connected) => transitions.push(connected));
  feature.start();
  await new Promise((resolve) => setTimeout(resolve, 0));
  if (!pollStatus.callback) throw new Error("Connector status polling must be scheduled");
  pollStatus.callback();
  await new Promise((resolve) => setTimeout(resolve, 0));
  pollStatus.callback();
  await new Promise((resolve) => setTimeout(resolve, 0));
  if (transitions.join(",") !== "false,true") {
    throw new Error(`Companion connection listeners must report only connection changes: ${transitions}`);
  }
}
