import type { AppShortcutApplication } from "../generated/app_shortcuts";
import type { WebAppDefinition } from "../generated/web_apps";

export interface CompanionAction { readonly id: string; readonly label: string; }
export interface CompanionDefinitions {
  readonly applications: readonly AppShortcutApplication[];
  readonly webApplications: readonly WebAppDefinition[];
}

export interface CompanionFocusRegistrations {
  readonly urls: readonly string[];
  readonly webAppIDs: readonly string[];
}

export function companionFocusRegistrationValues(buttons: readonly unknown[], subpages: unknown, extra?: unknown): CompanionFocusRegistrations {
  const urls = new Set<string>();
  const webAppIDs = new Set<string>();
  const visit = (candidate: unknown) => {
    if (!candidate || typeof candidate !== "object") return;
    const card = candidate as { sensor?: unknown; entity?: unknown };
    if (typeof card.entity === "string" && card.entity.startsWith("webapp.")) {
      const id = card.entity.slice("webapp.".length);
      if (/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) webAppIDs.add(id);
    }
    const sensor = card.sensor;
    if (typeof sensor !== "string" || !sensor.startsWith("url.")) return;
    try {
      const value = decodeURIComponent(sensor.slice("url.".length));
      const url = new URL(value);
      if ((url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password) urls.add(url.href);
    } catch { /* Ignore incomplete saved URL cards. */ }
  };
  buttons.forEach(visit);
  if (subpages && typeof subpages === "object") {
    Object.values(subpages).forEach((subpage) => {
      if (subpage && typeof subpage === "object" && Array.isArray((subpage as { buttons?: unknown }).buttons)) {
        ((subpage as { buttons: unknown[] }).buttons).forEach(visit);
      }
    });
  }
  visit(extra);
  return { urls: [...urls].slice(0, 64), webAppIDs: [...webAppIDs].slice(0, 64) };
}

function focusId(encodedURL: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(encodedURL)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `urlcard.${hash.toString(16).padStart(16, "0")}`;
}

export function createCompanionCatalogueMonitor(
  load: () => Promise<readonly CompanionAction[]>,
  onActions: (actions: readonly CompanionAction[]) => void,
  schedule: (callback: () => void, delayMs: number) => number =
    (callback, delayMs) => window.setTimeout(callback, delayMs),
  cancel: (timer: number) => void = (timer) => window.clearTimeout(timer),
) {
  const refreshIntervalMs = 30000;
  let timer: number | null = null;
  let generation = 0;
  let retryDelayMs = 1000;
  let lastActions: readonly CompanionAction[] | null = null;

  function clearTimer(): void {
    if (timer !== null) cancel(timer);
    timer = null;
  }

  async function request(run: number): Promise<void> {
    let delayMs: number;
    try {
      const actions = await load();
      if (run !== generation) return;
      const changed = lastActions === null || lastActions.length !== actions.length ||
        lastActions.some((action, index) =>
          action.id !== actions[index]?.id || action.label !== actions[index]?.label);
      if (changed) {
        lastActions = actions;
        onActions(actions);
      }
      if (actions.length > 0) {
        retryDelayMs = 1000;
        delayMs = refreshIntervalMs;
      } else {
        delayMs = retryDelayMs;
        retryDelayMs = Math.min(retryDelayMs * 2, 10000);
      }
    } catch {
      if (run !== generation) return;
      delayMs = retryDelayMs;
      retryDelayMs = Math.min(retryDelayMs * 2, 10000);
    }

    if (run !== generation || timer !== null) return;
    timer = schedule(() => {
      timer = null;
      void request(run);
    }, delayMs);
  }

  return {
    start(): void {
      ++generation;
      clearTimer();
      retryDelayMs = 1000;
      void request(generation);
    },
    stop(): void {
      ++generation;
      clearTimer();
      retryDelayMs = 1000;
    },
  };
}

export function createCompanionCatalogue(fetchImpl: typeof fetch) {
  let cached: readonly CompanionAction[] | null = null;
  let pending: Promise<readonly CompanionAction[]> | null = null;
  let pendingRefresh = false;
  let definitions: CompanionDefinitions | null = null;
  let definitionsPending: Promise<CompanionDefinitions> | null = null;

  async function fetchActions(): Promise<readonly CompanionAction[]> {
    const response = await fetchImpl("/companion/actions", { cache: "no-store" });
    if (!response.ok) throw new Error("Companion actions unavailable");
    const data: unknown = await response.json();
    if (!Array.isArray(data)) return [];
    return data.filter((item): item is CompanionAction =>
      typeof item?.id === "string" && typeof item?.label === "string");
  }

  async function fetchDefinitions(): Promise<CompanionDefinitions> {
    const response = await fetchImpl("/companion/definitions", { cache: "no-store" });
    if (!response.ok) throw new Error("Companion definitions unavailable");
    const data: unknown = await response.json();
    const applications: AppShortcutApplication[] = [];
    const webApplications: WebAppDefinition[] = [];
    const payload = data as { definitions?: unknown } | null;
    if (Array.isArray(payload?.definitions)) {
      for (const value of payload.definitions) {
        if (!value || typeof value !== "object") continue;
        const entry = value as { kind?: unknown; definition?: unknown };
        if (!entry.definition || typeof entry.definition !== "object") continue;
        const definition = entry.definition as Record<string, unknown>;
        if (entry.kind === "application" && typeof definition.appId === "string") applications.push(definition as unknown as AppShortcutApplication);
        if (entry.kind === "webapp" && typeof definition.id === "string") webApplications.push(definition as unknown as WebAppDefinition);
      }
    }
    if (applications.length + webApplications.length === 0) throw new Error("Companion definitions are empty or invalid");
    return { applications, webApplications };
  }

  function load(refresh = false): Promise<readonly CompanionAction[]> {
    if (pending) {
      if (refresh && !pendingRefresh) return pending.then(() => load(true), () => load(true));
      return pending;
    }
    if (!refresh && cached) return Promise.resolve(cached);
    const request = fetchActions().then((actions) => {
      // A successful empty result can mean Companion has not connected yet.
      // Leave it uncached so a later connection-triggered load can retry.
      if (actions.length > 0) cached = actions;
      return actions;
    });
    pending = request;
    pendingRefresh = refresh;
    void request.then(() => {
      if (pending === request) { pending = null; pendingRefresh = false; }
    }, () => {
      if (pending === request) { pending = null; pendingRefresh = false; }
    });
    return request;
  }

  return {
    async saveFocusRegistrations(registrations: CompanionFocusRegistrations): Promise<void> {
      const targets = [...new Set(registrations.urls)].slice(0, 64).flatMap((value) => {
        try {
          const url = new URL(value);
          if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) return [];
          const encoded = encodeURIComponent(url.href);
          return [{ id: focusId(encoded), url: url.href }];
        } catch { return []; }
      });
      const response = await fetchImpl("/companion/focus-targets", {
        method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targets, webAppIDs: [...new Set(registrations.webAppIDs)].slice(0, 64) }),
      });
      if (!response.ok) throw new Error("Companion URL focus targets unavailable");
    },
    loadDefinitions(refresh = false): Promise<CompanionDefinitions> {
      if (definitionsPending) return definitionsPending;
      if (!refresh && definitions) return Promise.resolve(definitions);
      const request = fetchDefinitions().then((value) => { definitions = value; return value; });
      definitionsPending = request;
      void request.then(() => { if (definitionsPending === request) definitionsPending = null; },
        () => { if (definitionsPending === request) definitionsPending = null; });
      return request;
    },
    load,
  };
}
