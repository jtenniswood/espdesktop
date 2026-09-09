export function renderCompanionStorageSelector(panel: HTMLElement | undefined, card: any, helpers: any, fetchImpl: typeof fetch = fetch): void {
    const deviceField = document.createElement("div");
    deviceField.className = "sp-field";
    const label = document.createElement("label");
    label.className = "sp-field-label";
    label.htmlFor = helpers.idPrefix + "storage-device";
    label.textContent = "Storage device";
    deviceField.appendChild(label);
    const deviceSelect = document.createElement("select");
    deviceSelect.className = "sp-select";
    deviceSelect.id = helpers.idPrefix + "storage-device";
    const selectedId = card.entity.split(":")[1] || "";
    const addOption = (id: string, label: string) => {
        const option = document.createElement("option");
        option.value = id;
        option.textContent = label;
        deviceSelect.appendChild(option);
    };
    addOption("", "Startup disk (default)");
    if (selectedId) addOption(selectedId, "Saved device (unavailable)");
    deviceSelect.value = selectedId;
    deviceSelect.addEventListener("change", function () {
        card.entity = card.entity.split(":")[0] + (this.value ? ":" + this.value : "");
        helpers.saveField("entity", card.entity);
    });
    const hint = document.createElement("div");
    hint.className = "sp-hint";
    hint.textContent = "Loading storage devices…";
    deviceField.appendChild(deviceSelect);
    deviceField.appendChild(hint);
    panel?.appendChild(deviceField);
    void fetchImpl("/companion/storage", { cache: "no-store" }).then(async (response) => {
        if (!response.ok) throw new Error("Storage unavailable");
        const devices: unknown = await response.json();
        if (!Array.isArray(devices)) throw new Error("Storage unavailable");
        const current = deviceSelect.value;
        devices.filter((item) => typeof item?.id === "string" && typeof item?.label === "string")
            .forEach((item) => {
                const existing = Array.from(deviceSelect.options).find((option) => option.value === item.id);
                if (existing) existing.textContent = item.label;
                else addOption(item.id, item.label);
            });
        deviceSelect.value = current;
        hint.textContent = devices.length ? "Mounted local drives. Reopen settings to refresh." :
            "Connect Companion and enable Share Mac system statistics to list drives.";
    }).catch(() => { hint.textContent = "Storage devices unavailable. Check the Companion connection."; });
}
