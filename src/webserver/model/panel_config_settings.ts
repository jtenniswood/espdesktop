import { PanelConfigError } from "./panel_config";
import { decodeNativeV2, encodeNativeV2, NativeV2Kind as Kind, type NativeV2Record } from "./panel_config_v2";

/** Edit native settings without rebuilding the pages, cards or raw imports. */
export function updateNativePanelSettings(input: Uint8Array,
    before: Readonly<Record<string, string>>, after: Readonly<Record<string, string>>): Uint8Array {
  const records: NativeV2Record[] = decodeNativeV2(input);
  const stringsById = new Map<number, string>();
  const stringsByValue = new Map<string, number>();
  for (const record of records) {
    if (record.kind !== Kind.String) continue;
    stringsById.set(record.id!, record.text!);
    stringsByValue.set(record.text!, record.id!);
  }
  let nextId = 1;
  const intern = (value: string): number => {
    if (!value) return 0;
    const known = stringsByValue.get(value);
    if (known !== undefined) return known;
    while (stringsById.has(nextId)) ++nextId;
    if (nextId >= 65535) throw new PanelConfigError("Native setting string dictionary is full");
    stringsById.set(nextId, value);
    stringsByValue.set(value, nextId);
    records.push({ kind: Kind.String, id: nextId, text: value });
    return nextId++;
  };

  const settings = new Map(records.filter(record => record.kind === Kind.Setting)
    .map(record => [stringsById.get(record.id!)!, record]));
  const root = records.find(record => record.kind === Kind.Page && record.id === 0)!;
  const removed = new Set<NativeV2Record>(), possiblyUnused = new Set<number>();
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const previous = Object.hasOwn(before, key) ? before[key] : undefined;
    const next = Object.hasOwn(after, key) ? after[key] : undefined;
    if (previous === next) continue;
    const existing = settings.get(key);
    if (existing) possiblyUnused.add(existing.first!);
    const value = next === undefined ? 0 : intern(next);
    if (next === undefined) {
      if (existing) {
        possiblyUnused.add(existing.id!);
        removed.add(existing);
      }
    } else if (existing) {
      existing.first = value;
    } else {
      records.push({ kind: Kind.Setting, id: intern(key), first: value });
    }
    if (key === "button_order") {
      possiblyUnused.add(root.third!);
      root.third = value;
    }
  }

  // Free replaced strings only after checking the rest of the layout. A label,
  // an order, and a setting can share the same dictionary entry.
  for (const record of records) {
    if (removed.has(record)) continue;
    if (record.kind === Kind.Entity || record.kind === Kind.Setting) possiblyUnused.delete(record.first!);
    if (record.kind === Kind.Setting) possiblyUnused.delete(record.id!);
    if (record.kind === Kind.Page) possiblyUnused.delete(record.third!);
    if (record.kind === Kind.Card) {
      possiblyUnused.delete(record.rawSource!);
      record.fields!.forEach((id, index) => { if (index !== 0 && index !== 4) possiblyUnused.delete(id); });
    }
  }
  return encodeNativeV2(records.filter(record => !removed.has(record) &&
    (record.kind !== Kind.String || !possiblyUnused.has(record.id!))));
}
