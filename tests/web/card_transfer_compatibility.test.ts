import {
  createCardTransferCode,
  parseCardTransferCode,
} from "../../src/webserver/model/card_transfer";
import { emptyCardConfig } from "../../src/webserver/model/card";

function equal<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);
}

export function runCardTransferCompatibilityTests(): void {
  const currentCode = createCardTransferCode(
    { device: "guition-esp32-s3-4848s040", firmware: "v1.2.3" },
    [{ ...emptyCardConfig("companion"), entity: "com.apple.Safari", size: 1 }],
  );
  const previousEnvelope = JSON.parse(currentCode) as Record<string, unknown>;
  previousEnvelope.format = "espcontrol.cards";

  const imported = parseCardTransferCode(JSON.stringify(previousEnvelope));
  equal(imported.format, "espdesktop.cards", "previous card marker imports into the current format");
  equal(imported.cards[0]?.entity, "com.apple.Safari", "previous card code keeps its configuration");
}
