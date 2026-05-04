import type { DrawingState, DrawingStrokeOperation } from '@7ito/sketcherson-common/drawing';
import { describe, expect, it } from 'vitest';
import { getIncrementalDrawingUpdate } from '../lib/drawing';

function buildStroke(overrides: Partial<DrawingStrokeOperation> & Pick<DrawingStrokeOperation, 'id'>): DrawingStrokeOperation {
  return {
    kind: 'stroke',
    id: overrides.id,
    tool: overrides.tool ?? 'pen',
    color: overrides.color ?? '#101a35',
    size: overrides.size ?? 6,
    points: overrides.points ?? [{ x: 100, y: 100 }],
  };
}

function buildDrawingState(overrides?: Partial<DrawingState>): DrawingState {
  return {
    width: 800,
    height: 600,
    operations: [],
    undoneOperations: [],
    activeStrokes: [],
    revision: 0,
    snapshotDataUrl: null,
    ...overrides,
  };
}

describe('getIncrementalDrawingUpdate', () => {
  it('detects beginStroke from an added active stroke', () => {
    const nextStroke = buildStroke({ id: 'stroke-1', points: [{ x: 120, y: 140 }] });

    const update = getIncrementalDrawingUpdate(
      buildDrawingState({ revision: 0 }),
      buildDrawingState({ revision: 1, activeStrokes: [nextStroke] }),
    );

    expect(update).toEqual({
      type: 'beginStroke',
      stroke: nextStroke,
    });
  });

  it('detects extendStroke and keeps only the newly appended segment', () => {
    const previousStroke = buildStroke({
      id: 'stroke-1',
      points: [
        { x: 100, y: 100 },
        { x: 120, y: 120 },
      ],
    });
    const nextStroke = buildStroke({
      id: 'stroke-1',
      points: [
        { x: 100, y: 100 },
        { x: 120, y: 120 },
        { x: 140, y: 145 },
        { x: 160, y: 170 },
      ],
    });

    const update = getIncrementalDrawingUpdate(
      buildDrawingState({ revision: 2, activeStrokes: [previousStroke] }),
      buildDrawingState({ revision: 3, activeStrokes: [nextStroke] }),
    );

    expect(update).toEqual({
      type: 'extendStroke',
      stroke: {
        kind: 'stroke',
        id: 'stroke-1',
        tool: 'pen',
        color: '#101a35',
        size: 6,
        points: [
          { x: 120, y: 120 },
          { x: 140, y: 145 },
          { x: 160, y: 170 },
        ],
      },
    });
  });

  it('treats endStroke as a visual noop when the committed stroke was already painted live', () => {
    const activeStrokeA = buildStroke({
      id: 'stroke-a',
      points: [
        { x: 100, y: 100 },
        { x: 180, y: 180 },
      ],
    });
    const activeStrokeB = buildStroke({
      id: 'stroke-b',
      color: '#ff0000',
      points: [
        { x: 180, y: 100 },
        { x: 100, y: 180 },
      ],
    });

    const update = getIncrementalDrawingUpdate(
      buildDrawingState({
        revision: 4,
        activeStrokes: [activeStrokeA, activeStrokeB],
      }),
      buildDrawingState({
        revision: 5,
        operations: [activeStrokeB],
        activeStrokes: [activeStrokeA],
      }),
    );

    expect(update).toEqual({ type: 'noop' });
  });

  it('falls back to a full rerender when revisions skip', () => {
    const update = getIncrementalDrawingUpdate(
      buildDrawingState({ revision: 1 }),
      buildDrawingState({ revision: 3 }),
    );

    expect(update).toEqual({ type: 'full-rerender' });
  });
});
