import type { CompanionAction } from "../api/companion_catalogue";
import type { CardConfig } from "../contracts/types";
import { COMPANION_FOLDER_PREFIX } from "./companion_card_codec";
import { isBackOrderToken, parseBackOrderToken } from "./subpage";

/** Live folders occupy empty cells without acquiring a saved card identity. */
export function finderFolderPreview(
  order: readonly string[],
  grid: readonly number[],
  cards: readonly CardConfig[],
  capacity: number,
  actions: readonly CompanionAction[],
): ReadonlyMap<number, CompanionAction> {
  const tiles = new Map<number, CompanionAction>();
  if (!actions.length || !order.some(item => isBackOrderToken(parseBackOrderToken(item).token))) return tiles;

  const placed = new Set(grid.filter(slot => slot > 0).map(slot => cards[slot - 1]?.entity));
  let position = 0;
  for (const action of actions) {
    while (position < grid.length && grid[position] !== 0) position++;
    if (position === grid.length || cards.length + tiles.size >= capacity) break;
    if (!action.id.startsWith(COMPANION_FOLDER_PREFIX) ||
        action.id.length === COMPANION_FOLDER_PREFIX.length || placed.has(action.id)) continue;
    placed.add(action.id);
    tiles.set(position++, action);
  }
  return tiles;
}
