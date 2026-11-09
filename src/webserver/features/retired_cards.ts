import { cardContractTypeRetired } from "../generated/card_contract";
import type { CardConfig } from "../contracts/types";
import { emptyCardConfig } from "../model/card";
import { childPageKey, pageDepth, parentPageKey, PAGE_OWNER_SLOTS } from "../model/page_keys";
import { coveredCells } from "../model/grid";

// Release retired tiles and their spans so the old spaces can hold new cards.
export function removeRetiredCards(
  grid: number[], sizes: Record<number, number>, buttons: CardConfig[], columns: number,
  isRetired = cardContractTypeRetired,
): number[] {
  const removed: number[] = [];
  for (let position = 0; position < grid.length; position++) {
    const slot = grid[position] ?? 0;
    if (slot <= 0 || !isRetired(buttons[slot - 1]?.type)) continue;
    for (const cell of coveredCells(position, sizes[slot] || 1, grid.length, columns, true)) {
      if (cell < grid.length && (grid[cell] === slot || grid[cell] === -1)) grid[cell] = 0;
    }
    buttons[slot - 1] = emptyCardConfig();
    delete sizes[slot];
    removed.push(slot);
  }
  return removed;
}

// Clean retired records from native layouts and backups, including pages they owned.
export function removeRetiredPanelRecords(document: import("../model/panel_config").PanelConfigDocument, codec: {
  parseButtonConfig(value: string): CardConfig;
  parseSubpageConfig(value: string): { buttons: CardConfig[]; order: string[] };
  serializeSubpageConfig(value: { buttons: CardConfig[]; order: string[] }): string;
}, isRetired = cardContractTypeRetired): boolean {
  let changed = false;
  const removeOwnedPages = (key: number) => {
    delete document.subpages[key];
    for (const path of Object.keys(document.subpages)) {
      if (parentPageKey(Number(path)) === key) delete document.subpages[Number(path)];
    }
  };
  const retiredSlots = new Set<number>();
  for (const [slot, value] of Object.entries(document.buttons)) {
    if (!isRetired(codec.parseButtonConfig(value).type)) continue;
    retiredSlots.add(Number(slot));
    if (Number(slot) <= PAGE_OWNER_SLOTS) removeOwnedPages(Number(slot));
    delete document.buttons[Number(slot)];
  }
  const cleanOrder = (order: string[], slots: Set<number>) => order.map(token =>
    slots.has(parseInt(token, 10)) ? "" : token);
  if (retiredSlots.size) {
    changed = true;
    document.settings.button_order = cleanOrder((document.settings.button_order || "").split(","), retiredSlots).join(",");
  }
  const cleanSubpage = (value: string, page: number): string => {
    const subpage = codec.parseSubpageConfig(value);
    const slots = new Set<number>();
    subpage.buttons.forEach((button, index) => {
      if (!isRetired(button.type)) return;
      slots.add(index + 1);
      if (page > 0 && pageDepth(page) === 1 && index < PAGE_OWNER_SLOTS) removeOwnedPages(childPageKey(page, index + 1));
      subpage.buttons[index] = emptyCardConfig();
    });
    if (!slots.size) return value;
    changed = true;
    subpage.order = cleanOrder(subpage.order, slots);
    return codec.serializeSubpageConfig(subpage);
  };
  for (const slot of Object.keys(document.subpages)) {
    const raw = document.subpages[Number(slot)];
    if (raw !== undefined) document.subpages[Number(slot)] = cleanSubpage(raw, Number(slot));
  }
  if (document.settings.special_page) document.settings.special_page = cleanSubpage(document.settings.special_page, -1);
  return changed;
}

export function isRetiredWebApp(type: string | null | undefined): boolean {
  return type === "companion_webapp";
}
