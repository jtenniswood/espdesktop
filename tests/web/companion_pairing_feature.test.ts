import {
  copyCompanionCode,
  companionPairingCodeVisible,
  companionPairingStatusText,
} from "../../src/webserver/application/settings_companion_section";

export function runCompanionPairingFeatureTests(): void {
  if (!companionPairingCodeVisible({
    available: true,
    active: true,
    paired: false,
    connected: false,
    pairing_code: "ABCD-EFGH",
  })) {
    throw new Error("An active unpaired device must show its pairing code");
  }
  if (!companionPairingCodeVisible({
    available: true,
    active: true,
    paired: true,
    connected: false,
    pairing_code: "ABCD-EFGH",
  })) {
    throw new Error("A paired device must show the code while another computer is being added");
  }
  if (companionPairingCodeVisible({
    available: true,
    active: false,
    paired: true,
    connected: true,
    pairing_code: "ABCD-EFGH",
  })) {
    throw new Error("A finished pairing window must not show a stale pairing code");
  }
  const openStatus = companionPairingStatusText({
    available: true,
    active: true,
    paired: false,
    connected: false,
    pairing_code: "",
  });
  if (openStatus !== "Ready to pair") {
    throw new Error("Companion setup should show that pairing is ready without a countdown");
  }

  const connectedStatus = companionPairingStatusText({
    available: true,
    active: false,
    paired: true,
    connected: true,
    pairing_code: "",
  });
  if (connectedStatus !== "Companion connected") {
    throw new Error("Connected Companion status must be clear on the settings page");
  }

  const multiStatus = companionPairingStatusText({
    available: true,
    active: false,
    paired: true,
    connected: true,
    pairing_code: "",
    computers: [
      { id: "0123456789abcdef", name: "Office PC", connected: true, primary: true },
      { id: "fedcba9876543210", name: "Studio Mac", connected: false, primary: false },
    ],
  });
  if (multiStatus !== "1 of 2 computers connected") {
    throw new Error("Multi-computer status must report how many computers are connected");
  }
}

export async function runCompanionCopyTests(): Promise<void> {
  let copied = "";
  await copyCompanionCode({} as Document, {
    clipboard: { writeText: async (code: string) => { copied = code; } },
  } as Navigator, "ABCD-EFGH");
  if (copied !== "ABCD-EFGH") throw new Error("Copy must preserve the exact code");

  for (const modernFails of [false, true]) {
    let selected = false;
    let removed = false;
    let focused = false;
    const field = { value: "", readOnly: false, style: { cssText: "" }, select() { selected = true; }, remove() { removed = true; } };
    const document = {
      activeElement: { focus() { focused = true; } },
      body: { appendChild() {} },
      createElement() { return field; },
      execCommand(command: string) { return command === "copy" && selected; },
    } as unknown as Document;
    const navigator = (modernFails ? { clipboard: { writeText: async () => { throw new Error("Denied"); } } } : {}) as unknown as Navigator;
    await copyCompanionCode(document, navigator, "ABCD-EFGH");
    if (field.value !== "ABCD-EFGH" || !removed || !focused) throw new Error("HTTP fallback must copy, clean up, and restore focus");
    document.execCommand = () => false;
    let failed = false;
    try { await copyCompanionCode(document, navigator, "ABCD-EFGH"); } catch { failed = true; }
    if (!failed) throw new Error("A blocked clipboard must not report success");
  }
}
