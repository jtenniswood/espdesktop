import {
  connectorOnboardingComplete,
  requestedConnectorFromSearch,
  createConnectorsPageFeature,
  type ConnectorsStatus,
} from "../../src/webserver/application/connectors_page";

function status(overrides: Partial<ConnectorsStatus> = {}): ConnectorsStatus {
  return {
    onboarding_complete: false,
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
  if (!connectorOnboardingComplete(status())) {
    throw new Error("An unconfigured display must remain usable without an external connector");
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
  const statuses = [
    status(),
    status({ mac_companion: { available: true, configured: true, paired: true, connected: true } }),
    status({ mac_companion: { available: true, configured: true, paired: true, connected: true } }),
  ];
  let nextStatus = 0;
  const pollStatus: { callback?: () => void } = {};
  type Node = { id: string; className: string; textContent: string; children: Node[]; appendChild(child: Node): void };
  function element(): Node {
    return { id: "", className: "", textContent: "", children: [], appendChild(child) { this.children.push(child); } };
  }
  let companionStartsCollapsed: boolean | undefined;
  const feature = createConnectorsPageFeature(
    {
      document: { createElement: element } as unknown as Document,
      window: {
        setInterval(callback: () => void) { pollStatus.callback = callback; return 1; },
        clearInterval() {},
        location: { search: "?tab=connectors" },
      } as unknown as Window,
      fetch: (async () => ({
        ok: true,
        json: async () => statuses[Math.min(nextStatus++, statuses.length - 1)] as ConnectorsStatus,
      })) as unknown as typeof fetch,
    },
    { setOnboardingComplete() {} } as any,
    { buildCompanionSettingsCard(_onStatus: unknown, collapsed: boolean) {
        companionStartsCollapsed = collapsed;
        const card = element(); card.id = "companion-card"; return card;
    } } as any,
    true,
  );
  if (feature.homeAssistantConfigured() || feature.homeAssistantConnected() ||
      feature.homeAssistantSettingsAvailable() || feature.homeAssistantCardPickerEnabled()) {
    throw new Error("Retired Home Assistant adapters must never enable runtime features");
  }
  const parent = element();
  feature.buildPage(parent as unknown as HTMLElement);
  const content = parent.children[0]?.children[0];
  if (content?.children.length !== 2 || content.children[1]?.id !== "companion-card" || companionStartsCollapsed !== false) {
    throw new Error("Connector setup must contain only its heading and the deep-linked Mac Companion card");
  }
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
