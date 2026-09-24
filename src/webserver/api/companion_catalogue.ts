export interface CompanionAction { readonly id: string; readonly label: string; }

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
