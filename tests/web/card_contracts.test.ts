import {
  CARD_CONTRACT_MIGRATION_ALIASES,
  CARD_RUNTIME_SPECS,
  cardContractCard,
  cardContractCardKeys,
  cardContractDefaultConfig,
  cardContractMigrationAlias,
  cardContractSubpageTypeCode,
  cardContractSubpageTypeFromCode,
  cardContractTypeRetired,
  cardRuntimeSpec,
  resolveCardRuntimeSpec,
} from "../../src/webserver/generated/card_contract";

function equal<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);
}

export function runCardContractTests(): void {
  const keys = cardContractCardKeys();
  equal(JSON.stringify(keys.sort()), JSON.stringify(Object.keys(CARD_RUNTIME_SPECS).sort()), "card and runtime type sets");
  for (const type of keys) {
    const card = cardContractCard(type);
    const runtime = cardRuntimeSpec(type);
    if (!card) throw new Error(`${type || "switch"}: card contract is missing`);
    if (!runtime) throw new Error(`${type || "switch"}: runtime contract is missing`);
    const defaults = cardContractDefaultConfig(type);
    equal(defaults.type, card.default.type, `${type || "switch"} default type`);
    if (!runtime.driver) throw new Error(`${type || "switch"}: runtime driver is empty`);

    const code = cardContractSubpageTypeCode(type);
    equal(cardContractSubpageTypeFromCode(code), type, `${type || "switch"} compact type code round-trip`);
    const resolved = resolveCardRuntimeSpec(defaults);
    if (!resolved?.driver) throw new Error(`${type || "switch"}: default runtime driver does not resolve`);
  }

  for (const [type, code] of [["calendar", "D"], ["clock", "CK"], ["timezone", "T"]] as const) {
    equal(cardContractTypeRetired(type), true, `${type} is retired`);
    equal(cardContractCard(type), null, `${type} has no active contract`);
    equal(cardContractSubpageTypeFromCode(code), type, `${code} decodes to the retired type`);
  }

  for (const [legacyType, expected] of Object.entries(CARD_CONTRACT_MIGRATION_ALIASES)) {
    const alias = cardContractMigrationAlias(legacyType);
    if (!alias) throw new Error(`${legacyType}: migration alias is missing`);
    equal(JSON.stringify(alias), JSON.stringify(expected), `${legacyType} migration alias copy`);
  }

  const media = resolveCardRuntimeSpec({
    ...cardContractDefaultConfig("media"),
    type: "media",
    sensor: "cover_art",
  });
  equal(media?.driver, "media_cover_art", "mode-aware Media driver resolution");
  const companion = cardContractDefaultConfig("companion");
  equal(companion.type, "companion", "Companion default type");
  equal(companion.icon, "Monitor", "Companion default icon");
  equal(resolveCardRuntimeSpec(companion)?.driver, "companion", "Companion runtime driver");
  equal(cardContractSubpageTypeCode("companion"), "CP", "Companion compact type code");
  equal(cardContractCard("todo"), null, "retired Todo card stays outside the public contract");
  for (const type of ["internal", "wifi_qr", "wifi_qr_card", "screen_lock", "screensaver"]) {
    equal(cardContractCard(type), null, `${type} stays outside the card contract`);
    equal(cardRuntimeSpec(type), null, `${type} has no runtime driver`);
  }
}
