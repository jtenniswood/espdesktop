export interface CompanionAction { readonly id: string; readonly label: string; }

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
  async function fetchActions(): Promise<readonly CompanionAction[]> {
    const response = await fetchImpl("/companion/actions", { cache: "no-store" });
    if (!response.ok) throw new Error("Companion actions unavailable");
    const data: unknown = await response.json();
    if (!Array.isArray(data)) return [];
    return data.filter((item): item is CompanionAction =>
      typeof item?.id === "string" && typeof item?.label === "string");
  }
  function load(refresh = false): Promise<readonly CompanionAction[]> {
    if (pending) {
      if (refresh && !pendingRefresh) {
        return pending.then(() => load(true), () => load(true));
      }
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
      if (pending === request) {
        pending = null;
        pendingRefresh = false;
      }
    }, () => {
      if (pending === request) {
        pending = null;
        pendingRefresh = false;
      }
    });
    return request;
  }
  return { load };
}
