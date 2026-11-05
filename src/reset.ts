import type { DrawingItem } from "./model";

// Remove only this drawing before clearing history, so storage errors leave the open plan recoverable.
export function clearSavedDrawing(storage: Pick<Storage, "removeItem">, key: string, undo: DrawingItem[][], redo: DrawingItem[][]): void {
  storage.removeItem(key);
  undo.length = 0;
  redo.length = 0;
}
