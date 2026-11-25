import type { CardConfig } from "../contracts/types";
import type { SettingsDraft } from "../state/types";
import { generatedCardElements } from "../model/generated_page_cards";
import { cardTransferOwnsSubpage } from "../model/card_transfer";
import { state } from "../state/app_instance";
import type { NativePageTransfersFeature } from "./native_page_transfers";
import * as EspDesktopModel from "../model";
import { coveredCells, serializeGridOrder } from "../model/grid";
import type { CardEditorDraftController } from "../features/card_editor_draft_controller";
import type { ConfigPersistenceFeature } from "./config_post_api";
import type { ApplicationLayoutState } from "./application_context";
import type { ConfigImageOptionsFeature } from "./config_image_options";
import type { ConfigCodecFeature } from "./config_codec";
import type { UiRuntimeState } from "./state";
import type { EntityStateFeature } from "./entity_state";
import type { ControlsShellFeature } from "./controls_shell";
import type { ApplicationApiFeature } from "./api";
import type { GridFeature } from "./grid";
import type { ButtonSettingsSelectionFeature } from "./button_settings_selection";
import type { PreviewGridPlacementFeature } from "./preview_grid_placement";
import type { PreviewContextMenuFeature } from "./preview_context_menu";
import { cardRequiresHomeAssistant } from "../features/preview";
export interface PreviewInteractionsDependencies {
    readonly homeAssistantSupported: () => boolean;
    readonly nativeTransfers?: NativePageTransfersFeature;
    readonly cardEditorDraft: CardEditorDraftController;
    readonly configPersistence: ConfigPersistenceFeature;
    readonly layout: ApplicationLayoutState;
    readonly window: Window;
    readonly imageOptions: ConfigImageOptionsFeature;
    readonly codec: ConfigCodecFeature;
    readonly runtime: UiRuntimeState;
    readonly entityState: Pick<EntityStateFeature, "entityName">;
    readonly shell: Pick<ControlsShellFeature, "isConfigLocked" | "showBanner">;
    readonly requestApi: Pick<ApplicationApiFeature, "postText">;
    readonly grid: Pick<GridFeature, "ctx" | "serializeGrid">;
    readonly selection: Pick<ButtonSettingsSelectionFeature, "clearCardSelection" | "hideSettingsOverlay" | "selectClockBarItem">;
    readonly placement: Pick<PreviewGridPlacementFeature, "findDuplicatePlacement" | "getCellFromEvent" | "planMove" | "applyMove" | "placeSlotAt">;
    readonly contextMenu: PreviewContextMenuFeature;
    readonly renderPreview: () => void;
    readonly renderButtonSettings: (force?: boolean) => void;
}
export interface PreviewInteractionsFeature {
    clearPlaceholder(): void;
    setup(): void;
    addSlot(position?: any): void;
    addSubpageSlot(position?: any): void;
    duplicateButton(slot?: any): void;
    duplicateSubpageButton(slot?: any): void;
    deleteSlot(slot?: any): void;
    deleteButtons(slots?: any): void;
    emptyButtonConfig(): any;
    saveGeneratedDraft(draft: SettingsDraft): Promise<boolean>;
}

export function createPreviewInteractionsFeature(
    dependencies: PreviewInteractionsDependencies,
): PreviewInteractionsFeature {
    const cardEditorDraftController = dependencies.cardEditorDraft;
    const homeAssistantSupported = dependencies.homeAssistantSupported;
    const configPersistence = dependencies.configPersistence;
    const window = dependencies.window;
    const runtime = dependencies.runtime;
    const { entityName } = dependencies.entityState;
    const { isConfigLocked, showBanner } = dependencies.shell;
    const { ctx, serializeGrid } = dependencies.grid;
    const { clearCardSelection, hideSettingsOverlay, selectClockBarItem } = dependencies.selection;
    const { findDuplicatePlacement, getCellFromEvent, planMove, applyMove, placeSlotAt } = dependencies.placement;
    const { renderPreview, renderButtonSettings } = dependencies;
    const { showClockBar, showEmpty, showCard, showBack, showGenerated } = dependencies.contextMenu;
    const els = runtime.els;
    const {
        isImageCard,
        imageCardCountInSubpage,
        canAddImageCards,
        showImageCardLimitBanner,
    } = dependencies.imageOptions;
    function duplicateRequiresHomeAssistant(this: any, button?: any, subpage?: any): boolean {
        if (homeAssistantSupported()) return false;
        if (button && typeof button.type === "string" && cardRequiresHomeAssistant(button.type, button)) return true;
        var nestedButtons: any = subpage && Array.isArray(subpage.buttons) ? subpage.buttons : [];
        return nestedButtons.some(function (this: any, nested?: any) {
            return !!nested && typeof nested.type === "string" && cardRequiresHomeAssistant(nested.type, nested);
        });
    }
    function blockHomeAssistantDuplicate(this: any): void {
        showBanner("Home Assistant-backed cards can no longer be duplicated in this configurator.", "error");
    }
    const {
        parseSubpageConfig,
        serializeSubpageConfig,
        getSubpage,
        buildSubpageGrid,
        serializeSubpageGrid,
        enterChildSubpage,
        exitSubpage,
        saveSubpageConfig,
        subpageFirstFreeSlot,
    } = dependencies.codec;
    function generatedPlan(container: HTMLElement, positions: readonly number[]) {
        const c = ctx();
        const grid: number[] = c.grid.slice();
        const edits = new Map<number, CardConfig>();
        const sizes = { ...c.sizes };
        for (const pos of new Set(positions)) {
            const element = container.querySelector<HTMLElement>(`[data-pos="${pos}"]`);
            const generated = element && generatedCardElements.get(element);
            if (grid[pos] !== 0 || !generated) continue;
            const slot = c.buttons.length + edits.size + 1;
            edits.set(slot, generated.card);
            if (generated.size > 1) sizes[slot] = generated.size;
            placeSlotAt(grid, slot, pos, generated.size);
        }
        return { grid, edits, sizes, maxSlotId: c.buttons.length + edits.size };
    }

    function selectGenerated(pos: number, card: CardConfig, size: number, edit: boolean) {
        const homeSlot = state.editingSubpage;
        if (!homeSlot || !dependencies.nativeTransfers?.available()) return;
        state.clockBarSelectedItem = "";
        hideSettingsOverlay();
        const c = ctx();
        const slot = c.buttons.length + 1;
        const draft = cardEditorDraftController.newDraft({ slot, homeSlot, isSub: true, pos });
        draft.button = { ...card };
        draft.typeSelected = true;
        draft.generated = { id: card.entity, size };
        state.settingsDraft = draft;
        c.setSelected([slot]);
        c.setLastClicked(-1);
        renderPreview();
        if (edit) renderButtonSettings(true);
    }

    async function saveGeneratedDraft(draft: SettingsDraft): Promise<boolean> {
        const c = ctx();
        const position = draft.pos;
        const generated = draft.generated;
        if (!generated || position === undefined || !els.previewMain || !state.editingSubpage ||
            draft.homeSlot !== state.editingSubpage || draft.slot !== c.buttons.length + 1) return false;
        const plan = generatedPlan(els.previewMain, [position]);
        if (plan.edits.get(draft.slot)?.entity !== generated.id || (plan.sizes[draft.slot] || 1) !== generated.size) {
            showBanner("The automatic card moved. Reopen it before saving.", "error");
            return false;
        }
        const order = serializeSubpageGrid({ ...getSubpage(draft.homeSlot), grid: plan.grid, sizes: plan.sizes }).join(",");
        return dependencies.nativeTransfers?.saveGeneratedDraft(draft, order) ?? false;
    }

    function editCardTitle(title: HTMLElement) {
        if (title.querySelector("input")) return;
        const card = title.closest<HTMLElement>("[data-slot]");
        const slot = Number(card?.dataset.slot);
        const c = ctx();
        const homeSlot = state.editingSubpage;
        const button = c.buttons[slot - 1];
        const back = slot === -2 && c.isSub ? getSubpage(homeSlot) : null;
        if (!button && !back) return;
        const input = title.ownerDocument.createElement("input");
        input.type = "text";
        input.className = "sp-card-name-input";
        input.setAttribute("aria-label", "Card name");
        input.dataset.homeSlot = String(homeSlot || "");
        const defaultBackLabel = "Back";
        input.value = back ? back.backLabel || defaultBackLabel : button.label || "";
        input.placeholder = title.textContent || "Card name";
        let finished = false;
        function finish(save: boolean) {
            if (finished) return;
            finished = true;
            const current = ctx();
            if (save && !isConfigLocked() && current.isSub === c.isSub &&
                state.editingSubpage === homeSlot && current.grid.includes(slot)) {
                const label = input.value.trim();
                if (back) {
                    getSubpage(homeSlot).backLabel = label || defaultBackLabel;
                    saveSubpageConfig(homeSlot);
                } else {
                    const live = current.buttons[slot - 1];
                    if (live && live.label !== label && dependencies.nativeTransfers?.available()) {
                        void dependencies.nativeTransfers.rename(slot, label);
                    } else if (live && live.label !== label) {
                        live.label = label;
                        const draft = state.settingsDraft;
                        if (draft && draft.slot === slot && draft.isSub === c.isSub &&
                            (!c.isSub || draft.homeSlot === homeSlot)) draft.button.label = label;
                        if (c.isSub) saveSubpageConfig(homeSlot);
                        else configPersistence.saveButtonConfig(slot);
                    }
                }
                renderButtonSettings();
            }
            // Remove before rendering so the preview does not restore this editor.
            input.remove();
            renderPreview();
        }
        input.addEventListener("keydown", (event) => {
            event.stopPropagation();
            if (event.isComposing) return;
            if (event.key === "Enter" || event.key === "Escape") {
                event.preventDefault();
                finish(event.key === "Enter");
                (els.previewMain as HTMLElement).querySelector<HTMLElement>('[data-slot="' + slot + '"] .sp-editable-title')?.focus();
            }
        });
        input.addEventListener("blur", () => {
            // A preview refresh temporarily detaches and then refocuses the input.
            window.setTimeout(() => {
                if (input.isConnected && input.ownerDocument.activeElement !== input) finish(false);
            }, 0);
        });
        if (card) card.draggable = false;
        title.replaceChildren(input);
        input.focus();
        input.select();
    }
    // ── Preview event delegation & drag ────────────────────────────────────
    function clearPlaceholder(this: any) {
        if (runtime.previewPlaceholder) {
            runtime.previewPlaceholder.classList.remove("sp-drop-placeholder");
            runtime.previewPlaceholder = null;
        }
    }
    function clearTextSelection(this: any) {
        var selection: any = window.getSelection && window.getSelection();
        if (selection && selection.removeAllRanges)
            selection.removeAllRanges();
    }
    function setupBoxSelection(wrap: HTMLElement, grid: HTMLElement) {
        const document = grid.ownerDocument;
        const box = document.createElement("div");
        box.className = "sp-selection-box";
        box.setAttribute("aria-hidden", "true");

        document.addEventListener("pointerdown", (start) => {
            const target = start.target;
            if (!(target instanceof Element) || !start.isPrimary || start.pointerType !== "mouse" || start.button !== 0 ||
                isConfigLocked() || grid.classList.contains("sp-grid-loading")) return;

            const insidePreview = wrap.contains(target);
            if (insidePreview ? target.closest("[data-pos], .sp-topbar") : !isLayoutBackground(target, start.clientY)) return;

            // Keep the previous selection available for modifiers until the drag commits.
            start.preventDefault();
            const page = state.editingSubpage;
            const replace = !start.shiftKey && !start.metaKey && !start.ctrlKey;
            const toggle = start.metaKey || start.ctrlKey;
            const initial = new Set<number>(ctx().selected);
            let selected = new Set<number>();
            const listeners = new AbortController();
            const options = { signal: listeners.signal };
            wrap.setPointerCapture(start.pointerId);

            function finish() {
                listeners.abort();
                box.remove();
                if (wrap.hasPointerCapture(start.pointerId)) wrap.releasePointerCapture(start.pointerId);
            }
            function cancel() {
                const active = box.isConnected;
                finish();
                if (active) renderPreview();
            }
            function update(event: PointerEvent) {
                if (state.editingSubpage !== page || isConfigLocked()) {
                    cancel();
                    return;
                }
                const dx = event.clientX - start.clientX;
                const dy = event.clientY - start.clientY;
                if (!box.isConnected && Math.hypot(dx, dy) < 4) return;
                const left = Math.min(start.clientX, event.clientX);
                const top = Math.min(start.clientY, event.clientY);
                const right = Math.max(start.clientX, event.clientX);
                const bottom = Math.max(start.clientY, event.clientY);
                selected = new Set<number>();
                // Only saved cards can participate in the editor's batch actions.
                const cards = Array.from(grid.querySelectorAll<HTMLElement>(".sp-btn"), card => {
                    const slot = Number(card.dataset.slot);
                    const rect = card.getBoundingClientRect();
                    const hit = left < rect.right && right > rect.left && top < rect.bottom && bottom > rect.top;
                    const wasSelected = !replace && initial.has(slot);
                    const include = slot > 0 && (toggle ? hit !== wasSelected : hit || wasSelected);
                    if (include) selected.add(slot);
                    return { card, include };
                });
                for (const { card, include } of cards) card.classList.toggle("sp-selected", include);
                Object.assign(box.style, {
                    left: left + "px", top: top + "px", width: (right - left) + "px", height: (bottom - top) + "px",
                });
                if (!box.isConnected) wrap.appendChild(box);
            }
            wrap.addEventListener("pointermove", event => {
                if (event.pointerId === start.pointerId) update(event);
            }, options);
            wrap.addEventListener("pointerup", event => {
                if (event.pointerId !== start.pointerId) return;
                update(event);
                if (listeners.signal.aborted) return;
                const active = box.isConnected;
                finish();
                if (!active) {
                    if (replace && insidePreview && !grid.contains(target)) clearCardSelection();
                    return;
                }
                const c = ctx();
                const slots = [...selected];
                c.setSelected(slots);
                c.setLastClicked(slots.at(-1) ?? -1);
                state.clockBarSelectedItem = "";
                if (state.settingsDraft?.generated) state.settingsDraft = null;
                hideSettingsOverlay();
                renderPreview();
            }, options);
            wrap.addEventListener("lostpointercapture", event => {
                if (event.pointerId === start.pointerId) cancel();
            }, options);
            window.addEventListener("blur", cancel, options);
            document.addEventListener("keydown", event => {
                if (event.key === "Escape") cancel();
            }, options);
        });

        function isLayoutBackground(target: Element, y: number) {
            const page = els.screenPage;
            if (!page.classList.contains("active")) return false;
            return (target === document.body || target === document.documentElement ||
                target === els.root || target === page || target === els.previewHint) && y >= page.getBoundingClientRect().top;
        }
    }
    function deleteSelectionOnKey(event: KeyboardEvent) {
        if ((event.key !== "Backspace" && event.key !== "Delete") || event.defaultPrevented ||
            event.repeat || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

        const target = event.target;
        if (!(target instanceof Element) || target.closest("input, textarea, select, .sp-ctx-menu") ||
            (target instanceof HTMLElement && target.isContentEditable)) return;

        if (!els.screenPage.classList.contains("active") || isConfigLocked() || state.settingsDraft?.generated ||
            els.settingsOverlay?.classList.contains("sp-visible") ||
            window.document.querySelector('dialog[open], [aria-modal="true"], .sp-selection-box')) return;

        const selected: number[] = ctx().selected;
        if (!selected.length) return;

        // Suppress browser history navigation even if only the built-in Back button is selected.
        event.preventDefault();
        const slots = selected.filter(slot => slot > 0);
        if (!slots.length) return;

        dependencies.contextMenu.hide();
        if (slots.length === 1) deleteSlot(slots[0]);
        else deleteButtons(slots);
    }
    function setupPreviewEvents(this: any) {
        window.document.addEventListener("keydown", deleteSelectionOnKey);
        var container: any = els.previewMain;
        if (els.previewWrap) setupBoxSelection(els.previewWrap, container);
        var pendingCellIdx: any = -1;
        let draggedGeneratedId: string | undefined;
        state.clockBarDragItem = "";
        if (els.topbar) {
            els.topbar.addEventListener("click", function (this: any, e?: any) {
                if (isConfigLocked()) {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }
                var target: any = e.target.closest("[data-clockbar-item]");
                if (!target)
                    return;
                e.preventDefault();
                e.stopPropagation();
                selectClockBarItem(target.getAttribute("data-clockbar-item"));
            });
            els.topbar.addEventListener("keydown", function (this: any, e?: any) {
                if (e.key !== "Enter" && e.key !== " ")
                    return;
                var target: any = e.target.closest("[data-clockbar-item]");
                if (!target)
                    return;
                e.preventDefault();
                selectClockBarItem(target.getAttribute("data-clockbar-item"));
            });
            els.topbar.addEventListener("contextmenu", function (this: any, e?: any) {
                if (isConfigLocked()) {
                    e.preventDefault();
                    return;
                }
                var target: any = e.target.closest("[data-clockbar-item]");
                if (!target)
                    return;
                e.preventDefault();
                e.stopPropagation();
                showClockBar(e, target.getAttribute("data-clockbar-item"));
            });
        }
        function isBackExitTarget(this: any, e?: any, target?: any) {
            if (e.target.closest(".sp-back-badge")) return true;
            var icon: any = target.querySelector(".sp-back-hit:not([hidden])");
            if (!icon)
                return false;
            var rect: any = icon.getBoundingClientRect();
            // A large app icon already fills the card; keep its outer edge selectable.
            var pad: any = target.getAttribute("data-icon-size") === "large" ? 0 : 12;
            return e.clientX >= rect.left - pad &&
                e.clientX <= rect.right + pad &&
                e.clientY >= rect.top - pad &&
                e.clientY <= rect.bottom + pad;
        }
        container.addEventListener("mousedown", function (this: any, e?: any) {
            if (isConfigLocked())
                return;
            if (!e.target.closest("[data-pos]"))
                return;
            if (e.shiftKey || e.ctrlKey || e.metaKey)
                e.preventDefault();
        });
        container.addEventListener("keydown", (event: KeyboardEvent) => {
            const title = (event.target as HTMLElement).closest<HTMLElement>(".sp-editable-title");
            if (title && event.target === title && !isConfigLocked() && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                event.stopPropagation();
                editCardTitle(title);
            }
        });
        // Click delegation
        container.addEventListener("click", function (this: any, e?: any) {
            if (isConfigLocked()) {
                e.preventDefault();
                e.stopPropagation();
                if (state.nativeConfigReadOnly && state.nativePanelDocument && !state.configLocked && !state.nativeConfigLoading && !state.nativeTransferActive) {
                    const target = e.target.closest("[data-slot]");
                    const slot = Number(target?.getAttribute("data-slot"));
                    if (slot === -2) exitSubpage();
                    else if (slot > 0 && cardTransferOwnsSubpage(ctx().buttons[slot - 1]))
                        enterChildSubpage(state.editingSubpage, slot);
                }
                return;
            }
            if (e.target.closest(".sp-card-name-input")) return;
            var title: HTMLElement | null = e.target.closest(".sp-editable-title");
            if (title && !e.shiftKey && !e.ctrlKey && !e.metaKey && !runtime.didDrag) {
                e.preventDefault();
                e.stopPropagation();
                editCardTitle(title);
                return;
            }
            if (e.target.closest(".sp-subpage-badge")) {
                var btnEl: any = e.target.closest("[data-slot]");
                if (btnEl) {
                    var badgeSlot: any = parseInt(btnEl.getAttribute("data-slot"), 10);
                    if (badgeSlot > 0) {
                        enterChildSubpage(state.editingSubpage, badgeSlot);
                        return;
                    }
                }
            }
            var target: any = e.target.closest("[data-pos]");
            if (!target)
                return;
            var pos: any = parseInt(target.getAttribute("data-pos"), 10);
            var c: any = ctx();
            var slot: any = c.grid[pos];
            if (slot > 0) {
                handleBtnClick(e, slot, pos);
            }
            else if (slot === -2) {
                if (runtime.didDrag) {
                    runtime.didDrag = false;
                    return;
                }
                if (isBackExitTarget(e, target)) {
                    exitSubpage();
                }
                else {
                    handleBtnClick(e, slot, pos);
                }
            }
            else if (generatedCardElements.has(target)) {
                const entry = generatedCardElements.get(target)!;
                if (!runtime.didDrag) selectGenerated(pos, entry.card, entry.size, false);
                runtime.didDrag = false;
            }
            else if (slot === 0) {
                if (state.clipboard) {
                    e.preventDefault();
                    e.stopPropagation();
                    showEmpty(e, pos);
                }
                else {
                    addSlot(pos);
                }
            }
        });
        // Context menu delegation
        container.addEventListener("contextmenu", function (this: any, e?: any) {
            if (isConfigLocked()) {
                e.preventDefault();
                return;
            }
            if (e.target.closest(".sp-card-name-input")) return;
            var target: any = e.target.closest("[data-pos]");
            if (!target)
                return;
            e.preventDefault();
            var pos: any = parseInt(target.getAttribute("data-pos"), 10);
            var c: any = ctx();
            var slot: any = c.grid[pos];
            if (slot > 0) {
                showCard(e, slot);
            }
            else if (slot === -2) {
                showBack(e);
            }
            else if (generatedCardElements.has(target)) {
                const entry = generatedCardElements.get(target)!;
                const page = state.editingSubpage;
                showGenerated(e, () => {
                    if (state.editingSubpage === page) selectGenerated(pos, entry.card, entry.size, true);
                }, () => {
                    if (state.editingSubpage !== page) return;
                    if (state.settingsDraft?.generated && !state.settingsDraft.dirty) {
                        state.settingsDraft = null;
                        c.setSelected([]);
                    }
                    void dependencies.nativeTransfers?.hideGenerated(entry.card.entity);
                });
            }
            else if (slot === 0) {
                showEmpty(e, pos);
            }
        });
        // Drag delegation
        container.addEventListener("dragstart", function (this: any, e?: any) {
            if (e.target.closest(".sp-resize-handle,.sp-resizing,.sp-card-name-input")) {
                e.preventDefault();
                return;
            }
            if (isConfigLocked()) {
                e.preventDefault();
                return;
            }
            var target: any = e.target.closest(".sp-btn") || e.target.closest(".sp-back-btn");
            if (!target)
                return;
            var pos: any = parseInt(target.getAttribute("data-pos"), 10);
            runtime.dragSrcPos = pos;
            draggedGeneratedId = generatedCardElements.get(target)?.card.entity;
            if (dependencies.layout.config.dragAnimation)
                runtime.dragSrcEl = target;
            runtime.didDrag = true;
            runtime.dragEnterCount = 0;
            container.classList.add("sp-drag-active");
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", String(pos));
            if (dependencies.layout.config.dragAnimation) {
                requestAnimationFrame(function (this: any) { target.classList.add("sp-dragging"); });
            }
        });
        container.addEventListener("dragend", function (this: any) {
            runtime.dragSrcPos = -1;
            runtime.previewDropIdx = -1;
            runtime.dragEnterCount = 0;
            clearPlaceholder();
            if (runtime.dragSrcEl) {
                runtime.dragSrcEl.classList.remove("sp-dragging");
                runtime.dragSrcEl = null;
            }
            setTimeout(function (this: any) { container.classList.remove("sp-drag-active"); }, 50);
        });
        // Drop zone
        function updatePlaceholder(this: any, cellIdx?: any) {
            if (cellIdx === runtime.previewDropIdx)
                return;
            runtime.previewDropIdx = cellIdx;
            clearPlaceholder();
            var target: any = container.querySelector('[data-pos="' + cellIdx + '"]');
            if (target) {
                runtime.previewPlaceholder = target;
                runtime.previewPlaceholder.classList.add("sp-drop-placeholder");
            }
        }
        container.addEventListener("dragenter", function (this: any, e?: any) {
            if (isConfigLocked())
                return;
            if (runtime.dragSrcPos < 0)
                return;
            e.preventDefault();
            runtime.dragEnterCount++;
        });
        container.addEventListener("dragover", function (this: any, e?: any) {
            if (isConfigLocked())
                return;
            if (runtime.dragSrcPos < 0)
                return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            if (dependencies.layout.config.dragAnimation) {
                pendingCellIdx = getCellFromEvent(e, container);
                if (runtime.dragRafPending)
                    return;
                runtime.dragRafPending = true;
                requestAnimationFrame(function (this: any) {
                    runtime.dragRafPending = false;
                    if (runtime.dragSrcPos < 0)
                        return;
                    updatePlaceholder(pendingCellIdx);
                });
            }
            else {
                updatePlaceholder(getCellFromEvent(e, container));
            }
        });
        container.addEventListener("dragleave", function (this: any) {
            runtime.dragEnterCount--;
            if (runtime.dragEnterCount <= 0) {
                runtime.dragEnterCount = 0;
                runtime.previewDropIdx = -1;
                clearPlaceholder();
            }
        });
        container.addEventListener("drop", function (this: any, e?: any) {
            if (isConfigLocked()) {
                e.preventDefault();
                return;
            }
            e.preventDefault();
            runtime.dragEnterCount = 0;
            var toPos: any = runtime.previewDropIdx;
            runtime.previewDropIdx = -1;
            clearPlaceholder();
            if (runtime.dragSrcEl) {
                runtime.dragSrcEl.classList.remove("sp-dragging");
                runtime.dragSrcEl = null;
            }
            var c: any = ctx();
            if (runtime.dragSrcPos < 0 || toPos < 0 || toPos >= c.maxSlots) {
                runtime.dragSrcPos = -1;
                return;
            }
            if (runtime.dragSrcPos === toPos) {
                runtime.dragSrcPos = -1;
                return;
            }
            const projected = c.isSub && dependencies.nativeTransfers?.available()
                ? generatedPlan(container, [runtime.dragSrcPos, toPos]) : undefined;
            const fromPos = runtime.dragSrcPos;
            const sourceId = projected?.edits.get(projected.grid[fromPos] ?? 0)?.entity;
            runtime.dragSrcPos = -1;
            if (sourceId !== draggedGeneratedId) return;
            const move = planMove(fromPos, toPos, projected);
            if (!move.accepted) return;
            if (dependencies.nativeTransfers?.available()) {
                const order = c.isSub
                    ? serializeSubpageGrid({ ...getSubpage(state.editingSubpage), ...move }).join(",")
                    : serializeGridOrder(move.grid, move.sizes);
                if (projected?.edits.size) void dependencies.nativeTransfers.saveGenerated(projected.edits, order);
                else void dependencies.nativeTransfers.place(order);
                return;
            }
            applyMove(move);
            renderPreview();
            renderButtonSettings();
            c.save();
        });
    }
    function handleBtnClick(this: any, e?: any, slot?: any, pos?: any) {
        if (isConfigLocked())
            return;
        if (runtime.didDrag) {
            runtime.didDrag = false;
            return;
        }
        state.clockBarSelectedItem = "";
        var c: any = ctx();
        if (state.settingsDraft?.generated) {
            state.settingsDraft = null;
            c.setSelected([]);
        }
        if (e.shiftKey || e.ctrlKey || e.metaKey)
            e.preventDefault();
        if (slot === -2) {
            if (c.selected.length === 1 && c.selected[0] === -2) {
                c.setSelected([]);
            }
            else {
                c.setSelected([-2]);
            }
            c.setLastClicked(-1);
            renderPreview();
            renderButtonSettings();
            clearTextSelection();
            return;
        }
        if (e.shiftKey && c.getLastClicked() > 0) {
            var anchorPos: any = c.grid.indexOf(c.getLastClicked());
            if (anchorPos !== -1) {
                var from: any = Math.min(anchorPos, pos);
                var to: any = Math.max(anchorPos, pos);
                var newSel: any = [];
                for (var i: any = from; i <= to; i++) {
                    if (c.grid[i] > 0)
                        newSel.push(c.grid[i]);
                }
                c.setSelected(newSel);
                renderPreview();
                hideSettingsOverlay();
                clearTextSelection();
                return;
            }
        }
        if (e.ctrlKey || e.metaKey) {
            var idx: any = c.selected.indexOf(slot);
            if (idx !== -1) {
                c.selected.splice(idx, 1);
            }
            else {
                c.selected.push(slot);
                c.setLastClicked(slot);
            }
            renderPreview();
            hideSettingsOverlay();
            clearTextSelection();
            return;
        }
        if (c.selected.length === 1 && c.selected[0] === slot) {
            c.setSelected([]);
            c.setLastClicked(-1);
        }
        else {
            c.setSelected([slot]);
            c.setLastClicked(slot);
        }
        renderPreview();
        renderButtonSettings();
    }
    function selectButton(this: any, slot?: any) {
        if (isConfigLocked())
            return;
        if (slot < 1) {
            state.selectedSlots = [];
        }
        else {
            state.selectedSlots = [slot];
            state.lastClickedSlot = slot;
        }
        renderPreview();
        renderButtonSettings();
    }
    // ── Button management (unified) ────────────────────────────────────────
    function firstFreeSlot(this: any) {
        var used: any = {};
        state.grid.forEach(function (this: any, s?: any) {
            if (s > 0)
                used[s] = true;
        });
        for (var i: any = 1; i <= dependencies.layout.previewSlots; i++) {
            if (!used[i])
                return i;
        }
        return -1;
    }
    function firstFreeCell(this: any, afterPos?: any) {
        var start: any = afterPos != null ? afterPos : 0;
        for (var i: any = 0; i < dependencies.layout.previewSlots; i++) {
            var candidate: any = (start + i) % dependencies.layout.previewSlots;
            if (state.grid[candidate] === 0)
                return candidate;
        }
        return -1;
    }
    function emptyButtonConfig(this: any, type?: any) {
        return EspDesktopModel.emptyCardConfig(type);
    }
    function newCardDraftKey(this: any, isSub?: any, homeSlot?: any, pos?: any, slot?: any) {
        return cardEditorDraftController.newDraft({ slot: slot, homeSlot: homeSlot, isSub: isSub, pos: pos }).key;
    }
    function beginNewCardDraft(this: any, pos?: any, slot?: any, isSub?: any) {
        state.settingsDraft = cardEditorDraftController.newDraft({
            slot: slot, homeSlot: state.editingSubpage, isSub: isSub, pos: pos,
        });
        if (isSub) {
            state.subpageSelectedSlots = [slot];
            state.subpageLastClicked = slot;
        }
        else {
            state.selectedSlots = [slot];
            state.lastClickedSlot = slot;
        }
        renderPreview();
        renderButtonSettings(true);
    }
    function addSlot(this: any, pos?: any) {
        if (isConfigLocked())
            return;
        var c: any = ctx();
        if (pos < 0 || pos >= c.maxSlots || c.grid[pos] !== 0)
            return;
        if (c.isSub) {
            var sp: any = getSubpage(state.editingSubpage);
            var newSlot: any = subpageFirstFreeSlot(sp);
            beginNewCardDraft(pos, newSlot, true);
        }
        else {
            var slot: any = firstFreeSlot();
            if (slot < 0)
                return;
            beginNewCardDraft(pos, slot, false);
        }
    }
    function addSubpageSlot(this: any, pos?: any) {
        if (isConfigLocked())
            return;
        var c: any = ctx();
        if (c.isSub)
            return;
        var slot: any = firstFreeSlot();
        if (slot < 0)
            return;
        var folderButton: any = emptyButtonConfig("subpage");
        folderButton.icon = "Folder Outline";
        state.buttons[slot - 1] = folderButton;
        state.grid[pos] = slot;
        state.subpages[slot] = { order: [], buttons: [], grid: [], sizes: {} };
        buildSubpageGrid(state.subpages[slot]);
        dependencies.requestApi.postText(entityName("button_order"), serializeGrid(state.grid));
        configPersistence.saveButtonConfig(slot);
        configPersistence.saveSubpageEntity(slot);
        selectButton(slot);
        renderButtonSettings(true);
    }
    function duplicateButton(this: any, srcSlot?: any) {
        if (dependencies.nativeTransfers?.available()) { void dependencies.nativeTransfers.duplicate(Number(srcSlot)); return; }
        if (isConfigLocked())
            return;
        var src: any = state.buttons[srcSlot - 1];
        if (!src)
            return;
        if (duplicateRequiresHomeAssistant(src, state.subpages[srcSlot])) {
            blockHomeAssistantDuplicate();
            return;
        }
        var newSlot: any = firstFreeSlot();
        if (newSlot < 0)
            return;
        var srcSz: any = state.sizes[srcSlot] || 1;
        var srcPos: any = state.grid.indexOf(srcSlot);
        var placement: any = findDuplicatePlacement(state.grid, srcPos + 1, srcSz, dependencies.layout.previewSlots);
        if (placement.pos < 0)
            return;
        var extraImageCards: any = isImageCard(src) ? 1 : 0;
        if (state.subpages[srcSlot])
            extraImageCards += imageCardCountInSubpage(state.subpages[srcSlot]);
        if (!canAddImageCards(extraImageCards)) {
            showImageCardLimitBanner();
            return;
        }
        state.buttons[newSlot - 1] = {
            entity: src.entity, label: src.label, icon: src.icon,
            icon_on: src.icon_on, sensor: src.sensor, unit: src.unit,
            type: src.type || "", precision: src.precision || "",
            options: src.options || "",
        };
        if (placement.size === 1)
            delete state.sizes[newSlot];
        else
            state.sizes[newSlot] = placement.size;
        placeSlotAt(state.grid, newSlot, placement.pos, placement.size);
        if (state.subpages[srcSlot]) {
            var spJson: any = serializeSubpageConfig(state.subpages[srcSlot]);
            var spCopy: any = parseSubpageConfig(spJson);
            spCopy.sizes = {};
            buildSubpageGrid(spCopy);
            state.subpages[newSlot] = spCopy;
        }
        dependencies.requestApi.postText(entityName("button_order"), serializeGrid(state.grid));
        configPersistence.saveButtonConfig(newSlot);
        configPersistence.saveSubpageEntity(newSlot);
        state.selectedSlots = [newSlot];
        state.lastClickedSlot = newSlot;
        renderPreview();
    }
    function duplicateSubpageButton(this: any, srcSlot?: any) {
        if (dependencies.nativeTransfers?.available()) { void dependencies.nativeTransfers.duplicate(Number(srcSlot)); return; }
        if (isConfigLocked())
            return;
        var homeSlot: any = state.editingSubpage;
        var sp: any = getSubpage(homeSlot);
        var src: any = sp.buttons[srcSlot - 1];
        if (!src)
            return;
        if (duplicateRequiresHomeAssistant(src)) {
            blockHomeAssistantDuplicate();
            return;
        }
        var newSlot: any = subpageFirstFreeSlot(sp);
        while (sp.buttons.length < newSlot) {
            sp.buttons.push(emptyButtonConfig());
        }
        var srcSz: any = sp.sizes[srcSlot] || 1;
        var srcPos: any = sp.grid.indexOf(srcSlot);
        var placement: any = findDuplicatePlacement(sp.grid, srcPos + 1, srcSz, dependencies.layout.previewSlots);
        if (placement.pos < 0)
            return;
        if (!canAddImageCards(isImageCard(src) ? 1 : 0)) {
            showImageCardLimitBanner();
            return;
        }
        sp.buttons[newSlot - 1] = {
            entity: src.entity, label: src.label, icon: src.icon,
            icon_on: src.icon_on, sensor: src.sensor, unit: src.unit,
            type: src.type || "", precision: src.precision || "",
            options: src.options || "",
        };
        if (placement.size === 1)
            delete sp.sizes[newSlot];
        else
            sp.sizes[newSlot] = placement.size;
        placeSlotAt(sp.grid, newSlot, placement.pos, placement.size);
        sp.order = serializeSubpageGrid(sp);
        saveSubpageConfig(homeSlot);
        state.subpageSelectedSlots = [newSlot];
        state.subpageLastClicked = newSlot;
        renderPreview();
    }
    function deleteSlot(this: any, slot?: any) {
        if (dependencies.nativeTransfers?.available()) { void dependencies.nativeTransfers.delete([Number(slot)]); return; }
        if (isConfigLocked())
            return;
        var c: any = ctx();
        for (var i: any = 0; i < c.maxSlots; i++) {
            if (c.grid[i] === slot) {
                c.grid[i] = 0;
                var cells: any = coveredCells(i, c.sizes[slot] || 1, c.maxSlots, dependencies.layout.gridCols, false);
                for (var ci: any = 0; ci < cells.length; ci++) {
                    if (c.grid[cells[ci]] === -1)
                        c.grid[cells[ci]] = 0;
                }
                break;
            }
        }
        delete c.sizes[slot];
        var selIdx: any = c.selected.indexOf(slot);
        if (selIdx !== -1)
            c.selected.splice(selIdx, 1);
        if (c.isSub) {
            var sp: any = getSubpage(state.editingSubpage);
            if (slot >= 1 && slot <= sp.buttons.length) {
                sp.buttons[slot - 1] = emptyButtonConfig();
            }
            sp.order = serializeSubpageGrid(sp);
            state.subpageLastClicked = -1;
            saveSubpageConfig(state.editingSubpage);
        }
        else {
            dependencies.requestApi.postText(entityName("button_order"), serializeGrid(state.grid));
            state.buttons[slot - 1] = emptyButtonConfig();
            delete state.subpages[slot];
            configPersistence.saveButtonConfig(slot);
            configPersistence.saveSubpageEntity(slot);
        }
        renderPreview();
        renderButtonSettings();
    }
    function deleteButtons(this: any, slots?: any) {
        if (dependencies.nativeTransfers?.available()) { void dependencies.nativeTransfers.delete(slots.filter((slot: number) => slot > 0).map(Number)); return; }
        if (isConfigLocked())
            return;
        var c: any = ctx();
        for (var i: any = 0; i < c.maxSlots; i++) {
            if (slots.indexOf(c.grid[i]) !== -1) {
                var cells: any = coveredCells(i, c.sizes[c.grid[i]] || 1, c.maxSlots, dependencies.layout.gridCols, false);
                for (var ci: any = 0; ci < cells.length; ci++) {
                    if (c.grid[cells[ci]] === -1)
                        c.grid[cells[ci]] = 0;
                }
                c.grid[i] = 0;
            }
        }
        slots.forEach(function (this: any, slot?: any) { delete c.sizes[slot]; });
        c.setSelected([]);
        c.setLastClicked(-1);
        if (c.isSub) {
            var sp: any = getSubpage(state.editingSubpage);
            slots.forEach(function (this: any, slot?: any) {
                if (slot >= 1 && slot <= sp.buttons.length) {
                    sp.buttons[slot - 1] = emptyButtonConfig();
                }
            });
            sp.order = serializeSubpageGrid(sp);
            saveSubpageConfig(state.editingSubpage);
        }
        else {
            slots.forEach(function (this: any, slot?: any) {
                state.buttons[slot - 1] = emptyButtonConfig();
                delete state.subpages[slot];
                configPersistence.saveButtonConfig(slot);
                configPersistence.saveSubpageEntity(slot);
            });
            dependencies.requestApi.postText(entityName("button_order"), serializeGrid(state.grid));
        }
        renderPreview();
        renderButtonSettings();
    }
    return {
        clearPlaceholder,
        setup: setupPreviewEvents,
        addSlot,
        addSubpageSlot,
        duplicateButton,
        duplicateSubpageButton,
        deleteSlot,
        saveGeneratedDraft,
        deleteButtons,
        emptyButtonConfig,
    };
}
