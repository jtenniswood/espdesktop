type NumberRule = { readonly min: number; readonly max: number };
type FieldRule = NumberRule | { readonly hex: number } | readonly string[];

type SettingRecord<Fields extends Readonly<Record<string, FieldRule>>> = {
  readonly [Name in keyof Fields]: Fields[Name] extends NumberRule ? number
    : Fields[Name] extends readonly string[] ? Fields[Name][number] : string;
};

export function readSettingRecord<Fields extends Readonly<Record<string, FieldRule>>>(
  raw: string | undefined, version: number, schema: Fields,
): SettingRecord<Fields> | undefined {
  const fields = raw?.split(",");
  const names = Object.keys(schema);
  if (!fields || fields.length !== names.length + 1 || fields[0] !== String(version)) return;
  const result: Record<string, string | number> = {};
  for (const [index, name] of names.entries()) {
    const field = fields[index + 1]!;
    const rule = schema[name]!;
    if ("min" in rule) {
      const digits = rule.min < 0 && field.startsWith("-") ? field.slice(1) : field;
      if (!digits || /[^0-9]/.test(digits)) return;
      const number = Number(field);
      if (number < rule.min || number > rule.max) return;
      result[name] = number;
    } else {
      if ("hex" in rule ? field.length !== rule.hex || /[^0-9A-F]/.test(field) : !rule.includes(field)) return;
      result[name] = field;
    }
  }
  return result as SettingRecord<Fields>;
}
