import { cardContractTypeRetired } from "../generated/card_contract";
import type { CardConfig } from "../contracts/types";
import { emptyCardConfig } from "../model/card";
import { coveredCells } from "../model/grid";

// Release retired tiles and their spans so the old spaces can hold new cards.
export function removeRetiredCards(
  grid: number[], sizes: Record<number, number>, buttons: CardConfig[], columns: number,
): number[] {
  const removed: number[] = [];
  for (let position = 0; position < grid.length; position++) {
    const slot = grid[position] ?? 0;
    if (slot <= 0 || !cardContractTypeRetired(buttons[slot - 1]?.type)) continue;
    for (const cell of coveredCells(position, sizes[slot] || 1, grid.length, columns, true)) {
      if (cell < grid.length && (grid[cell] === slot || grid[cell] === -1)) grid[cell] = 0;
    }
    buttons[slot - 1] = emptyCardConfig();
    delete sizes[slot];
    removed.push(slot);
  }
  return removed;
}

// Native backups contain raw records and must be cleaned before either restore transport.
export function removeRetiredPanelRecords(document: import("../model/panel_config").PanelConfigDocument, codec: {
  parseButtonConfig(value: string): CardConfig;
  parseSubpageConfig(value: string): { buttons: CardConfig[]; order: string[] };
  serializeSubpageConfig(value: { buttons: CardConfig[]; order: string[] }): string;
}): void {
  const retiredSlots = new Set<number>();
  for (const [slot, value] of Object.entries(document.buttons)) {
    if (!cardContractTypeRetired(codec.parseButtonConfig(value).type)) continue;
    retiredSlots.add(Number(slot));
    delete document.buttons[Number(slot)];
  }
  const cleanOrder = (order: string[], slots: Set<number>) => order.map(token =>
    slots.has(parseInt(token, 10)) ? "" : token);
  if (retiredSlots.size) {
    document.settings.button_order = cleanOrder((document.settings.button_order || "").split(","), retiredSlots).join(",");
  }
  const cleanSubpage = (value: string): string => {
    const subpage = codec.parseSubpageConfig(value);
    const slots = new Set<number>();
    subpage.buttons.forEach((button, index) => {
      if (!cardContractTypeRetired(button.type)) return;
      slots.add(index + 1);
      subpage.buttons[index] = emptyCardConfig();
    });
    if (!slots.size) return value;
    subpage.order = cleanOrder(subpage.order, slots);
    return codec.serializeSubpageConfig(subpage);
  };
  for (const slot of Object.keys(document.subpages)) {
    document.subpages[Number(slot)] = cleanSubpage(document.subpages[Number(slot)]!);
  }
  if (document.settings.special_page) document.settings.special_page = cleanSubpage(document.settings.special_page);
}
