export interface HealthcheckChoice {
    readonly id: string;
    readonly label: string;
}

type CatalogueState = "unavailable" | "unconfigured" | "waiting" | "ready" | "stale";
interface HealthchecksCatalogue {
    readonly state: CatalogueState;
    readonly checks: readonly HealthcheckChoice[];
}
interface CataloguePage extends HealthchecksCatalogue {
    readonly generation: number;
    readonly hasMore: boolean;
}

const MAX_PAGES = 32;

function parsePage(value: unknown): CataloguePage {
    const page = value as Partial<CataloguePage> | null;
    if (!page || !["unavailable", "unconfigured", "waiting", "ready", "stale"].includes(page.state || "") ||
        typeof page.generation !== "number" || !Number.isInteger(page.generation) ||
        typeof page.hasMore !== "boolean" || !Array.isArray(page.checks) || page.checks.length > 32 ||
        page.checks.some(check => typeof check?.id !== "string" || !/^[0-9a-f]{40}$/.test(check.id) ||
            typeof check.label !== "string" || !check.label)) {
        throw new Error("Invalid Healthchecks.io catalogue");
    }
    return page as CataloguePage;
}

export async function loadHealthchecksCatalogue(
    fetchImpl: typeof fetch,
): Promise<HealthchecksCatalogue> {
    async function loadPage(index: number): Promise<CataloguePage> {
        const response = await fetchImpl("/companion/healthchecks?page=" + index, { cache: "no-store" });
        if (!response.ok) throw new Error("Healthchecks.io catalogue unavailable");
        return parsePage(await response.json());
    }
    for (let attempt = 0; attempt < 2; attempt++) {
        const first = await loadPage(0);
        const checks = [...first.checks];
        let hasMore = first.hasMore;
        for (let index = 1; hasMore && index < MAX_PAGES; index++) {
            const current = await loadPage(index);
            if (current.generation !== first.generation) break;
            checks.push(...current.checks);
            hasMore = current.hasMore;
        }
        if (!hasMore) return { state: first.state, checks };
    }
    throw new Error("Healthchecks.io catalogue changed while loading");
}
