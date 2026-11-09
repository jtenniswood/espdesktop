import type { CardConfig } from "../contracts/types";
import { CARD_CONFIG_FIELDS, emptyCardConfig } from "./card";
import { cardTransferOwnsSubpage } from "./card_transfer";
import { matchPageCards } from "./page_edit";
import { PAGE_OWNER_SLOTS, pageOwnerSlot, parentPageKey } from "./page_keys";
import { PanelConfigError } from "./panel_config";
import { decodeNativeV2, encodeNativeV2, NativeV2Kind as K, type NativeV2Record } from "./panel_config_v2";

const ABSENT = 2, RAW = 1;
const entityField = (index: number) => index === 0 || index === 4;

export interface NativePageEdit {
  readonly order: string;
  readonly cards: readonly CardConfig[];
}

/** Edit one generation of wire records without replacing unaffected identities. */
export class NativeLayoutDraft {
  private readonly kinds = new Map<K, Map<number, NativeV2Record>>();
  private readonly strings = new Map<string, number>();
  private readonly entities = new Map<string, number>();
  readonly deviceProfile: string;
  readonly editScope: string[] = [];

  constructor(input: Uint8Array) {
    for (const record of decodeNativeV2(input)) this.records(record.kind).set(record.id, record);
    this.deviceProfile = this.records(K.Profile).get(0)!.text!;
    for (const [id, record] of this.records(K.String)) this.strings.set(record.text!, id);
    for (const [id, record] of this.records(K.Entity)) this.entities.set(this.text(record.first!), id);
  }

  private records(kind: K): Map<number, NativeV2Record> {
    let records = this.kinds.get(kind);
    if (!records) { records = new Map(); this.kinds.set(kind, records); }
    return records;
  }

  private allocate(record: NativeV2Record): NativeV2Record {
    const records = this.records(record.kind);
    let id = 1;
    while (records.has(id)) ++id;
    if (id >= 65535) throw new PanelConfigError("The native layout is out of record IDs.");
    record.id = id;
    records.set(id, record);
    return record;
  }

  private text(id: number): string { return this.records(K.String).get(id)?.text ?? ""; }

  private intern(value: string, asEntity = false): number {
    if (!value) return 0;
    const dictionary = asEntity ? this.entities : this.strings;
    const known = dictionary.get(value);
    if (known !== undefined) return known;
    const record = asEntity
      ? this.allocate({ kind: K.Entity, first: this.intern(value) })
      : this.allocate({ kind: K.String, text: value });
    dictionary.set(value, record.id!);
    return record.id!;
  }

  private cards(page: number): NativeV2Record[] {
    return [...this.records(K.Card).values()].filter(card => card.first === page)
      .sort((left, right) => left.second! - right.second!);
  }

  private config(card: NativeV2Record): CardConfig {
    return Object.fromEntries(CARD_CONFIG_FIELDS.map((name, index) => {
      const id = card.fields?.[index] ?? 0;
      return [name, this.text(entityField(index) ? this.records(K.Entity).get(id)?.first ?? 0 : id)];
    })) as CardConfig;
  }

  private ownedPage(card: NativeV2Record): NativeV2Record | undefined {
    return [...this.records(K.Page).values()].find(page => page.id !== 0 && page.second === card.id);
  }

  private pageState(page?: NativeV2Record): unknown {
    if (!page) return null;
    return [page.id, this.text(page.third ?? 0), this.cards(page.id!).map(card =>
      [card.id, this.config(card), this.pageState(this.ownedPage(card))])];
  }

  private removePage(page: NativeV2Record): void {
    for (const card of this.cards(page.id!)) this.removeCard(card);
    this.records(K.Navigation).delete(page.second!);
    this.records(K.Page).delete(page.id!);
  }

  private removeCard(card: NativeV2Record): void {
    const page = this.ownedPage(card);
    if (page) this.removePage(page);
    this.records(K.Card).delete(card.id!);
  }

  private syncPageOwner(card: NativeV2Record, config?: CardConfig): void {
    let page = this.ownedPage(card);
    if (config && cardTransferOwnsSubpage(config)) {
      if (card.first !== 0 && this.records(K.Page).get(card.first!)?.first !== 0)
        throw new PanelConfigError("Subpages can be at most two levels deep.");
      if (!page) page = this.allocate({ kind: K.Page, first: card.first!, second: card.id!, flags: card.first === 0 ? ABSENT : 0 });
      this.records(K.Navigation).set(card.id!, { kind: K.Navigation, id: card.id!, first: page.id! });
    } else if (page?.flags === ABSENT) {
      this.removePage(page);
    } else {
      this.records(K.Navigation).delete(card.id!);
    }
  }

  private writeCard(card: NativeV2Record, config: CardConfig): void {
    const previous = this.config(card);
    if (card.flags !== ABSENT && CARD_CONFIG_FIELDS.every(key => config[key] === previous[key])) return;
    const fields = CARD_CONFIG_FIELDS.map((name, index) => this.intern(config[name], entityField(index)));
    card.fields = fields;
    card.fieldMask = fields.reduce((mask, id, index) => mask | (id ? 1 << index : 0), 0);
    card.flags = card.rawSource = 0;
  }

  writeRootCard(slot: number, config: CardConfig): void {
    const previous = this.cards(0).find(card => card.second === slot);
    this.editScope.push(JSON.stringify(previous ? [previous.id, this.config(previous)] : null));
    const card = previous ?? this.allocate({ kind: K.Card, first: 0, second: slot });
    this.writeCard(card, config);
    this.syncPageOwner(card, config);
  }

  writeSetting(key: string, value: string): void {
    const settings = this.records(K.Setting);
    const existing = [...settings.keys()].find(id => this.text(id) === key);
    const previous = existing === undefined ? undefined : settings.get(existing);
    const oldOrder = this.records(K.Page).get(0)!.third ?? 0;
    this.editScope.push(JSON.stringify(previous ? this.text(previous.first!) :
      key === "button_order" ? this.text(oldOrder) : null));
    const id = existing ?? (value ? this.intern(key) : undefined);
    if (id !== undefined) {
      if (value) settings.set(id, { kind: K.Setting, id, first: this.intern(value) });
      else settings.delete(id);
    }
    if (key === "button_order") this.records(K.Page).get(0)!.third = this.intern(value);
  }

  private ownerAt(key: number): NativeV2Record | undefined {
    const parent = parentPageKey(key);
    const parentOwner = parent ? this.ownerAt(parent) : undefined;
    const parentId = parent ? (parentOwner && this.ownedPage(parentOwner)?.id) : 0;
    return parentId === undefined ? undefined : this.cards(parentId).find(card => card.second === pageOwnerSlot(key));
  }

  readPage(key: number): NativePageEdit | null {
    const owner = key ? this.ownerAt(key) : undefined;
    const page = key ? (owner && this.ownedPage(owner)) : this.records(K.Page).get(0);
    if (!page || page.flags === ABSENT) return null;
    const cards = this.cards(page.id!);
    if (key) return { order: this.text(page.third ?? 0), cards: cards.map(card => this.config(card)) };
    const bySlot = new Map(cards.map(card => [card.second!, card]));
    return { order: this.text(page.third ?? 0), cards: Array.from({ length: PAGE_OWNER_SLOTS }, (_, index) => {
      const card = bySlot.get(index + 1);
      return card ? this.config(card) : emptyCardConfig();
    }) };
  }

  patchPageCards(key: number, edits: ReadonlyMap<number, CardConfig>, order: string): void {
    if (!key) {
      for (const [slot, config] of edits) this.writeRootCard(slot, config);
      this.writeSetting("button_order", order);
      return;
    }
    const owner = this.ownerAt(key);
    const page = owner && this.ownedPage(owner);
    if (!page) throw new PanelConfigError("The folder no longer exists.");
    this.editScope.push(JSON.stringify(this.pageState(page)));
    const before = this.cards(page.id!);
    this.setPageOrder(page, order, edits.values(), before);
    const last = Math.max(before.length, ...edits.keys());
    for (let index = 0; index < last; ++index) {
      const config = edits.get(index + 1);
      const existing = before[index];
      if (existing && !config) continue;
      const card = existing ?? this.allocate({ kind: K.Card, first: page.id!, second: index + 1 });
      this.writeCard(card, config ?? emptyCardConfig());
      this.syncPageOwner(card, config);
    }
  }

  writePage(key: number, change: NativePageEdit | null): void {
    const parent = parentPageKey(key);
    const slot = pageOwnerSlot(key);
    let owner = this.ownerAt(key);
    this.editScope.push(JSON.stringify(owner ? [owner.id, this.config(owner), this.pageState(this.ownedPage(owner))] : null));
    if (!owner && !parent && change)
      owner = this.allocate({ kind: K.Card, first: 0, second: slot, flags: ABSENT });
    if (!owner) {
      if (!change) return;
      throw new PanelConfigError("The folder card no longer exists.");
    }
    const ownerConfig = this.config(owner);
    let page = this.ownedPage(owner);
    if (!change) {
      if (page && cardTransferOwnsSubpage(ownerConfig)) {
        for (const card of this.cards(page.id!)) this.removeCard(card);
        page.third = 0;
        page.flags = parent ? 0 : ABSENT;
      } else {
        if (page) this.removePage(page);
        if (owner.flags === ABSENT) this.removeCard(owner);
      }
      return;
    }
    if (!page) page = this.allocate({ kind: K.Page, first: owner.first!, second: owner.id!, flags: 1 });
    const before = this.cards(page.id!);
    this.setPageOrder(page, change.order, change.cards, before);
    const matches = matchPageCards(before.map(card => this.config(card)), change.cards);
    const kept = new Set(matches.values());
    // Allocate replacements before releasing IDs from deleted cards.
    const next = change.cards.map((config, index) => {
      const previous = matches.get(index);
      const card = previous === undefined
        ? this.allocate({ kind: K.Card, first: page!.id!, second: index + 1 }) : before[previous]!;
      card.second = index + 1;
      this.writeCard(card, config);
      return card;
    });
    before.forEach((card, index) => { if (!kept.has(index)) this.removeCard(card); });
    next.forEach((card, index) => this.syncPageOwner(card, change.cards[index]));
    this.syncPageOwner(owner, ownerConfig);
  }

  private setPageOrder(page: NativeV2Record, order: string, cards: Iterable<CardConfig>,
      before: readonly NativeV2Record[]): void {
    if (page.flags === ABSENT) page.flags = 1;
    page.third = this.intern(order);
    if (page.flags === 0 && (order.startsWith("~") ||
        [...cards].some(card => CARD_CONFIG_FIELDS.some(field => /[:|]/.test(card[field]))))) {
      page.flags = 1;
      // Imported raw child tokens use the page's delimiter convention.
      for (const card of before) if (card.flags === RAW) card.flags = card.rawSource = 0;
    }
  }

  finish(): Uint8Array {
    const stringRefs = new Set<number>(), entityRefs = new Set<number>();
    for (const record of this.records(K.Card).values()) {
      stringRefs.add(record.rawSource ?? 0);
      record.fields?.forEach((id, index) => (entityField(index) ? entityRefs : stringRefs).add(id));
    }
    for (const record of this.records(K.Page).values()) stringRefs.add(record.third ?? 0);
    for (const record of this.records(K.Setting).values()) {
      stringRefs.add(record.id!); stringRefs.add(record.first!);
    }
    for (const id of entityRefs) stringRefs.add(this.records(K.Entity).get(id)?.first ?? 0);
    return encodeNativeV2([...this.kinds.values()].flatMap(records => [...records.values()]).filter(record =>
      (record.kind !== K.String || stringRefs.has(record.id!)) &&
      (record.kind !== K.Entity || entityRefs.has(record.id!))));
  }
}
