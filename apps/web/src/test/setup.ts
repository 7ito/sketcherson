import '@testing-library/jest-dom';

Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
  value() {
    this.open = true;
  },
});

Object.defineProperty(HTMLDialogElement.prototype, 'close', {
  value() {
    this.open = false;
  },
});

globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  value: () => ({
    clearRect: () => undefined,
    fillRect: () => undefined,
    beginPath: () => undefined,
    arc: () => undefined,
    fill: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    stroke: () => undefined,
    save: () => undefined,
    restore: () => undefined,
    setTransform: () => undefined,
    getImageData: () => ({ data: new Uint8ClampedArray(0) }),
    createImageData: (width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4), width, height }),
    putImageData: () => undefined,
    drawImage: () => undefined,
    set fillStyle(_value: string) {
      return undefined;
    },
    set strokeStyle(_value: string) {
      return undefined;
    },
    set lineWidth(_value: number) {
      return undefined;
    },
    set lineCap(_value: CanvasLineCap) {
      return undefined;
    },
    set lineJoin(_value: CanvasLineJoin) {
      return undefined;
    },
    set imageSmoothingEnabled(_value: boolean) {
      return undefined;
    },
  }),
});
