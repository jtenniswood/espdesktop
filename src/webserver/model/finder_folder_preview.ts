import { generatedCardKey } from "./generated_page_cards";
import { OBS_SCENE_PAGE_CONTROLS } from "../generated/companion_capabilities";
import { CARD_SIZE_SINGLE, CARD_SIZE_WIDE } from "./grid";
import type { CompanionAction } from "../api/companion_catalogue";
import type { CardConfig } from "../contracts/types";
import { APPLE_SHORTCUT_PREFIX, COMPANION_FOLDER_PREFIX } from "./companion_card_codec";
import { isBackOrderToken, parseBackOrderToken } from "./subpage";
import { appleShortcutExclusionKey } from "./companion_shortcut_page";

/** Live folders occupy empty cells without acquiring a saved card identity. */
export function liveSubpagePreview(
  grid: readonly number[],
  cards: readonly CardConfig[],
  capacity: number,
  actions: readonly CompanionAction[],
): ReadonlyMap<number, CompanionAction> {
  const tiles = new Map<number, CompanionAction>();

  const placed = new Set(grid.filter(slot => slot > 0).map(slot => cards[slot - 1]?.entity));
  let position = 0;
  for (const action of actions) {
    while (position < grid.length && grid[position] !== 0) position++;
    if (position === grid.length || cards.length + tiles.size >= capacity) break;
    if (placed.has(action.id)) continue;
    placed.add(action.id);
    tiles.set(position++, action);
  }
  return tiles;
}

export function appleShortcutPreview(
  order: readonly string[],
  grid: readonly number[],
  cards: readonly CardConfig[],
  actions: readonly CompanionAction[],
  hidden: ReadonlySet<string>,
): ReadonlyMap<number, CompanionAction> {
  if (!order.some(item => isBackOrderToken(parseBackOrderToken(item).token))) return new Map();
  return liveSubpagePreview(grid, cards, grid.length + cards.length, actions.filter(action =>
    action.id.startsWith(APPLE_SHORTCUT_PREFIX) && action.id.length > APPLE_SHORTCUT_PREFIX.length &&
    !hidden.has(appleShortcutExclusionKey(action.id))));
}

export function finderFolderPreview(
  order: readonly string[], grid: readonly number[], cards: readonly CardConfig[],
  capacity: number, actions: readonly CompanionAction[],
): ReadonlyMap<number, CompanionAction> {
  if (!order.some(item => isBackOrderToken(parseBackOrderToken(item).token))) return new Map();
  return liveSubpagePreview(grid, cards, capacity, actions.filter(action =>
    action.id.startsWith(COMPANION_FOLDER_PREFIX) && action.id.length > COMPANION_FOLDER_PREFIX.length));
}


/** Reserve footer controls before the catalogue fills the remaining cells. */
export function scenePageControls(grid: number[], cards: readonly CardConfig[], capacity: number,
    columns: number, excluded: ReadonlySet<string>) {
  const controls = new Map<number, { action: CompanionAction; size: number }>();
  if (grid.length < 6) return controls;
  const placed = new Set(grid.filter(slot => slot > 0).map(slot => cards[slot - 1]?.entity));
  for (const action of OBS_SCENE_PAGE_CONTROLS) {
    if (cards.length + controls.size >= capacity) break;
    if (placed.has(action.id) || excluded.has(generatedCardKey(action.id))) continue;
    let wide = -1;
    if (action.width === 2) {
      for (let pos = grid.length - 2; pos >= 0; --pos) {
        if (grid[pos] === 0 && pos % columns < columns - 1 && grid[pos + 1] === 0) {
          wide = pos;
          break;
        }
      }
    }
    const position = wide < 0 ? grid.lastIndexOf(0) : wide;
    if (position < 0) break;
    grid[position] = -1;
    if (wide >= 0) grid[position + 1] = -1;
    controls.set(position, { action, size: wide < 0 ? CARD_SIZE_SINGLE : CARD_SIZE_WIDE });
  }
  return controls;
}
