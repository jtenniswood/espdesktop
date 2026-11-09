import {
  GENERATED_DOMAIN_ICONS,
  GENERATED_ICON_SLUGS,
  GENERATED_ICON_NAMES,
} from "../generated/icons";

export const iconOptions: readonly string[] = ["Auto"].concat(GENERATED_ICON_NAMES).sort();
export const domainIcons: Readonly<Record<string, string>> = GENERATED_DOMAIN_ICONS;

export function uniqueOptions(options?: unknown[]): string[] {
  const output: string[] = [];
  for (const option of options || []) {
    const value = String(option);
    if (output.indexOf(value) < 0) output.push(value);
  }
  return output;
}

export function setSelectValue(
  select: HTMLSelectElement | null | undefined,
  value: unknown,
  label?: unknown,
): void {
  if (!select) return;
  const normalized = String(value);
  const found = Array.from(select.options).some((option) => option.value === normalized);
  if (!found) {
    const option = select.ownerDocument.createElement("option");
    option.value = normalized;
    option.textContent = label == null ? normalized : String(label);
    select.appendChild(option);
  }
  select.value = normalized;
}

export function escHtml(value: unknown): string {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function escAttr(value: unknown): string {
  return String(value == null ? "" : value).replace(/&/g, "&amp;").replace(/"/g, "&quot;")
    .replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const iconSlugsByName = new Map(Object.entries(GENERATED_ICON_SLUGS));
const registeredIconSlugs = new Set(iconSlugsByName.values());

export function iconSlug(name: unknown): string {
  const value = String(name || "");
  return iconSlugsByName.get(value) ?? (registeredIconSlugs.has(value) ? value : "cog");
}

export function mdiIcon(icon?: unknown, className?: string): HTMLSpanElement {
  const iconName = String(icon || "cog").trim();
  const span = document.createElement("span");
  span.className = className || "mdi";
  span.classList.add("mdi-" + (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(iconName) ? iconName : iconSlug(iconName)));
  return span;
}

export function textSpan(text?: unknown, className?: string): HTMLSpanElement {
  const span = document.createElement("span");
  if (className) span.className = className;
  span.textContent = text == null ? "" : String(text);
  return span;
}
