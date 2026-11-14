// Display pages use local HTTP, where the modern Clipboard API may be unavailable.
export async function copyTextToClipboard(
    document: Document, navigator: Navigator, code: string, container: HTMLElement = document.body,
): Promise<void> {
    if (navigator.clipboard) {
        try {
            await navigator.clipboard.writeText(code);
            return;
        } catch { /* Fall back to copying from a selected field on local HTTP. */ }
    }
    const previousFocus = document.activeElement;
    const field = document.createElement("textarea");
    field.value = code;
    field.readOnly = true;
    field.style.cssText = "position:fixed;left:-9999px;top:0";
    container.appendChild(field);
    try {
        field.select();
        if (!document.execCommand("copy")) throw new Error("Clipboard unavailable");
    } finally {
        field.remove();
        if (previousFocus && "focus" in previousFocus) (previousFocus as HTMLElement).focus();
    }
}
