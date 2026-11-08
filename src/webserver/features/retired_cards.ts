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
