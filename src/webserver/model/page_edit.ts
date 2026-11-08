import type { PanelConfigDocument } from "./panel_config";
import { CARD_CONFIG_FIELDS } from "./card";
import { CARD_CONTRACT_SUBPAGE_TYPES_BY_CODE } from "../generated/card_contract";
import { parseRawSubpageConfig } from "./subpage";
import { childPageKey, pageDepth, parentPageKey } from "./page_keys";

/** Retain descendant pages when preset synchronization reindexes custom cards. */
export function updateEditorPage(current: PanelConfigDocument, key: number, value: string): PanelConfigDocument {
  const subpages = { ...current.subpages };
  const children = Object.entries(current.subpages).filter(([path]) => Number(path) > 32 && parentPageKey(Number(path)) === key);
  delete subpages[key];
  for (const [path] of children) delete subpages[Number(path)];
  if (!value) return { ...current, subpages };
  subpages[key] = value;
  if (pageDepth(key) === 2 || !children.length) return { ...current, subpages };
  const decode = (code: string) => Object.hasOwn(CARD_CONTRACT_SUBPAGE_TYPES_BY_CODE, code)
    ? (CARD_CONTRACT_SUBPAGE_TYPES_BY_CODE[code as keyof typeof CARD_CONTRACT_SUBPAGE_TYPES_BY_CODE] ?? code) : code;
  const oldCards = parseRawSubpageConfig(current.subpages[key], decode).buttons;
  const nextCards = parseRawSubpageConfig(value, decode).buttons;
  const identity = (card: typeof oldCards[number]) => JSON.stringify(CARD_CONFIG_FIELDS.map(field => card[field] || ""));
  const matched = new Map<number, number>(), used = new Set<number>();
  // Reserve unchanged siblings before comparing editable card fields. An
  // edited folder may acquire the same label/configuration as its neighbour.
  nextCards.slice(0, 32).forEach((card, index) => {
    if (oldCards[index] && identity(card) === identity(oldCards[index])) {
      matched.set(index, index); used.add(index);
    }
  });
  nextCards.slice(0, 32).forEach((card, index) => {
    if (matched.has(index)) return;
    const previous = oldCards.findIndex((old, oldIndex) => !used.has(oldIndex) && identity(old) === identity(card));
    if (previous >= 0) { matched.set(index, previous); used.add(previous); }
  });
  // A normal field edit keeps the card identity at its existing position.
  nextCards.slice(0, 32).forEach((_card, index) => {
    if (!matched.has(index) && index < oldCards.length && !used.has(index)) {
      matched.set(index, index); used.add(index);
    }
  });
  for (const [index, previous] of matched) {
    const raw = current.subpages[childPageKey(key, previous + 1)];
    if (raw !== undefined) subpages[childPageKey(key, index + 1)] = raw;
  }
  return { ...current, subpages };
}
