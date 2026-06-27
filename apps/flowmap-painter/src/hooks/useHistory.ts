import { useCallback, useRef, useState } from "react";

const MAX_HISTORY = 40;

export interface HistoryHandle {
  canUndo: boolean;
  canRedo: boolean;
  snapshot: () => void;
  undo: () => void;
  redo: () => void;
  clear: () => void;
}

/**
 * Undo/Redo history backed by ImageData snapshots.
 * Call snapshot() on pointerdown (before each stroke) to record pre-stroke state.
 * Undo restores the state before the last stroke.
 */
export function useHistory(
  canvasRef: React.RefObject<HTMLCanvasElement | null>
): HistoryHandle {
  const [undoStack, setUndoStack] = useState<ImageData[]>([]);
  const [redoStack, setRedoStack] = useState<ImageData[]>([]);

  // Keep stacks in refs for access from imperative code without stale closures
  const undoRef = useRef(undoStack);
  const redoRef = useRef(redoStack);
  undoRef.current = undoStack;
  redoRef.current = redoStack;

  const snapshot = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const ctx = canvas.getContext("2d");
    if (ctx === null) return;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);

    setUndoStack((prev) => {
      const next = [...prev, data];
      if (next.length > MAX_HISTORY) next.splice(0, next.length - MAX_HISTORY);
      return next;
    });
    setRedoStack([]);
  }, [canvasRef]);

  const undo = useCallback(() => {
    const stack = undoRef.current;
    if (stack.length === 0) return;
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const ctx = canvas.getContext("2d");
    if (ctx === null) return;

    // Take snapshot of current state for redo, then restore previous
    const currentData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const previous = stack[stack.length - 1];
    if (previous === undefined) return;

    ctx.putImageData(previous, 0, 0);
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev, currentData]);
  }, [canvasRef]);

  const redo = useCallback(() => {
    const stack = redoRef.current;
    if (stack.length === 0) return;
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const ctx = canvas.getContext("2d");
    if (ctx === null) return;

    // Take snapshot of current state for undo, then apply redo state
    const currentData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const next = stack[stack.length - 1];
    if (next === undefined) return;

    ctx.putImageData(next, 0, 0);
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [...prev, currentData]);
  }, [canvasRef]);

  const clear = useCallback(() => {
    setUndoStack([]);
    setRedoStack([]);
  }, []);

  return {
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    snapshot,
    undo,
    redo,
    clear
  };
}
