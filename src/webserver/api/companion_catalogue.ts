import type { AppShortcutApplication } from "../generated/app_shortcuts";

export interface CompanionAction {
  readonly id: string;
  readonly label: string;
  readonly iconHash?: string;
  readonly obsState?: string;
  readonly obsDetail?: string;
  readonly obsAvailable?: boolean;
  readonly shortcutColor?: number;
  readonly computer?: string;
  readonly computerName?: string;
  readonly primary?: boolean;
}
export interface CompanionDefinitions {
  readonly applications: readonly AppShortcutApplication[];
  readonly shortcutPlatform?: "windows";
}

export interface CompanionFocusRegistrations {
  readonly urls: readonly string[];
}

export function companionFocusRegistrationValues(buttons: readonly unknown[], subpages: unknown, extra?: unknown): CompanionFocusRegistrations {
  const urls = new Set<string>();
  const visit = (candidate: unknown) => {
    if (!candidate || typeof candidate !== "object") return;
    const card = candidate as { sensor?: unknown; entity?: unknown };
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
  return { urls: [...urls].slice(0, 64) };
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
          action.id !== actions[index]?.id || action.label !== actions[index]?.label ||
          action.iconHash !== actions[index]?.iconHash || action.obsState !== actions[index]?.obsState ||
          action.obsDetail !== actions[index]?.obsDetail || action.obsAvailable !== actions[index]?.obsAvailable ||
          action.shortcutColor !== actions[index]?.shortcutColor ||
          action.computer !== actions[index]?.computer || action.computerName !== actions[index]?.computerName);
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
      lastActions = null;
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
  const definitionsByComputer = new Map<string, { value: CompanionDefinitions; expires: number }>();
  const definitionsRequests = new Map<string, Promise<CompanionDefinitions>>();

  const shortcutApplications = new Map<string, { app: AppShortcutApplication | null; expires: number }>();
  const shortcutRequests = new Map<string, Promise<AppShortcutApplication | null>>();
  let shortcutQueue = Promise.resolve();

  type ShortcutPage = { catalogueVersion: number; complete: boolean; application: unknown };

  async function fetchShortcutPage(appId: string, page: number, version?: number,
                                   computer = ""): Promise<ShortcutPage | null> {
    const computerQuery = computer ? `&computer=${encodeURIComponent(computer)}` : "";
    const url = `/companion/shortcut-page?appId=${encodeURIComponent(appId)}&page=${page}${computerQuery}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    try {
      let response: Response;
      do {
        response = await fetchImpl(url, { cache: "no-store", signal: controller.signal });
        if (response.status !== 202) break;
        if (controller.signal.aborted) throw new Error("Shortcut catalogue request timed out");
        await new Promise(resolve => setTimeout(resolve, 150));
      } while (!controller.signal.aborted);
      if (page === 0 && (response.status === 204 || response.status === 404)) return null;
      if (response.status !== 200) throw new Error("Shortcut catalogue unavailable");
      const data = await response.json() as (Partial<ShortcutPage> & { page?: number }) | null;
      if (!data || data.page !== page || typeof data.complete !== "boolean" ||
          typeof data.catalogueVersion !== "number" || !Number.isSafeInteger(data.catalogueVersion) ||
          data.catalogueVersion < 1 || (version !== undefined && data.catalogueVersion !== version)) {
        throw new Error("Shortcut catalogue changed or was incomplete");
      }
      return { catalogueVersion: data.catalogueVersion, complete: data.complete, application: data.application };
    } finally {
      clearTimeout(timeout);
    }
  }

  async function fetchShortcutIndex(computer = ""): Promise<CompanionDefinitions | null> {
    const applications = new Map<string, AppShortcutApplication>();
    let version: number | undefined;
    let windows = false;
    for (let page = 0; page < 32; page++) {
      const data = await fetchShortcutPage("index", page, version, computer);
      if (!data) return null;
      version = data.catalogueVersion;
      const index = data.application as { applications?: unknown; shortcutPlatform?: unknown } | null;
      if (!Array.isArray(index?.applications) || index.applications.length > 32) throw new Error("Invalid shortcut catalogue index");
      const windowsPage = index.shortcutPlatform === "windows";
      if (page === 0) windows = windowsPage;
      else if (windows !== windowsPage) throw new Error("Companion platform changed during the catalogue load");
      for (const item of index.applications) {
        if (typeof item?.appId !== "string" || typeof item.label !== "string") continue;
        applications.set(item.appId, { version: 1, appId: item.appId, label: item.label, shortcuts: [], catalog: false });
      }
      if (data.complete) return { applications: [...applications.values()], ...(windows ? { shortcutPlatform: "windows" } : {}) };
    }
    throw new Error("Shortcut index has too many pages");
  }

  async function fetchShortcutApplication(appId: string,
                                          computer = ""): Promise<AppShortcutApplication | null> {
    let starter: AppShortcutApplication | undefined;
    let version: number | undefined;
    const more: NonNullable<AppShortcutApplication["moreShortcuts"]>[number][] = [];
    for (let page = 0; page < 32; page++) {
      const data = await fetchShortcutPage(appId, page, version, computer);
      if (!data) return null;
      version = data.catalogueVersion;
      const app = data.application as Partial<AppShortcutApplication> | null;
      if (app?.appId !== appId || !Array.isArray(app.shortcuts)) throw new Error("Invalid shortcut catalogue page");
      if (page === 0 && app.shortcuts.length > 0 && typeof app.label === "string") {
        starter = app as AppShortcutApplication;
      } else if (page > 0 && !app.shortcuts.length && Array.isArray(app.moreShortcuts) &&
                 app.moreShortcuts.length > 0 && app.moreShortcuts.length <= 52) {
        more.push(...app.moreShortcuts);
      } else {
        throw new Error("Invalid shortcut catalogue page");
      }
      if (data.complete && starter) return { ...starter, moreShortcuts: more };
    }
    throw new Error("Shortcut catalogue has too many pages");
  }

  function enqueueShortcutRequest<T>(load: () => Promise<T>): Promise<T> {
    const request = shortcutQueue.then(load);
    shortcutQueue = request.then(() => {}, () => {});
    return request;
  }

  function loadShortcutApplication(appId: string,
                                   computer = ""): Promise<AppShortcutApplication | null> {
    if (!/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(appId) || appId.length > 96) return Promise.resolve(null);
    const key = computer ? `${computer}:${appId}` : appId;
    const cached = shortcutApplications.get(key);
    if (cached && cached.expires > Date.now()) return Promise.resolve(cached.app);
    const pending = shortcutRequests.get(key);
    if (pending) return pending;
    if (shortcutRequests.size >= 8) return Promise.resolve(null);
    // The device relays one page at a time. Serialize editors' requests on this client.
    const request = enqueueShortcutRequest(() => fetchShortcutApplication(appId, computer))
      .catch(() => null)
      .then(app => {
        shortcutApplications.delete(key);
        shortcutApplications.set(key, { app, expires: Date.now() + (app ? 60000 : 3000) });
        if (shortcutApplications.size > 8) shortcutApplications.delete(shortcutApplications.keys().next().value!);
        return app;
      }).finally(() => { shortcutRequests.delete(key); });
    shortcutRequests.set(key, request);
    return request;
  }

  async function fetchActions(): Promise<readonly CompanionAction[]> {
    const response = await fetchImpl("/companion/actions", { cache: "no-store" });
    if (!response.ok) throw new Error("Companion actions unavailable");
    const data: unknown = await response.json();
    if (!Array.isArray(data)) return [];
    return data.filter((item): item is CompanionAction =>
      typeof item?.id === "string" && typeof item?.label === "string");
  }

  async function fetchLegacyDefinitions(computer = ""): Promise<CompanionDefinitions> {
    const applications = new Map<string, AppShortcutApplication>();
    const computerQuery = computer ? `&computer=${encodeURIComponent(computer)}` : "";
    let windows = false;
    for (let page = 0; page < 64; page += 1) {
      const response = await fetchImpl(`/companion/definitions?page=${page}${computerQuery}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Companion definitions unavailable");
      const data: unknown = await response.json();
      const payload = data as { definitions?: unknown; page?: unknown; hasMore?: unknown; shortcutPlatform?: unknown } | null;
      if (!Array.isArray(payload?.definitions) || payload.page !== page || typeof payload.hasMore !== "boolean")
        throw new Error("Companion definitions page is invalid");
      if (page === 0) windows = payload.shortcutPlatform === "windows";
      else if (windows !== (payload.shortcutPlatform === "windows"))
        throw new Error("Companion platform changed during the catalogue load");
      for (const value of payload.definitions) {
        if (!value || typeof value !== "object") continue;
        const entry = value as { kind?: unknown; definition?: unknown };
        if (!entry.definition || typeof entry.definition !== "object") continue;
        const definition = entry.definition as Record<string, unknown>;
        if (entry.kind !== "application" || typeof definition.appId !== "string" || !Array.isArray(definition.shortcuts)) continue;
        const app = definition as unknown as AppShortcutApplication;
        if (app.shortcuts.length) {
          applications.set(app.appId, app);
        } else if (Array.isArray(app.moreShortcuts)) {
          const previous = applications.get(app.appId);
          if (previous) applications.set(app.appId, {
            ...previous, moreShortcuts: [...(previous.moreShortcuts ?? []), ...app.moreShortcuts],
          });
        }
      }
      if (!payload.hasMore) break;
      if (page === 63) throw new Error("Companion definitions exceed the supported catalogue size");
    }
    if (!windows && applications.size === 0) throw new Error("Companion definitions are empty or invalid");
    const windowsPlatform = windows || [...applications.keys()].some(appId => appId.startsWith("windows."));
    return { applications: [...applications.values()], ...(windowsPlatform ? { shortcutPlatform: "windows" } : {}) };
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
    loadShortcutApplication,
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
        body: JSON.stringify({ targets }),
      });
      if (!response.ok) throw new Error("Companion URL focus targets unavailable");
    },
    loadDefinitions(refresh = false, computer = ""): Promise<CompanionDefinitions> {
      const key = computer || "primary";
      const pending = definitionsRequests.get(key);
      if (pending) return pending;
      const cached = definitionsByComputer.get(key);
      if (cached && (!refresh || cached.expires > Date.now())) return Promise.resolve(cached.value);
      // Some older firmware closes the connection for an unknown endpoint.
      // Only replace the cached definitions after a complete index or legacy sync.
      const request = enqueueShortcutRequest(() => fetchShortcutIndex(computer)).catch(() => null)
        .then(async index => {
          const value = index ?? await fetchLegacyDefinitions(computer);
          definitionsByComputer.set(key, {
            value, expires: index ? Date.now() + 15000 : 0,
          });
          return value;
        });
      definitionsRequests.set(key, request);
      void request.then(() => { if (definitionsRequests.get(key) === request) definitionsRequests.delete(key); },
        () => { if (definitionsRequests.get(key) === request) definitionsRequests.delete(key); });
      return request;
    },
    load,
  };
}
