/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { Rect } from '../types';

interface ImageDisplayProps {
  imageSrc: string;
  onSelect: (originalRect: Rect, screenRect: Rect, canvasDataUrl: string) => void;
  isEnhancing: boolean;
  historicalSelection?: Rect | null;
  useFixedSelectionBox: boolean;
  fixedSelectionSizePercentage: number;
}

export const ImageDisplay: React.FC<ImageDisplayProps> = ({
  imageSrc,
  onSelect,
  isEnhancing,
  historicalSelection,
  useFixedSelectionBox,
  fixedSelectionSizePercentage,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [selection, setSelection] = useState<Rect | null>(null);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [hoverPoint, setHoverPoint] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageSrc;
    img.onload = () => setImage(img);
  }, [imageSrc]);

  const getCanvasScale = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) {
      return { scale: 1, offsetX: 0, offsetY: 0, dWidth: 0, dHeight: 0 };
    }

    const { width: canvasWidth, height: canvasHeight } = canvas.getBoundingClientRect();
    const canvasAspect = canvasWidth / canvasHeight;
    const imageAspect = image.naturalWidth / image.naturalHeight;

    let dWidth: number;
    let dHeight: number;

    if (canvasAspect > imageAspect) {
      dHeight = canvasHeight;
      dWidth = dHeight * imageAspect;
    } else {
      dWidth = canvasWidth;
      dHeight = dWidth / imageAspect;
    }

    const offsetX = (canvasWidth - dWidth) / 2;
    const offsetY = (canvasHeight - dHeight) / 2;
    const scale = dWidth / image.naturalWidth;

    return { scale, offsetX, offsetY, dWidth, dHeight };
  }, [image]);

  const computeFixedRectFromPoint = useCallback(
    (pos: { x: number; y: number }) => {
      if (!image) return null;
      const { scale, offsetX, offsetY, dWidth, dHeight } = getCanvasScale();

      if (
        pos.x < offsetX ||
        pos.x > offsetX + dWidth ||
        pos.y < offsetY ||
        pos.y > offsetY + dHeight
      ) {
        return null;
      }

      const originalClickX = (pos.x - offsetX) / scale;
      const originalClickY = (pos.y - offsetY) / scale;

      const boxWidth = image.naturalWidth * fixedSelectionSizePercentage;
      const boxHeight = image.naturalHeight * fixedSelectionSizePercentage;

      let originalX = originalClickX - boxWidth / 2;
      let originalY = originalClickY - boxHeight / 2;

      if (originalX < 0) originalX = 0;
      if (originalY < 0) originalY = 0;
      if (originalX + boxWidth > image.naturalWidth) {
        originalX = image.naturalWidth - boxWidth;
      }
      if (originalY + boxHeight > image.naturalHeight) {
        originalY = image.naturalHeight - boxHeight;
      }

      const originalRect: Rect = {
        x: originalX,
        y: originalY,
        w: boxWidth,
        h: boxHeight,
      };

      const screenRect: Rect = {
        x: originalRect.x * scale + offsetX,
        y: originalRect.y * scale + offsetY,
        w: originalRect.w * scale,
        h: originalRect.h * scale,
      };

      return { originalRect, screenRect };
    },
    [image, getCanvasScale, fixedSelectionSizePercentage]
  );

  const drawReticleOverlay = (
    ctx: CanvasRenderingContext2D,
    rect: Rect,
    color: string,
    label?: string
  ) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    ctx.setLineDash([]);

    // Draw corner brackets for mobile visibility
    const bracketLen = Math.min(14, rect.w * 0.25, rect.h * 0.25);
    ctx.lineWidth = 3;
    ctx.beginPath();
    // Top-left
    ctx.moveTo(rect.x, rect.y + bracketLen);
    ctx.lineTo(rect.x, rect.y);
    ctx.lineTo(rect.x + bracketLen, rect.y);
    // Top-right
    ctx.moveTo(rect.x + rect.w - bracketLen, rect.y);
    ctx.lineTo(rect.x + rect.w, rect.y);
    ctx.lineTo(rect.x + rect.w, rect.y + bracketLen);
    // Bottom-right
    ctx.moveTo(rect.x + rect.w, rect.y + rect.h - bracketLen);
    ctx.lineTo(rect.x + rect.w, rect.y + rect.h);
    ctx.lineTo(rect.x + rect.w - bracketLen, rect.y + rect.h);
    // Bottom-left
    ctx.moveTo(rect.x + bracketLen, rect.y + rect.h);
    ctx.lineTo(rect.x, rect.y + rect.h);
    ctx.lineTo(rect.x, rect.y + rect.h - bracketLen);
    ctx.stroke();

    if (label) {
      ctx.font = '600 11px "JetBrains Mono", monospace';
      const textMetrics = ctx.measureText(label);
      const labelY = Math.max(18, rect.y - 6);
      ctx.fillStyle = 'rgba(9, 13, 22, 0.85)';
      ctx.fillRect(rect.x - 1, labelY - 13, textMetrics.width + 8, 16);
      ctx.fillStyle = color;
      ctx.fillText(label, rect.x + 3, labelY - 1);
    }
    ctx.restore();
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas || !image) return;

    const { width: cssWidth, height: cssHeight } = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    const { scale, offsetX, offsetY, dWidth, dHeight } = getCanvasScale();
    ctx.drawImage(image, offsetX, offsetY, dWidth, dHeight);

    if (selection && selection.w > 2 && selection.h > 2) {
      const info = `${Math.round(selection.w)}×${Math.round(selection.h)}`;
      drawReticleOverlay(ctx, selection, '#10B981', info);
    } else if (useFixedSelectionBox && hoverPoint && !isEnhancing) {
      const preview = computeFixedRectFromPoint(hoverPoint);
      if (preview) {
        drawReticleOverlay(ctx, preview.screenRect, '#34D399', 'ENHANCE');
      }
    } else if (historicalSelection) {
      const screenRect: Rect = {
        x: historicalSelection.x * scale + offsetX,
        y: historicalSelection.y * scale + offsetY,
        w: historicalSelection.w * scale,
        h: historicalSelection.h * scale,
      };
      drawReticleOverlay(ctx, screenRect, 'rgba(248, 250, 252, 0.75)', 'PREV. ZOOM');
    }
  }, [
    image,
    selection,
    getCanvasScale,
    historicalSelection,
    useFixedSelectionBox,
    hoverPoint,
    isEnhancing,
    computeFixedRectFromPoint,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      if (parent) {
        const { width, height } = parent.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;

        canvas.width = width * dpr;
        canvas.height = height * dpr;

        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }

        draw();
      }
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [draw, image]);

  const getRelativePoint = (clientX: number, clientY: number): { x: number; y: number } => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const triggerFixedSelection = (pos: { x: number; y: number }) => {
    if (!image) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const computed = computeFixedRectFromPoint(pos);
    if (!computed) return;

    const { originalRect, screenRect } = computed;

    // Draw clean green selection box on canvas before capturing data URL for Gemini Vision
    const { offsetX, offsetY, dWidth, dHeight } = getCanvasScale();
    const { width: cssWidth, height: cssHeight } = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    ctx.drawImage(image, offsetX, offsetY, dWidth, dHeight);

    ctx.strokeStyle = '#39FF14';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(screenRect.x, screenRect.y, screenRect.w, screenRect.h);
    ctx.setLineDash([]);

    const canvasDataUrl = canvas.toDataURL('image/png');
    setHoverPoint(null);
    draw();

    onSelect(originalRect, screenRect, canvasDataUrl);
  };

  const startInteraction = (pos: { x: number; y: number }) => {
    if (isEnhancing) return;

    if (useFixedSelectionBox) {
      triggerFixedSelection(pos);
    } else {
      const { offsetX, offsetY, dWidth, dHeight } = getCanvasScale();
      const clampedX = Math.max(offsetX, Math.min(offsetX + dWidth, pos.x));
      const clampedY = Math.max(offsetY, Math.min(offsetY + dHeight, pos.y));
      setStartPoint({ x: clampedX, y: clampedY });
      setSelection({ x: clampedX, y: clampedY, w: 0, h: 0 });
    }
  };

  const moveInteraction = (pos: { x: number; y: number }) => {
    if (isEnhancing) return;

    if (useFixedSelectionBox) {
      setHoverPoint(pos);
      return;
    }

    if (!startPoint) return;
    const { offsetX, offsetY, dWidth, dHeight } = getCanvasScale();
    const clampedX = Math.max(offsetX, Math.min(offsetX + dWidth, pos.x));
    const clampedY = Math.max(offsetY, Math.min(offsetY + dHeight, pos.y));

    const x = Math.min(clampedX, startPoint.x);
    const y = Math.min(clampedY, startPoint.y);
    const w = Math.abs(clampedX - startPoint.x);
    const h = Math.abs(clampedY - startPoint.y);
    setSelection({ x, y, w, h });
  };

  const endInteraction = () => {
    if (useFixedSelectionBox) return;

    if (!selection || !image || selection.w < 14 || selection.h < 14 || isEnhancing) {
      setStartPoint(null);
      setSelection(null);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const { scale, offsetX, offsetY } = getCanvasScale();
    const originalRect: Rect = {
      x: Math.max(0, (selection.x - offsetX) / scale),
      y: Math.max(0, (selection.y - offsetY) / scale),
      w: selection.w / scale,
      h: selection.h / scale,
    };

    const canvasDataUrl = canvas.toDataURL('image/png');
    onSelect(originalRect, selection, canvasDataUrl);

    setStartPoint(null);
    setSelection(null);
  };

  // Mouse Handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    startInteraction(getRelativePoint(e.clientX, e.clientY));
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    moveInteraction(getRelativePoint(e.clientX, e.clientY));
  };

  const handleMouseUp = () => {
    endInteraction();
  };

  const handleMouseLeave = () => {
    setHoverPoint(null);
    endInteraction();
  };

  // Mobile Touch Handlers
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    const pos = getRelativePoint(touch.clientX, touch.clientY);
    if (useFixedSelectionBox) {
      setHoverPoint(pos);
    } else {
      startInteraction(pos);
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    const pos = getRelativePoint(touch.clientX, touch.clientY);
    moveInteraction(pos);
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (useFixedSelectionBox) {
      if (e.changedTouches.length > 0) {
        const touch = e.changedTouches[0];
        const pos = getRelativePoint(touch.clientX, touch.clientY);
        triggerFixedSelection(pos);
      }
      return;
    }
    endInteraction();
  };

  return (
    <canvas
      ref={canvasRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={() => {
        setStartPoint(null);
        setSelection(null);
        setHoverPoint(null);
      }}
      className={`max-w-full max-h-full w-full h-full touch-none select-none transition-[filter] duration-500 ${
        isEnhancing
          ? 'filter brightness-50 cursor-wait'
          : 'filter brightness-100 ' +
            (useFixedSelectionBox ? 'cursor-zoom-in' : 'cursor-crosshair')
      }`}
    />
  );
};