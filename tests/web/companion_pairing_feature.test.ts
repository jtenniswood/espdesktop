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
    expires_in_seconds: 900,
    pairing_code: "ABCD-EFGH",
  })) {
    throw new Error("An active unpaired device must show its pairing code");
  }
  if (companionPairingCodeVisible({
    available: true,
    active: true,
    paired: true,
    connected: false,
    expires_in_seconds: 900,
    pairing_code: "ABCD-EFGH",
  })) {
    throw new Error("A paired device must not show a pairing code");
  }
  const openStatus = companionPairingStatusText({
    available: true,
    active: true,
    paired: false,
    connected: false,
    expires_in_seconds: 900,
    pairing_code: "",
  });
  if (openStatus !== "Pairing is open for about 15 minutes.") {
    throw new Error("Companion setup should describe the extended pairing window");
  }

  const connectedStatus = companionPairingStatusText({
    available: true,
    active: false,
    paired: true,
    connected: true,
    expires_in_seconds: 0,
    pairing_code: "",
  });
  if (connectedStatus !== "Mac Companion connected") {
    throw new Error("Connected Companion status must be clear on the settings page");
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
