import { state } from "../state/app_instance";
import type { PreviewPlacementController, PreviewPlacementResult } from "../features/preview_placement_controller";
import { closestGridCell, swapGridCell } from "../features/preview";
import {
    canPlaceSlotAt as canPlaceSlotAtInGrid,
    findDuplicatePlacement as findDuplicatePlacementInGrid,
    findPlacementCell as findPlacementCellInGrid,
    placeOrderedGridEntries as placeOrderedGridEntriesInGrid,
    placeSlotAt as placeSlotAtInGrid,
    resolveSpanPosition,
} from "../features/preview_grid";
import type { ApplicationLayoutState } from "./application_context";
import type { ConfigCodecFeature } from "./config_codec";
import type { GridFeature } from "./grid";
export interface PreviewGridPlacementDependencies {
    readonly controller: PreviewPlacementController;
    readonly layout: ApplicationLayoutState;
    readonly codec: ConfigCodecFeature;
    readonly grid: Pick<GridFeature, "ctx">;
}
export interface PreviewGridPlacementFeature {
    resolveSpanPos(position?: any): any;
    getCellFromEvent(event?: any, container?: any): any;
    planMove(fromPosition: number, toPosition: number): PreviewPlacementResult;
    applyMove(result: PreviewPlacementResult): void;
    canPlaceSlotAt(grid?: any, position?: any, size?: any, maxSlots?: any): boolean;
    findPlacementCell(grid?: any, start?: any, size?: any, maxSlots?: any): any;
    findDuplicatePlacement(grid?: any, start?: any, size?: any, maxSlots?: any): any;
    placeSlotAt(grid?: any, slot?: any, position?: any, size?: any): void;
    placeOrderedGridEntries(entries?: any, sizes?: any, maxSlots?: any): any;
}

export function createPreviewGridPlacementFeature(
    dependencies: PreviewGridPlacementDependencies,
): PreviewGridPlacementFeature {
    const previewPlacementController = dependencies.controller;
    const { getSubpage } = dependencies.codec;
    const { ctx } = dependencies.grid;
    // ── Preview Grid Placement ────────────────────────────────────────
    function resolveSpanPos(this: any, pos?: any) {
        var c: any = ctx();
        return resolveSpanPosition(c.grid, c.sizes, pos, c.maxSlots, dependencies.layout.gridCols);
    }
    function getCellFromEvent(this: any, e?: any, container?: any) {
        if (dependencies.layout.config.dragMode === "swap") {
            var rect: any = container.getBoundingClientRect();
            return resolveSpanPos(swapGridCell({ x: e.clientX, y: e.clientY }, { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }, dependencies.layout.gridCols, dependencies.layout.gridRows));
        }
        var children: any = container.children;
        var cells: any = [];
        for (var i: any = 0; i < children.length; i++) {
            var r: any = children[i].getBoundingClientRect();
            var pos: any = parseInt(children[i].getAttribute("data-pos"), 10);
            if (isNaN(pos))
                continue;
            cells.push({ pos: pos, left: r.left, top: r.top, right: r.right, bottom: r.bottom });
        }
        return closestGridCell({ x: e.clientX, y: e.clientY }, cells);
    }
    function planMove(fromPos: number, toPos: number): PreviewPlacementResult {
        const context = ctx();
        const columns = dependencies.layout.gridCols;
        const selected = previewPlacementController.moveSelected(context, fromPos, toPos, columns);
        return selected.accepted ? selected : previewPlacementController.moveSingle(context, fromPos, toPos, columns);
    }
    function applyMove(result: PreviewPlacementResult): void {
        if (state.editingSubpage) {
            const subpage = getSubpage(state.editingSubpage);
            subpage.grid = result.grid;
            subpage.sizes = result.sizes;
        } else {
            state.grid = result.grid;
            state.sizes = result.sizes;
        }
    }
    function canPlaceSlotAt(this: any, grid?: any, pos?: any, size?: any, maxSlots?: any) {
        return canPlaceSlotAtInGrid(grid, pos, size, maxSlots, dependencies.layout.gridCols);
    }
    function findPlacementCell(this: any, grid?: any, start?: any, size?: any, maxSlots?: any) {
        return findPlacementCellInGrid(grid, start, size, maxSlots, dependencies.layout.gridCols);
    }
    function findDuplicatePlacement(this: any, grid?: any, start?: any, size?: any, maxSlots?: any) {
        return findDuplicatePlacementInGrid(grid, start, size, maxSlots, dependencies.layout.gridCols);
    }
    function placeSlotAt(this: any, grid?: any, slot?: any, pos?: any, size?: any) {
        placeSlotAtInGrid(grid, slot, pos, size, dependencies.layout.gridCols);
    }
    function placeOrderedGridEntries(this: any, entries?: any, sizes?: any, maxSlots?: any) {
        return placeOrderedGridEntriesInGrid(entries, sizes, maxSlots, dependencies.layout.gridCols);
    }
    return {
        resolveSpanPos,
        getCellFromEvent,
        planMove,
        applyMove,
        canPlaceSlotAt,
        findPlacementCell,
        findDuplicatePlacement,
        placeSlotAt,
        placeOrderedGridEntries,
    };
}
