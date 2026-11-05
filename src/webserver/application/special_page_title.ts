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
    dialog.className = "sp-identity-dialog";
    dialog.setAttribute("aria-labelledby", "sp-special-page-rename-heading");
    const form = document.createElement("form");
    const heading = document.createElement("h3");
    heading.id = "sp-special-page-rename-heading";
    heading.textContent = "Rename Special Page";
    const label = document.createElement("label");
    label.htmlFor = "sp-special-page-name";
    label.textContent = "Page name";
    const input = document.createElement("input");
    input.id = label.htmlFor;
    input.className = "sp-input";
    input.type = "text";
    input.maxLength = 60;
    input.value = options.title;
    input.placeholder = "Special Page";
    input.setAttribute("aria-describedby", "sp-special-page-name-help");
    const help = document.createElement("p");
    help.id = "sp-special-page-name-help";
    help.textContent = "Leave blank to use Special Page.";
    const error = document.createElement("p");
    error.setAttribute("role", "alert");
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "sp-action-btn";
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
        input.disabled = cancel.disabled = save.disabled = true;
        error.textContent = "";
        try {
            await options.save(input.value.trim());
            dialog.close();
        } catch (reason) {
            error.textContent = reason instanceof Error ? reason.message : "Could not save the page name. Try again.";
        } finally {
            saving = false;
            input.disabled = cancel.disabled = save.disabled = false;
        }
    });
    dialog.addEventListener("close", () => {
        dialog.remove();
        options.restoreFocus();
    });
    form.append(heading, label, input, help, error, cancel, save);
    dialog.append(form);
    document.body.append(dialog);
    dialog.showModal();
    input.focus();
    input.select();
}
