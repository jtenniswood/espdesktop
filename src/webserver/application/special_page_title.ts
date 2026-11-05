import { mdiIcon } from "./ui_primitives";

export interface SpecialPageTitleDialogOptions {
    document: Document;
    title: string;
    locked: () => boolean;
    save: (title: string) => Promise<void>;
    restoreFocus: () => void;
}

export function showSpecialPageTitleDialog(options: SpecialPageTitleDialogOptions): void {
    if (options.locked() || options.document.querySelector("#sp-special-page-rename")) return;
    const document = options.document;
    const dialog = document.createElement("dialog");
    dialog.id = "sp-special-page-rename";
    dialog.className = "sp-settings-modal sp-rename-dialog";
    dialog.setAttribute("aria-labelledby", "sp-special-page-rename-heading");
    const form = document.createElement("form");
    const heading = document.createElement("h3");
    heading.id = "sp-special-page-rename-heading";
    heading.className = "sp-section-title";
    heading.textContent = "Rename";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "sp-settings-close";
    close.setAttribute("aria-label", "Close rename");
    close.innerHTML = '<svg class="sp-settings-close-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
        '<path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"></path></svg>';
    close.onclick = () => dialog.close();
    const field = document.createElement("div");
    field.className = "sp-field";
    const label = document.createElement("label");
    label.className = "sp-field-label";
    label.htmlFor = "sp-special-page-name";
    label.textContent = "Page name";
    const input = document.createElement("input");
    input.id = label.htmlFor;
    input.className = "sp-input";
    input.type = "text";
    input.maxLength = 60;
    input.value = options.title;
    input.placeholder = "Special Page";
    field.append(label, input);
    const error = document.createElement("p");
    error.setAttribute("role", "alert");
    error.className = "sp-rename-error";
    const actions = document.createElement("div");
    actions.className = "sp-btn-row sp-btn-row--save sp-has-secondary";
    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "sp-action-btn sp-cancel-btn";
    reset.title = "Reset to default";
    reset.setAttribute("aria-label", "Reset to default");
    const resetIcon = mdiIcon("restore");
    resetIcon.setAttribute("aria-hidden", "true");
    reset.append(resetIcon);
    reset.onclick = () => {
        input.value = "";
        error.textContent = "";
        input.focus();
    };
    const rightGroup = document.createElement("div");
    rightGroup.className = "sp-btn-group-right";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "sp-action-btn sp-cancel-btn";
    cancel.textContent = "Cancel";
    cancel.onclick = () => dialog.close();
    const save = document.createElement("button");
    save.type = "submit";
    save.className = "sp-action-btn sp-save-btn";
    save.textContent = "Save";
    let saving = false;
    dialog.addEventListener("cancel", event => { if (saving) event.preventDefault(); });
    form.addEventListener("submit", async event => {
        event.preventDefault();
        if (saving || options.locked()) return;
        saving = true;
        input.disabled = reset.disabled = close.disabled = cancel.disabled = save.disabled = true;
        error.textContent = "";
        try {
            await options.save(input.value.trim());
            dialog.close();
        } catch (reason) {
            error.textContent = reason instanceof Error ? reason.message : "Could not save the page name. Try again.";
        } finally {
            saving = false;
            input.disabled = reset.disabled = close.disabled = cancel.disabled = save.disabled = false;
        }
    });
    dialog.addEventListener("close", () => {
        dialog.remove();
        options.restoreFocus();
    });
    rightGroup.append(cancel, save);
    actions.append(reset, rightGroup);
    form.append(close, heading, field, error, actions);
    dialog.append(form);
    document.body.append(dialog);
    dialog.showModal();
    input.focus();
    input.select();
}
