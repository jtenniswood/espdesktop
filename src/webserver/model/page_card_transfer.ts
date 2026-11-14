import { cardTransferOwnsSubpage } from "./card_transfer";
import type { CardConfig } from "../contracts/types";
import { CARD_CONFIG_FIELDS, cloneCardConfig, emptyCardConfig, parseRawButtonConfig } from "./card";
import { encodeConfigField } from "./config_primitives";
import { CARD_CONTRACT_SUBPAGE_TYPE_CODES, CARD_CONTRACT_SUBPAGE_TYPES_BY_CODE } from "../generated/card_contract";
import { buildSubpageGrid, isBackOrderToken, parseBackOrderToken, parseRawSubpageConfig, parseSubpageOrder, serializeSubpageGrid } from "./subpage";
import { coveredCells, parseGridOrder, serializeGridOrder, type SlotSizeMap } from "./grid";
import { findDuplicatePlacement, placeSlotAt } from "../features/preview_grid";
import { PANEL_CONFIG_MAX_SLOT_COUNT, PanelConfigError, type PanelConfigDocument } from "./panel_config";
import type { NativeLayoutDraft, NativePageEdit } from "./native_layout_draft";
import { encodePanelPageDocument, type NativePageLayout } from "./panel_config_conversion";
import { capturePanelPageSubtree, type PanelPageSubtree } from "./page_subtree";
import { childPageKey, pageDepth, pageOwnerSlot, parentPageKey } from "./page_keys";

export interface PageTransferLayout { readonly slots: number; readonly columns: number }
export interface PageTransferCard<Tree = PanelPageSubtree> {
  readonly button: CardConfig;
  readonly size: number;
  /** Retain dormant page data even when its owner is no longer a folder. */
  readonly subtree: Tree | null;
  readonly nativeTree?: NativeTransferTree | null;
}
export interface PageTransferOrigin {
  readonly page: number;
  readonly slots: readonly number[];
  readonly fingerprint: string;
}
export interface PageCardClipboard {
  readonly entries: readonly PageTransferCard[];
  readonly origin: PageTransferOrigin;
}
export class PageTransferConflict extends Error {}

interface NativeTransferTree {
  readonly page: NativePageEdit | null;
  readonly children: Readonly<Record<number, NativePageEdit>>;
}
interface TransferReader<Tree> {
  readPage(page: number): NativePageEdit;
  subtreeAt(page: number, slot: number): Tree | null;
  fingerprint(page: number, slots: readonly number[]): string;
}
interface TransferEditor<Tree> extends TransferReader<Tree> {
  writeCards(page: number, edits: ReadonlyMap<number, CardConfig>, order: string): void;
  writeTree(page: number, slot: number, tree: Tree | null): void;
}

const typeFromCode = (code: string): string => CARD_CONTRACT_SUBPAGE_TYPES_BY_CODE[code] ?? code;
function check(value: unknown, message: string): asserts value { if (!value) throw new PanelConfigError(message); }
function cloneDocument(source: PanelConfigDocument): PanelConfigDocument {
  return { ...source, buttons: { ...source.buttons }, subpages: { ...source.subpages }, settings: { ...source.settings } };
}
function layoutCheck(layout: PageTransferLayout): void {
  check(Number.isInteger(layout.slots) && layout.slots > 1 && layout.slots <= 32 &&
    Number.isInteger(layout.columns) && layout.columns > 0 && layout.columns <= layout.slots, "Invalid transfer layout");
}
function cardSlot(slot: number): void {
  // Saved card identities are independent of the number of visible cells.
  check(Number.isInteger(slot) && slot >= 1 && slot <= PANEL_CONFIG_MAX_SLOT_COUNT, "Invalid card slot");
}
function pageExists<Tree>(source: TransferReader<Tree>, page: number): void {
  pageDepth(page);
  if (!page) return;
  const parent = parentPageKey(page);
  pageExists(source, parent);
  const owner = source.readPage(parent).cards[pageOwnerSlot(page) - 1];
  check(owner && cardTransferOwnsSubpage(owner), "The destination page is no longer a folder");
}

function readLegacySubpage(raw: string): NativePageEdit {
  return { order: (raw.startsWith("~") ? raw.slice(1) : raw).split("|")[0] ?? "",
    cards: parseRawSubpageConfig(raw, typeFromCode).buttons };
}

function pageGrid<Tree>(source: TransferReader<Tree>, page: number, layout: PageTransferLayout) {
  const parsed = source.readPage(page);
  const placed = !page ? parseGridOrder(parsed.order, 32, layout.columns, {}, layout.slots)
    : buildSubpageGrid({ ...parseSubpageOrder(parsed.order), buttons: [...parsed.cards] }, layout.slots, layout.columns);
  return { ...parsed, grid: placed.grid, sizes: placed.sizes };
}

function capture<Tree>(reader: TransferReader<Tree>, page: number, slots: readonly number[], layout: PageTransferLayout) {
  layoutCheck(layout); pageExists(reader, page);
  check(slots.length > 0 && new Set(slots).size === slots.length, "Choose distinct cards to copy");
  const source = pageGrid(reader, page, layout);
  const entries = slots.map(slot => {
    cardSlot(slot);
    check(source.grid.includes(slot), "A copied card is no longer on this page");
    return { button: cloneCardConfig(source.cards[slot - 1]), size: source.sizes[String(slot)] ?? 1,
      subtree: reader.subtreeAt(page, slot) };
  });
  return { entries, origin: { page, slots: [...slots], fingerprint: reader.fingerprint(page, slots) } };
}

function verifyOrigin<Tree>(reader: TransferReader<Tree>, origin: PageTransferOrigin): void {
  if (reader.fingerprint(origin.page, origin.slots) !== origin.fingerprint)
    throw new PageTransferConflict("The copied cards changed. Copy them again before moving.");
}

function legacyReader(document: PanelConfigDocument): TransferReader<PanelPageSubtree> {
  const subtreeAt = (page: number, slot: number) => {
    if (pageDepth(page) === 2) return null;
    const tree = capturePanelPageSubtree(document, childPageKey(page, slot));
    return tree.configuration !== null || Object.keys(tree.children).length ? tree : null;
  };
  return {
    readPage: page => page ? readLegacySubpage(document.subpages[page] ?? "")
      : { cards: Array.from({ length: 32 }, (_, i) => parseRawButtonConfig(document.buttons[i + 1])),
          order: document.settings.button_order ?? "" },
    subtreeAt,
    fingerprint: (page, slots) => {
      const parent = page ? document.subpages[page]
        : { order: document.settings.button_order, cards: slots.map(slot => document.buttons[slot]) };
      return JSON.stringify([document.deviceProfile, parent, slots.map(slot => subtreeAt(page, slot))]);
    },
  };
}

function legacyEditor(document: PanelConfigDocument): TransferEditor<PanelPageSubtree> {
  return {
    ...legacyReader(document),
    writeCards: (page, edits, order) => writeLegacyCards(document, page, edits, order),
    writeTree: (page, slot, tree) => writeLegacyTree(document, page, slot, tree),
  };
}

/** Capture portable values at the copy-code boundary. */
export function capturePageCards(document: PanelConfigDocument, page: number, slots: readonly number[], layout: PageTransferLayout): PageCardClipboard {
  return capture(legacyReader(document), page, slots, layout);
}

function removeTree(document: PanelConfigDocument, key: number): void {
  for (const saved of Object.keys(document.subpages))
    if (Number(saved) === key || parentPageKey(Number(saved)) === key) delete document.subpages[Number(saved)];
}
function writeLegacyTree(document: PanelConfigDocument, page: number, slot: number, tree: PanelPageSubtree | null): void {
  if (pageDepth(page) === 2) {
    check(!tree || (tree.configuration === null && !Object.keys(tree.children).length), "Subpages can be at most two levels deep");
    return;
  }
  const key = childPageKey(page, slot);
  removeTree(document, key);
  if (!tree) return;
  check(pageDepth(key) < 2 || !Object.keys(tree.children).length, "Subpages can be at most two levels deep");
  if (tree.configuration !== null) document.subpages[key] = tree.configuration;
  for (const [child, raw] of Object.entries(tree.children)) document.subpages[childPageKey(key, Number(child))] = raw;
}
function rawFields(button: CardConfig): string[] { return CARD_CONFIG_FIELDS.map(field => button[field]); }
function compactChild(button: CardConfig): string {
  const fields = rawFields(button);
  const type = CARD_CONTRACT_SUBPAGE_TYPE_CODES[button.type] ?? button.type;
  return [type, ...[0, 1, 2, 3, 4, 5, 7, 8].map(i => encodeConfigField(fields[i]))].join(",");
}
/** Patch edited card tokens without rewriting sibling cards or trailing slots. */
function writeLegacyCards(document: PanelConfigDocument, page: number, edits: ReadonlyMap<number, CardConfig>, order: string): void {
  if (!page) {
    for (const [slot, button] of edits) {
      const fields = rawFields(button);
      document.buttons[slot] = fields.some(value => /[;\n\r]/.test(value)) || fields[0]?.startsWith("~")
        ? "~" + fields.map(encodeConfigField).join(",") : fields.join(";");
    }
    document.settings.button_order = order;
    return;
  }
  const raw = document.subpages[page] ?? "";
  let compact = raw.startsWith("~");
  const tokens = (compact ? raw.slice(1) : raw).split("|").slice(1);
  if (!compact && [...edits.values()].some(button => rawFields(button).some(field => /[:|]/.test(field)))) {
    compact = true;
    const old = parseRawSubpageConfig(raw, typeFromCode).buttons;
    for (let index = 0; index < tokens.length; ++index) tokens[index] = compactChild(old[index]!);
  }
  for (const [slot, button] of edits) {
    while (tokens.length < slot) tokens.push("");
    tokens[slot - 1] = compact ? compactChild(button) : rawFields(button).join(":");
  }
  document.subpages[page] = (compact ? "~" : "") + [order, ...tokens].join("|");
}
function updatedOrder<Tree>(editor: TransferReader<Tree>, page: number, grid: readonly number[], sizes: SlotSizeMap, layout: PageTransferLayout): string {
  if (!page) return serializeGridOrder(grid, sizes);
  const previous = editor.readPage(page);
  const back = parseSubpageOrder(previous.order);
  const next = serializeSubpageGrid(grid, sizes, back.backLabel, back.backColor, back.title);
  // Inactive records belong to the saved document, independently of this grid.
  const tokens = previous.order.split(",");
  const hasBack = tokens.some(token => isBackOrderToken(parseBackOrderToken(token).token));
  const tail = tokens.slice(layout.slots - (hasBack ? 0 : 1));
  if (tail.length) { while (next.length < layout.slots) next.push(""); next.push(...tail); }
  return next.join(",");
}
function clearGridSlots(grid: number[], sizes: SlotSizeMap, slots: readonly number[], layout: PageTransferLayout): void {
  for (const slot of slots) {
    const pos = grid.indexOf(slot);
    if (pos >= 0) for (const cell of coveredCells(pos, sizes[String(slot)] ?? 1, layout.slots, layout.columns, true)) grid[cell] = 0;
    delete sizes[String(slot)];
  }
}
function deleteCards<Tree>(editor: TransferEditor<Tree>, page: number, slots: readonly number[], layout: PageTransferLayout): void {
  const source = pageGrid(editor, page, layout);
  for (const slot of slots) {
    cardSlot(slot);
    check(source.grid.includes(slot), "A selected card is no longer on this page");
  }
  clearGridSlots(source.grid, source.sizes, slots, layout);
  editor.writeCards(page, new Map(slots.map(slot => [slot, emptyCardConfig()])), updatedOrder(editor, page, source.grid, source.sizes, layout));
  for (const slot of slots) editor.writeTree(page, slot, null);
}
export function planPageCardDelete(document: PanelConfigDocument, origin: PageTransferOrigin, layout: PageTransferLayout): PanelConfigDocument {
  const candidate = cloneDocument(document);
  deleteSelection(legacyEditor(candidate), origin, layout);
  encodePanelPageDocument(candidate);
  return candidate;
}

function deleteSelection<Tree>(editor: TransferEditor<Tree>, origin: PageTransferOrigin, layout: PageTransferLayout): void {
  layoutCheck(layout); pageExists(editor, origin.page); verifyOrigin(editor, origin);
  deleteCards(editor, origin.page, origin.slots, layout);
}

/** Plan all owner, order, source and descendant changes before one native save. */
export function planPageCardPaste(document: PanelConfigDocument, target: number, start: number,
  entries: readonly PageTransferCard[], layout: PageTransferLayout, move?: PageTransferOrigin,
): { document: PanelConfigDocument; slots: number[]; resized: number } {
  const candidate = cloneDocument(document);
  const result = pasteCards(legacyEditor(candidate), target, start, entries, layout, move);
  // Validate implicit empty targets and inactive pages after the full batch.
  encodePanelPageDocument(candidate);
  return { document: candidate, ...result };
}

function pasteCards<Tree>(editor: TransferEditor<Tree>, target: number, start: number,
    entries: readonly PageTransferCard<Tree>[], layout: PageTransferLayout, move?: PageTransferOrigin): { slots: number[]; resized: number } {
  layoutCheck(layout); pageExists(editor, target);
  check(entries.length > 0 && Number.isInteger(start) && start >= 0 && start < layout.slots, "Invalid paste position");
  if (move) {
    verifyOrigin(editor, move);
    check(entries.length === move.slots.length, "The move has an invalid card list");
    for (const slot of move.slots) if (pageDepth(move.page) < 2) {
      const source = childPageKey(move.page, slot);
      check(target !== source && parentPageKey(target) !== source, "A folder cannot be moved inside itself");
    }
    deleteCards(editor, move.page, move.slots, layout);
  }
  const destination = pageGrid(editor, target, layout), edits = new Map<number, CardConfig>();
  const trees = new Map<number, Tree | null>();
  const slots: number[] = []; let resized = 0;
  for (const entry of entries) {
    check(pageDepth(target) < 2 || !cardTransferOwnsSubpage(entry.button), "Subpages can be at most two levels deep");
    let slot = 0;
    // Home runtime uses fixed grid identities; subpages can retain higher saved IDs.
    const maxIdentity = target ? PANEL_CONFIG_MAX_SLOT_COUNT : layout.slots;
    for (let possible = 1; possible <= maxIdentity; ++possible) {
      const button = destination.cards[possible - 1];
      const empty = !button || CARD_CONFIG_FIELDS.every(field => !button[field] ||
        ((field === "icon" || field === "icon_on") && button[field] === "Auto"));
      if (!destination.grid.includes(possible) && !edits.has(possible) && empty && !editor.subtreeAt(target, possible)) { slot = possible; break; }
    }
    check(slot, "There is not enough room to paste every card without replacing saved cards");
    const placement = findDuplicatePlacement(destination.grid.slice(0, layout.slots), start, entry.size, layout.slots, layout.columns);
    check(placement.pos >= 0, "There is not enough room to paste every card");
    if (placement.size !== entry.size) ++resized;
    if (placement.size === 1) delete destination.sizes[String(slot)]; else destination.sizes[String(slot)] = placement.size;
    placeSlotAt(destination.grid, slot, placement.pos, placement.size, layout.columns);
    edits.set(slot, cloneCardConfig(entry.button)); slots.push(slot);
    trees.set(slot, entry.subtree);
  }
  editor.writeCards(target, edits, updatedOrder(editor, target, destination.grid, destination.sizes, layout));
  for (const [slot, tree] of trees) editor.writeTree(target, slot, tree);
  return { slots, resized };
}

function nativeReader(device: string, read: (key: number) => NativePageEdit | null): TransferReader<NativeTransferTree> {
  const readPage = (key: number) => {
    const page = read(key);
    return page ? { order: page.order, cards: page.cards.map(cloneCardConfig) } : { order: "", cards: [] };
  };
  const subtreeAt = (page: number, slot: number): NativeTransferTree | null => {
    if (pageDepth(page) === 2) return null;
    const key = childPageKey(page, slot);
    const root = read(key);
    const children: Record<number, NativePageEdit> = {};
    if (pageDepth(key) === 1 && root) {
      root.cards.slice(0, PANEL_CONFIG_MAX_SLOT_COUNT).forEach((_card, index) => {
        const child = childPageKey(key, index + 1);
        if (read(child)) children[index + 1] = readPage(child);
      });
    }
    return root || Object.keys(children).length ? { page: root ? readPage(key) : null, children } : null;
  };
  return { readPage, subtreeAt, fingerprint: (key, slots) => {
    const page = readPage(key);
    return JSON.stringify([device, page.order, key ? page.cards : slots.map(slot => page.cards[slot - 1]),
      slots.map(slot => subtreeAt(key, slot))]);
  } };
}

export function captureNativePageCards(document: PanelConfigDocument, layout: NativePageLayout | undefined,
    page: number, slots: readonly number[], grid: PageTransferLayout): PageCardClipboard {
  const stored = legacyReader(document);
  const reader = nativeReader(document.deviceProfile, key => {
    if (!layout) return key && !Object.hasOwn(document.subpages, key) ? null : stored.readPage(key);
    if (key) {
      const saved = layout.pages.find(candidate => candidate.key === key);
      return saved ? { order: saved.order, cards: saved.cards.map(card => card.config) } : null;
    }
    const bySlot = new Map(layout.rootCards.map(card => [card.slot, card.config]));
    return { order: document.settings.button_order ?? "",
      cards: Array.from({ length: PANEL_CONFIG_MAX_SLOT_COUNT }, (_, index) => bySlot.get(index + 1) ?? emptyCardConfig()) };
  });
  const captured = capture(reader, page, slots, grid);
  // Retain the portable representation for exporting a Paste Code.
  return { ...captured, entries: captured.entries.map((entry, index) => ({
    ...entry, nativeTree: entry.subtree, subtree: stored.subtreeAt(page, slots[index]!),
  })) };
}

function nativeEditor(draft: NativeLayoutDraft): TransferEditor<NativeTransferTree> {
  return {
    ...nativeReader(draft.deviceProfile, key => draft.readPage(key)),
    writeCards: (page, edits, order) => draft.patchPageCards(page, edits, order),
    writeTree(page, slot, tree) {
      if (pageDepth(page) === 2) {
        check(!tree, "Subpages can be at most two levels deep");
        return;
      }
      const key = childPageKey(page, slot);
      check(pageDepth(key) < 2 || !Object.keys(tree?.children ?? {}).length, "Subpages can be at most two levels deep");
      draft.writePage(key, tree?.page ?? null);
      if (tree) for (const [child, value] of Object.entries(tree.children))
        draft.writePage(childPageKey(key, Number(child)), value);
    },
  };
}

export function deleteNativePageCards(draft: NativeLayoutDraft, origin: PageTransferOrigin, grid: PageTransferLayout): void {
  deleteSelection(nativeEditor(draft), origin, grid);
}

export function pasteNativePageCards(draft: NativeLayoutDraft, page: number, position: number,
    entries: readonly PageTransferCard[], grid: PageTransferLayout, copyFrom?: PageTransferOrigin): { resized: number } {
  const editor = nativeEditor(draft);
  if (copyFrom) verifyOrigin(editor, copyFrom);
  return pasteCards(editor, page, position, entries.map(entry => {
    const portable = entry.subtree;
    const subtree = entry.nativeTree !== undefined ? entry.nativeTree : portable ? {
      page: portable.configuration === null ? null : readLegacySubpage(portable.configuration),
      children: Object.fromEntries(Object.entries(portable.children).map(([key, raw]) => [key, readLegacySubpage(raw)])),
    } : null;
    return { button: entry.button, size: entry.size, subtree };
  }), grid);
}
