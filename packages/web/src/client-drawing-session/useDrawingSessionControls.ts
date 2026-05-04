import { DRAWING_BRUSH_SIZES, DRAWING_COLORS, DRAWING_ERASER_SIZE, type DrawingAction, type DrawingTool } from '@7ito/sketcherson-common/drawing';
import type { ApiResult } from '@7ito/sketcherson-common/room';
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { getAdjustedBrushSize } from './brushControls';

const PALETTE_COLS = 12;

export interface UseDrawingSessionControlsOptions<TSuccess> {
  canDraw: boolean;
  canRedo: boolean;
  undoRedoEnabled: boolean;
  submitAction(action: DrawingAction): Promise<ApiResult<TSuccess>>;
}

export interface DrawingSessionControls {
  selectedTool: DrawingTool;
  selectedColor: string;
  selectedSize: number;
  toolSize: number;
  actionError: string;
  setSelectedTool: Dispatch<SetStateAction<DrawingTool>>;
  setSelectedColor: Dispatch<SetStateAction<string>>;
  setSelectedSize: Dispatch<SetStateAction<number>>;
  clearActionError(): void;
  undo(): void;
  redo(): void;
  clear(): void;
}

interface DrawingSessionControlState<TSuccess> extends DrawingSessionControls {
  submitAction(action: DrawingAction): Promise<ApiResult<TSuccess>>;
}

export function useDrawingSessionControls<TSuccess>({
  canDraw,
  canRedo,
  undoRedoEnabled,
  submitAction: submitActionOption,
}: UseDrawingSessionControlsOptions<TSuccess>): DrawingSessionControlState<TSuccess> {
  const [selectedTool, setSelectedTool] = useState<DrawingTool>('pen');
  const [selectedColor, setSelectedColor] = useState<string>(DRAWING_COLORS[0]);
  const [selectedSize, setSelectedSize] = useState<number>(DRAWING_BRUSH_SIZES[1]);
  const [actionError, setActionError] = useState('');
  const toolSize = selectedTool === 'eraser' ? DRAWING_ERASER_SIZE : selectedSize;

  const submitAction = async (action: DrawingAction): Promise<ApiResult<TSuccess>> => {
    const result = await submitActionOption(action);
    if (!result.ok) {
      setActionError(result.error.message);
    }
    return result;
  };

  const clearActionError = () => setActionError('');
  const undo = () => {
    if (!undoRedoEnabled) return;
    clearActionError();
    void submitAction({ type: 'undo' });
  };
  const redo = () => {
    if (!canRedo) return;
    clearActionError();
    void submitAction({ type: 'redo' });
  };
  const clear = () => {
    if (!undoRedoEnabled) return;
    clearActionError();
    void submitAction({ type: 'clear' });
  };

  useEffect(() => {
    if (!canDraw) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.ctrlKey || e.metaKey) {
        const key = e.key.toLowerCase();

        if (key === 'z' && e.shiftKey) {
          e.preventDefault();
          redo();
        } else if (key === 'z') {
          e.preventDefault();
          undo();
        } else if (key === 'y') {
          e.preventDefault();
          redo();
        }
        return;
      }

      switch (e.key) {
        case 'b':
        case '1':
          setSelectedTool('pen');
          break;
        case 'e':
        case '2':
          setSelectedTool('eraser');
          break;
        case 'f':
        case '3':
          setSelectedTool('fill');
          break;
        case '=':
        case '+':
          setSelectedSize((prev) => getAdjustedBrushSize(prev, 1));
          break;
        case '-':
          setSelectedSize((prev) => getAdjustedBrushSize(prev, -1));
          break;
        case 'w':
        case 'a':
        case 's':
        case 'd':
        case 'ArrowUp':
        case 'ArrowLeft':
        case 'ArrowDown':
        case 'ArrowRight':
          e.preventDefault();
          setSelectedColor((prev) => getKeyboardPaletteColor(prev, e.key));
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canDraw, canRedo, undoRedoEnabled, submitActionOption]);

  return {
    selectedTool,
    selectedColor,
    selectedSize,
    toolSize,
    actionError,
    setSelectedTool,
    setSelectedColor,
    setSelectedSize,
    clearActionError,
    undo,
    redo,
    clear,
    submitAction,
  };
}

function getKeyboardPaletteColor(currentColor: string, key: string): string {
  const idx = DRAWING_COLORS.indexOf(currentColor as typeof DRAWING_COLORS[number]);
  if (idx === -1) return currentColor;

  const row = Math.floor(idx / PALETTE_COLS);
  const col = idx % PALETTE_COLS;
  let newRow = row;
  let newCol = col;
  const rows = Math.ceil(DRAWING_COLORS.length / PALETTE_COLS);
  if (key === 'w' || key === 'ArrowUp') newRow = (row - 1 + rows) % rows;
  else if (key === 's' || key === 'ArrowDown') newRow = (row + 1) % rows;
  else if (key === 'a' || key === 'ArrowLeft') newCol = (col - 1 + PALETTE_COLS) % PALETTE_COLS;
  else if (key === 'd' || key === 'ArrowRight') newCol = (col + 1) % PALETTE_COLS;

  const newIdx = newRow * PALETTE_COLS + newCol;
  return DRAWING_COLORS[newIdx] ?? currentColor;
}
