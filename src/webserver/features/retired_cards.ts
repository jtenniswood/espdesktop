import { cardContractRemoveOnEdit, cardContractTypeRetired } from "../generated/card_contract";
import type { CardConfig } from "../contracts/types";
import { emptyCardConfig, retiredSavedCardType } from "../model/card";
import { childPageKey, pageDepth, parentPageKey, PAGE_OWNER_SLOTS } from "../model/page_keys";
import { coveredCells } from "../model/grid";
import type { NativePageLayout } from "../model/panel_config_conversion";

// Release retired tiles and their spans so the old spaces can hold new cards.
export function removeRetiredCards(
  grid: number[], sizes: Record<number, number>, buttons: CardConfig[], columns: number,
  isRetired = cardContractTypeRetired,
): number[] {
  const removed: number[] = [];
  for (let position = 0; position < grid.length; position++) {
    const slot = grid[position] ?? 0;
    if (slot <= 0 || !isRetired(retiredSavedCardType(buttons[slot - 1]) || buttons[slot - 1]?.type)) continue;
    for (const cell of coveredCells(position, sizes[slot] || 1, grid.length, columns, true)) {
      if (cell < grid.length && (grid[cell] === slot || grid[cell] === -1)) grid[cell] = 0;
    }
    buttons[slot - 1] = emptyCardConfig();
    delete sizes[slot];
    removed.push(slot);
  }
  return removed;
}

function cleanOrder(order: string, slots: Set<number>): string {
  return order.split(",").map(token => slots.has(parseInt(token, 10)) ? "" : token).join(",");
}

// Card tokens follow the order token in both legacy and compact page records.
export function removeRetiredSubpageRecords(
  value: string, buttons: readonly CardConfig[], isRetired = cardContractTypeRetired,
): { value: string; slots: Set<number> } {
  const slots = new Set<number>();
  buttons.forEach((button, index) => {
    if (isRetired(retiredSavedCardType(button) || button.type)) slots.add(index + 1);
  });
  if (!slots.size) return { value, slots };
  const compact = value.startsWith("~");
  const [order = "", ...cards] = (compact ? value.slice(1) : value).split("|");
  for (const slot of slots) cards[slot - 1] = "";
  return { value: (compact ? "~" : "") + [cleanOrder(order, slots), ...cards].join("|"), slots };
}

// Clean retired records from native layouts and backups, including pages they owned.
export function removeRetiredPanelRecords(document: import("../model/panel_config").PanelConfigDocument, codec: {
  parseButtonConfig(value: string): CardConfig;
  parseSubpageConfig(value: string): { buttons: CardConfig[] };
}, isRetired = cardContractTypeRetired, layout?: NativePageLayout): boolean {
  const rootCards = new Map(layout?.rootCards.map(card => [card.slot, card.config]));
  const pages = new Map(layout?.pages.map(page => [page.key, page.cards]));
  let changed = false;
  const removeOwnedPages = (key: number) => {
    delete document.subpages[key];
    for (const path of Object.keys(document.subpages)) {
      if (parentPageKey(Number(path)) === key) delete document.subpages[Number(path)];
    }
  };
  const retiredSlots = new Set<number>();
  for (const [slot, value] of Object.entries(document.buttons)) {
    const card = rootCards.get(Number(slot)) ?? codec.parseButtonConfig(value);
    const type = retiredSavedCardType(card) || card.type;
    if (!isRetired(type)) continue;
    retiredSlots.add(Number(slot));
    if (Number(slot) <= PAGE_OWNER_SLOTS) removeOwnedPages(Number(slot));
    delete document.buttons[Number(slot)];
  }
  if (retiredSlots.size) {
    changed = true;
    document.settings.button_order = cleanOrder(document.settings.button_order || "", retiredSlots);
  }
  for (const slot of Object.keys(document.subpages)) {
    const page = Number(slot);
    const raw = document.subpages[page];
    if (raw === undefined) continue;
    const buttons = pages.get(page)?.map(card => card.config) ?? codec.parseSubpageConfig(raw).buttons;
    const cleaned = removeRetiredSubpageRecords(raw, buttons, isRetired);
    if (!cleaned.slots.size) continue;
    changed = true;
    document.subpages[page] = cleaned.value;
    if (pageDepth(page) !== 1) continue;
    for (const retiredSlot of cleaned.slots) {
      if (retiredSlot <= PAGE_OWNER_SLOTS) removeOwnedPages(childPageKey(page, retiredSlot));
    }
  }
  const special = document.settings.special_page;
  if (special) {
    const cleaned = removeRetiredSubpageRecords(special, codec.parseSubpageConfig(special).buttons, isRetired);
    if (cleaned.slots.size) {
      document.settings.special_page = cleaned.value;
      changed = true;
    }
  }
  return changed;
}

export function isRetiredWebApp(type: string | null | undefined): boolean {
  return type === "companion_webapp";
}

export function isRetiredLayoutCard(type: string | null | undefined): boolean {
  return cardContractRemoveOnEdit(type);
}
