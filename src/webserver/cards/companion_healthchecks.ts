import { loadHealthchecksCatalogue, type HealthcheckChoice } from "../api/healthchecks_catalogue";
import { COMPANION_HEALTHCHECK_PREFIX } from "../model/companion_card_codec";

const catalogueMessages = {
    unavailable: "Connect the paired Mac with a version of EspDesktop that supports Healthchecks.io.",
    unconfigured: "Connect a project in the Mac app under Settings → Services.",
    waiting: "Waiting for the Mac to load checks. Refresh the list in a moment.",
    ready: "This project has no checks yet.",
    stale: "The Mac could not refresh the checks. The list may be out of date.",
};

export function renderHealthcheckSettings(
    panel: HTMLElement,
    card: { entity: string; label: string },
    helpers: {
        idPrefix: string;
        markCardPrimaryField: (field: HTMLElement, fieldName: string) => void;
        requireField: (input: HTMLSelectElement, message: string, active: () => boolean,
                       hasValue: (value: string) => boolean) => void;
        saveField: (field: string, value: string) => void;
    },
    fetchImpl: typeof fetch,
    renderPreview: () => void,
) {
    const document = panel.ownerDocument;
    const field = document.createElement("div");
    field.className = "sp-field";
    const label = document.createElement("label");
    label.htmlFor = helpers.idPrefix + "healthcheck";
    label.textContent = "Health check";
    const search = document.createElement("input");
    search.type = "search";
    search.className = "sp-input";
    search.placeholder = "Search checks…";
    search.setAttribute("aria-label", "Search health checks");
    const select = document.createElement("select");
    select.id = label.htmlFor;
    select.className = "sp-select";
    const note = document.createElement("div");
    note.className = "sp-field-info-text sp-visible";
    note.setAttribute("role", "status");
    const refreshButton = document.createElement("button");
    refreshButton.type = "button";
    refreshButton.className = "sp-action-btn";
    refreshButton.textContent = "Refresh checks";

    let checks: readonly HealthcheckChoice[] = [];
    const originalEntity = card.entity;
    const selectedId = () => card.entity.slice(COMPANION_HEALTHCHECK_PREFIX.length);

    function updateChoices() {
        const selected = selectedId();
        const query = search.value.trim().toLocaleLowerCase();
        const choices = checks.filter(check => check.id === selected || check.label.toLocaleLowerCase().includes(query));
        const none = document.createElement("option");
        none.value = "";
        none.textContent = query && choices.length === 0 ? "No matching checks" : "Choose a health check";
        none.disabled = true;
        select.replaceChildren(none);
        if (selected && !choices.some(check => check.id === selected)) {
            choices.unshift({ id: selected, label: card.label || "Saved check" });
        }
        for (const check of choices) {
            const option = document.createElement("option");
            option.value = check.id;
            option.textContent = check.label;
            select.appendChild(option);
        }
        select.value = selected;
        select.disabled = choices.length === 0;
        search.disabled = checks.length === 0;
    }

    async function refresh() {
        refreshButton.disabled = true;
        note.textContent = "Loading health checks…";
        try {
            const result = await loadHealthchecksCatalogue(fetchImpl);
            checks = result.checks;
            note.textContent = result.state === "ready" && checks.length ? "" : catalogueMessages[result.state];
        } catch {
            note.textContent = catalogueMessages.unavailable;
        } finally {
            updateChoices();
            refreshButton.disabled = false;
        }
    }

    field.append(label, search, select, note, refreshButton);
    helpers.markCardPrimaryField(field, "entity");
    panel.appendChild(field);
    helpers.requireField(select, "Choose a health check before saving.", () => true, value =>
        /^[0-9a-f]{40}$/.test(value) && (COMPANION_HEALTHCHECK_PREFIX + value === originalEntity ||
            checks.some(check => check.id === value)));
    search.addEventListener("input", updateChoices);
    select.addEventListener("change", () => {
        const check = checks.find(item => item.id === select.value);
        if (!check) return;
        card.entity = COMPANION_HEALTHCHECK_PREFIX + check.id;
        card.label = check.label;
        helpers.saveField("entity", card.entity);
        helpers.saveField("label", card.label);
        renderPreview();
    });
    refreshButton.addEventListener("click", () => { void refresh(); });
    updateChoices();
    void refresh();
}
