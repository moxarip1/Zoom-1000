/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useEffect, useRef, MouseEvent } from 'react';
import {
  Undo2,
  Redo2,
  Sparkles,
  Camera,
  ImagePlus,
  Download,
  Film,
  RotateCcw,
  Package,
  Scan,
  Crop,
  History,
  X,
} from 'lucide-react';
import { DropZone } from './components/DropZone';
import { ImageDisplay } from './components/ImageDisplay';
import { PixelDissolve } from './components/PixelDissolve';
import { StatusBar } from './components/StatusBar';
import { SelectionAnimator } from './components/SelectionAnimator';
import { PWAInstallButton } from './components/PWAInstallButton';
import { OfflineIndicator } from './components/OfflineIndicator';
import { ApkBuildDrawer } from './components/ApkBuildDrawer';
import type { Rect, HistoryStep, ImageDescription } from './types';
import { AppState } from './types';
import { cropImage } from './utils/imageUtils';
import { serviceEnhance } from './utils/serviceEnhance';
import { serviceDescribeImage } from './utils/serviceDescribeImage';
import { generateZoomGif } from './utils/gifGenerator';

interface EnhancementJob {
  originalRect: Rect;
  canvasWithSelectionDataUrl: string;
  pixelatedSrc: string;
  screenRect: Rect;
}

const ZOOM_BOX_PRESETS = [
  { label: 'دقيق 12%', value: 0.125 },
  { label: 'متوسط 20%', value: 0.2 },
  { label: 'واسع 30%', value: 0.3 },
];

const App: React.FC = () => {
  const [useFixedSelectionBox, setUseFixedSelectionBox] = useState<boolean>(true);
  const [fixedSelectionSizePercentage, setFixedSelectionSizePercentage] = useState<number>(0.125);

  const [appState, setAppState] = useState<AppState>(AppState.LOADING);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [pixelatedImageSrc, setPixelatedImageSrc] = useState<string | null>(null);
  const [enhancedImageSrc, setEnhancedImageSrc] = useState<string | null>(null);
  const [finalImageSrc, setFinalImageSrc] = useState<string | null>(null);

  const [history, setHistory] = useState<HistoryStep[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [newHistoryEntryData, setNewHistoryEntryData] = useState<{
    description: ImageDescription;
    originalRect: Rect;
  } | null>(null);

  const [enhancementJob, setEnhancementJob] = useState<EnhancementJob | null>(null);
  const [finalEnhancementRect, setFinalEnhancementRect] = useState<Rect | null>(null);
  const [displaySelection, setDisplaySelection] = useState<Rect | null>(null);
  const [isGeneratingGif, setIsGeneratingGif] = useState<boolean>(false);
  const [showBananaBanner, setShowBananaBanner] = useState<boolean>(false);
  const [hasFoundBanana, setHasFoundBanana] = useState<boolean>(false);

  // Mobile drawers & modals
  const [isApkDrawerOpen, setIsApkDrawerOpen] = useState<boolean>(false);
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const imageObjectURLRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const loadInitialImage = useCallback(async () => {
    if (imageObjectURLRef.current) {
      URL.revokeObjectURL(imageObjectURLRef.current);
      imageObjectURLRef.current = null;
    }

    setAppState(AppState.LOADING);
    try {
      const response = await fetch(
        'https://www.gstatic.com/aistudio/starter-apps/enhance/living_room.png'
      );
      if (!response.ok) {
        throw new Error(`Failed to fetch initial image: ${response.statusText}`);
      }
      const blob = await response.blob();
      const objectURL = URL.createObjectURL(blob);
      imageObjectURLRef.current = objectURL;

      const img = new Image();
      img.onload = () => {
        const newStep: HistoryStep = {
          imageSrc: objectURL,
          description: null,
          originalRect: null,
        };
        setHistory([newStep]);
        setHistoryIndex(0);
        setImage(img);
        setFinalImageSrc(objectURL);
        setDisplaySelection(null);
        setAppState(AppState.LOADED);
      };
      img.onerror = () => {
        console.error('Image failed to load from object URL.');
        setAppState(AppState.IDLE);
        if (imageObjectURLRef.current) {
          URL.revokeObjectURL(imageObjectURLRef.current);
          imageObjectURLRef.current = null;
        }
      };
      img.src = objectURL;
    } catch (error) {
      console.error('Failed to load initial image:', error);
      setAppState(AppState.IDLE);
    }
  }, []);

  const resetState = useCallback(() => {
    setEnhancementJob(null);
    setFinalEnhancementRect(null);
    setHistory([]);
    setHistoryIndex(-1);
    setNewHistoryEntryData(null);
    setDisplaySelection(null);
    setShowBananaBanner(false);
    loadInitialImage();
  }, [loadInitialImage]);

  useEffect(() => {
    loadInitialImage();

    return () => {
      if (imageObjectURLRef.current) {
        URL.revokeObjectURL(imageObjectURLRef.current);
      }
    };
  }, [loadInitialImage]);

  const handleFileDrop = useCallback((file: File) => {
    if (imageObjectURLRef.current) {
      URL.revokeObjectURL(imageObjectURLRef.current);
      imageObjectURLRef.current = null;
    }

    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const newImageSrc = e.target?.result as string;
          const newStep: HistoryStep = {
            imageSrc: newImageSrc,
            description: null,
            originalRect: null,
          };
          setHistory([newStep]);
          setHistoryIndex(0);
          setImage(img);
          setFinalImageSrc(newImageSrc);
          setEnhancementJob(null);
          setFinalEnhancementRect(null);
          setDisplaySelection(null);
          setShowBananaBanner(false);
          setAppState(AppState.LOADED);
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileDrop(e.target.files[0]);
      e.target.value = '';
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleCameraClick = () => {
    cameraInputRef.current?.click();
  };

  const handleSelection = useCallback(
    async (originalRect: Rect, screenRect: Rect, canvasWithSelectionDataUrl: string) => {
      if (!image) return;

      if (historyIndex < history.length - 1) {
        const newHistory = history.slice(0, historyIndex + 1);
        setHistory(newHistory);
      }

      setAppState(AppState.ENHANCING);

      const viewportBounds = viewportRef.current?.getBoundingClientRect() || {
        width: window.innerWidth,
        height: window.innerHeight - 160,
        left: 0,
        top: 56,
      };

      const aspectRatio = originalRect.w / originalRect.h;
      const padding = 0.06;
      const maxWidth = viewportBounds.width * (1 - padding);
      const maxHeight = viewportBounds.height * (1 - padding);

      let targetWidth = maxWidth;
      let targetHeight = targetWidth / aspectRatio;

      if (targetHeight > maxHeight) {
        targetHeight = maxHeight;
        targetWidth = targetHeight * aspectRatio;
      }

      setFinalEnhancementRect({
        w: targetWidth,
        h: targetHeight,
        x: (viewportBounds.width - targetWidth) / 2,
        y: (viewportBounds.height - targetHeight) / 2,
      });

      const pixelatedSrc = await cropImage(
        image,
        originalRect,
        originalRect.w,
        originalRect.h,
        true
      );

      setEnhancementJob({
        originalRect,
        canvasWithSelectionDataUrl,
        pixelatedSrc,
        screenRect,
      });
    },
    [image, history, historyIndex]
  );

  const runEnhancementJob = useCallback(async () => {
    if (!enhancementJob || !image) return;

    const { originalRect, canvasWithSelectionDataUrl, pixelatedSrc } = enhancementJob;

    try {
      const descriptionHistory = history
        .slice(0, historyIndex + 1)
        .map((h) => h.description)
        .filter((d): d is ImageDescription => d !== null);
      const description = await serviceDescribeImage(
        canvasWithSelectionDataUrl,
        descriptionHistory
      );

      setNewHistoryEntryData({ description, originalRect });

      const sourceImageWidth = image.naturalWidth;
      const sourceImageHeight = image.naturalHeight;
      const padding = 0.25;

      const paddedX = originalRect.x - originalRect.w * padding;
      const paddedY = originalRect.y - originalRect.h * padding;
      const paddedW = originalRect.w * (1 + 2 * padding);
      const paddedH = originalRect.h * (1 + 2 * padding);

      const finalPaddedX = Math.max(0, paddedX);
      const finalPaddedY = Math.max(0, paddedY);
      const finalPaddedX2 = Math.min(sourceImageWidth, paddedX + paddedW);
      const finalPaddedY2 = Math.min(sourceImageHeight, paddedY + paddedH);

      const paddedRect = {
        x: finalPaddedX,
        y: finalPaddedY,
        w: finalPaddedX2 - finalPaddedX,
        h: finalPaddedY2 - finalPaddedY,
      };

      const aspect = paddedRect.h / paddedRect.w;
      const targetWidth = 512 * (1 + padding);
      const targetHeight = Math.round(targetWidth * aspect);
      const croppedForEnhancement = await cropImage(
        image,
        paddedRect,
        targetWidth,
        targetHeight,
        false
      );

      const { imageSrc: enhancedPaddedSrc, foundTheBanana } = await serviceEnhance(
        croppedForEnhancement,
        [...descriptionHistory.map((d) => d.prompt), description.prompt],
        hasFoundBanana
      );

      if (foundTheBanana) {
        setShowBananaBanner(true);
        setHasFoundBanana(true);
      }

      const enhancedPaddedImage = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = enhancedPaddedSrc;
      });

      const finalCropRect = {
        x: enhancedPaddedImage.naturalWidth * ((originalRect.x - paddedRect.x) / paddedRect.w),
        y: enhancedPaddedImage.naturalHeight * ((originalRect.y - paddedRect.y) / paddedRect.h),
        w: enhancedPaddedImage.naturalWidth * (originalRect.w / paddedRect.w),
        h: enhancedPaddedImage.naturalHeight * (originalRect.h / paddedRect.h),
      };

      const finalImageWidth = 1024;
      const finalImageHeight = Math.round(
        finalImageWidth * (originalRect.h / originalRect.w)
      );

      const enhancedSrc = await cropImage(
        enhancedPaddedImage,
        finalCropRect,
        finalImageWidth,
        finalImageHeight,
        false
      );

      setPixelatedImageSrc(pixelatedSrc);
      setEnhancedImageSrc(enhancedSrc);
      setAppState(AppState.ENHANCED);
    } catch (error) {
      console.error('Enhancement process failed:', error);
      const fallbackSrc = await cropImage(
        image,
        originalRect,
        originalRect.w * 2,
        originalRect.h * 2,
        false
      );
      setPixelatedImageSrc(pixelatedSrc);
      setEnhancedImageSrc(fallbackSrc);
      setAppState(AppState.ENHANCED);
    } finally {
      setEnhancementJob(null);
    }
  }, [enhancementJob, image, history, historyIndex, hasFoundBanana]);

  const handleEnhancementComplete = useCallback(() => {
    if (enhancedImageSrc && newHistoryEntryData) {
      const newStep: HistoryStep = {
        imageSrc: enhancedImageSrc,
        description: newHistoryEntryData.description,
        originalRect: newHistoryEntryData.originalRect,
      };

      const newHistory = history.slice(0, historyIndex + 1);
      setHistory([...newHistory, newStep]);
      setHistoryIndex(newHistory.length);

      const newImage = new Image();
      newImage.onload = () => {
        setImage(newImage);
        setFinalImageSrc(enhancedImageSrc);
        setEnhancedImageSrc(null);
        setFinalEnhancementRect(null);
        setNewHistoryEntryData(null);
        setDisplaySelection(null);
        setAppState(AppState.LOADED);
      };
      newImage.src = enhancedImageSrc;
    }
  }, [enhancedImageSrc, newHistoryEntryData, history, historyIndex]);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileDrop(e.dataTransfer.files[0]);
      e.dataTransfer.clearData();
    }
  };

  const jumpToHistoryIndex = useCallback(
    (targetIdx: number) => {
      if (
        targetIdx < 0 ||
        targetIdx >= history.length ||
        appState === AppState.ENHANCING ||
        isGeneratingGif
      ) {
        return;
      }
      setHistoryIndex(targetIdx);
      const nextStep = history[targetIdx + 1];
      setDisplaySelection(nextStep?.originalRect || null);

      const newImageSrc = history[targetIdx].imageSrc;
      const img = new Image();
      img.onload = () => {
        setImage(img);
        setFinalImageSrc(newImageSrc);
      };
      img.src = newImageSrc;
    },
    [history, appState, isGeneratingGif]
  );

  const handleUndo = useCallback(() => {
    if (historyIndex <= 0) return;
    jumpToHistoryIndex(historyIndex - 1);
  }, [historyIndex, jumpToHistoryIndex]);

  const handleRedo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    jumpToHistoryIndex(historyIndex + 1);
  }, [historyIndex, history.length, jumpToHistoryIndex]);

  const handleRegenerate = useCallback(async () => {
    if (historyIndex <= 0 || appState === AppState.ENHANCING || isGeneratingGif) return;

    setAppState(AppState.ENHANCING);

    const previousStep = history[historyIndex - 1];
    const currentStep = history[historyIndex];
    const originalRect = currentStep.originalRect;

    if (!originalRect) {
      setAppState(AppState.LOADED);
      return;
    }

    const sourceImage = new Image();
    sourceImage.crossOrigin = 'anonymous';
    sourceImage.onload = async () => {
      try {
        const descriptionHistory = history
          .slice(0, historyIndex)
          .map((h) => h.description)
          .filter((d): d is ImageDescription => d !== null);

        const croppedForDescription = await cropImage(
          sourceImage,
          originalRect,
          originalRect.w,
          originalRect.h,
          false
        );
        const description = await serviceDescribeImage(
          croppedForDescription,
          descriptionHistory
        );

        const sourceImageWidth = sourceImage.naturalWidth;
        const sourceImageHeight = sourceImage.naturalHeight;
        const padding = 0.5;

        const paddedX = originalRect.x - originalRect.w * padding;
        const paddedY = originalRect.y - originalRect.h * padding;
        const paddedW = originalRect.w * (1 + 2 * padding);
        const paddedH = originalRect.h * (1 + 2 * padding);

        const finalPaddedX = Math.max(0, paddedX);
        const finalPaddedY = Math.max(0, paddedY);
        const finalPaddedX2 = Math.min(sourceImageWidth, paddedX + paddedW);
        const finalPaddedY2 = Math.min(sourceImageHeight, paddedY + paddedH);

        const paddedRect = {
          x: finalPaddedX,
          y: finalPaddedY,
          w: finalPaddedX2 - finalPaddedX,
          h: finalPaddedY2 - finalPaddedY,
        };

        const aspect = paddedRect.h / paddedRect.w;
        const targetWidth = 512;
        const targetHeight = Math.round(targetWidth * aspect);
        const croppedForEnhancement = await cropImage(
          sourceImage,
          paddedRect,
          targetWidth,
          targetHeight,
          false
        );

        const { imageSrc: enhancedPaddedSrc, foundTheBanana } = await serviceEnhance(
          croppedForEnhancement,
          [...descriptionHistory.map((d) => d.prompt), description.prompt],
          hasFoundBanana
        );

        if (foundTheBanana) {
          setShowBananaBanner(true);
          setHasFoundBanana(true);
        }

        const enhancedPaddedImage = await new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = enhancedPaddedSrc;
        });

        const finalCropRect = {
          x: enhancedPaddedImage.naturalWidth * ((originalRect.x - paddedRect.x) / paddedRect.w),
          y: enhancedPaddedImage.naturalHeight * ((originalRect.y - paddedRect.y) / paddedRect.h),
          w: enhancedPaddedImage.naturalWidth * (originalRect.w / paddedRect.w),
          h: enhancedPaddedImage.naturalHeight * (originalRect.h / paddedRect.h),
        };

        const finalImageWidth = 1024;
        const finalImageHeight = Math.round(
          finalImageWidth * (originalRect.h / originalRect.w)
        );

        const enhancedSrc = await cropImage(
          enhancedPaddedImage,
          finalCropRect,
          finalImageWidth,
          finalImageHeight,
          false
        );

        const newStep: HistoryStep = {
          imageSrc: enhancedSrc,
          description,
          originalRect,
        };

        const newHistory = [...history.slice(0, historyIndex), newStep];
        setHistory(newHistory);
        setDisplaySelection(null);

        const newImage = new Image();
        newImage.onload = () => {
          setImage(newImage);
          setFinalImageSrc(enhancedSrc);
          setAppState(AppState.LOADED);
        };
        newImage.src = enhancedSrc;
      } catch (error) {
        console.error('Regeneration failed:', error);
        setAppState(AppState.LOADED);
      }
    };
    sourceImage.src = previousStep.imageSrc;
  }, [history, historyIndex, appState, isGeneratingGif, hasFoundBanana]);

  const handleExportGif = useCallback(async () => {
    if (historyIndex < 1) return;
    setIsGeneratingGif(true);
    try {
      const blob = await generateZoomGif(history.slice(0, historyIndex + 1));
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `enhance-zoom-step-${historyIndex + 1}.gif`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to generate GIF:', error);
    } finally {
      setIsGeneratingGif(false);
    }
  }, [history, historyIndex]);

  const handleDownloadCurrentImage = useCallback(() => {
    if (!finalImageSrc) return;
    const a = document.createElement('a');
    a.href = finalImageSrc;
    a.download = `enhanced-step-${historyIndex + 1}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [finalImageSrc, historyIndex]);

  const stopPropagation = (ev: MouseEvent<HTMLButtonElement>) => {
    ev.stopPropagation();
  };

  const currentStepObj = history[historyIndex];
  const currentMagnification = Math.round(
    Math.pow(1 / fixedSelectionSizePercentage, Math.max(0, historyIndex))
  );

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 bg-[#090D16] text-slate-100 flex flex-col justify-between overflow-hidden select-none"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <OfflineIndicator />

      {/* Easter Egg Banner */}
      {showBananaBanner && (
        <div className="bg-amber-400 text-slate-950 text-center px-4 py-2 z-30 font-bold text-sm flex items-center justify-between shadow-md">
          <span>🍌 عثرت على الموزة النانوية المخفية! (NANO BANANA) 🍌</span>
          <button
            onClick={() => setShowBananaBanner(false)}
            className="min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-950 hover:opacity-75 text-xl font-bold"
            aria-label="إغلاق"
          >
            &times;
          </button>
        </div>
      )}

      {/* Top Mobile App Bar (Follows 3-Zone Contract) */}
      <header className="h-14 px-3 sm:px-6 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 flex items-center justify-between gap-3 z-20 shrink-0">
        {/* Zone 1: Single-line Brand Wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
          }}
          className="text-sm sm:text-base font-bold tracking-tight text-white whitespace-nowrap shrink-0"
        >
          Remix ENHANCE!
        </a>

        {/* Zone 2: Clean status / step metadata */}
        <div className="hidden md:flex items-center gap-3 text-xs text-slate-400 font-mono tabular-nums whitespace-nowrap">
          <span>
            Step {Math.max(1, historyIndex + 1)} / {Math.max(1, history.length)}
          </span>
          <span aria-hidden="true">·</span>
          <span className="text-emerald-400">{currentMagnification}x Zoom</span>
        </div>

        {/* Zone 3: Primary Action & Install Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <PWAInstallButton />

          <button
            onClick={() => setIsApkDrawerOpen(true)}
            className="min-h-[44px] px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-sm transition whitespace-nowrap shrink-0"
            title="تحميل وإدارة نسخة الهاتف debug.apk"
          >
            <Package className="w-4 h-4 shrink-0" />
            <span>debug.apk</span>
          </button>
        </div>
      </header>

      {/* Sub-Toolbar for Mobile Touch Mode & Reticle Size */}
      <div
        dir="rtl"
        className="px-3 py-2 bg-slate-950/80 border-b border-slate-800/80 flex items-center justify-between gap-2 overflow-x-auto z-20 shrink-0"
      >
        {/* Mode Switcher: Tap vs Draw */}
        <div className="flex items-center gap-1 p-1 bg-slate-900 rounded-xl border border-slate-800 shrink-0">
          <button
            onClick={() => setUseFixedSelectionBox(true)}
            className={`min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition whitespace-nowrap ${
              useFixedSelectionBox
                ? 'bg-emerald-500 text-slate-950 shadow-sm'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Scan className="w-3.5 h-3.5 shrink-0" />
            <span>لمس للتكبير</span>
          </button>
          <button
            onClick={() => setUseFixedSelectionBox(false)}
            className={`min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition whitespace-nowrap ${
              !useFixedSelectionBox
                ? 'bg-emerald-500 text-slate-950 shadow-sm'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Crop className="w-3.5 h-3.5 shrink-0" />
            <span>تحديد حر</span>
          </button>
        </div>

        {/* Box Size Presets (when Tap-to-Zoom is active) */}
        {useFixedSelectionBox && (
          <div className="flex items-center gap-1 bg-slate-900/70 p-1 rounded-xl border border-slate-800/80 shrink-0">
            {ZOOM_BOX_PRESETS.map((preset) => (
              <button
                key={preset.value}
                onClick={() => setFixedSelectionSizePercentage(preset.value)}
                className={`min-h-[34px] px-2 py-1 rounded-lg text-[11px] font-medium transition whitespace-nowrap tabular-nums ${
                  fixedSelectionSizePercentage === preset.value
                    ? 'bg-slate-800 text-emerald-400 border border-emerald-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        )}

        {/* Step counter & History Log Drawer button on Mobile */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setIsHistoryDrawerOpen(true)}
            className="min-h-[36px] px-2.5 py-1 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono tabular-nums text-slate-200 hover:border-slate-700 flex items-center gap-1.5 whitespace-nowrap"
          >
            <History className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>
              {Math.max(1, historyIndex + 1)}/{Math.max(1, history.length)}
            </span>
          </button>
        </div>
      </div>

      {/* Main Interactive Canvas Viewport */}
      <main
        ref={viewportRef}
        className="relative flex-1 w-full flex items-center justify-center overflow-hidden p-2 sm:p-4 bg-[#090D16]"
      >
        {appState === AppState.IDLE && (
          <DropZone
            onUploadClick={handleUploadClick}
            onCameraClick={handleCameraClick}
            onLoadSample={loadInitialImage}
          />
        )}

        {appState === AppState.LOADING && (
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="w-10 h-10 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
            <p className="text-xs font-mono text-emerald-400">
              جاري تحميل الصورة...
            </p>
          </div>
        )}

        {finalImageSrc && ![AppState.ENHANCED, AppState.ENHANCING].includes(appState) && (
          <ImageDisplay
            imageSrc={finalImageSrc}
            onSelect={handleSelection}
            isEnhancing={appState === AppState.ENHANCING || isGeneratingGif}
            historicalSelection={displaySelection}
            useFixedSelectionBox={useFixedSelectionBox}
            fixedSelectionSizePercentage={fixedSelectionSizePercentage}
          />
        )}

        {enhancementJob && appState === AppState.ENHANCING && finalEnhancementRect && (
          <SelectionAnimator
            rect={enhancementJob.screenRect}
            finalRect={finalEnhancementRect}
            src={enhancementJob.pixelatedSrc}
            onComplete={runEnhancementJob}
          />
        )}

        {appState === AppState.ENHANCED &&
          pixelatedImageSrc &&
          enhancedImageSrc &&
          finalEnhancementRect && (
            <div
              className="absolute z-10"
              style={{
                top: `${finalEnhancementRect.y}px`,
                left: `${finalEnhancementRect.x}px`,
                width: `${finalEnhancementRect.w}px`,
                height: `${finalEnhancementRect.h}px`,
              }}
            >
              <PixelDissolve
                lowResSrc={pixelatedImageSrc}
                highResSrc={enhancedImageSrc}
                onComplete={handleEnhancementComplete}
              />
            </div>
          )}
      </main>

      {/* Status Bar */}
      <StatusBar
        state={appState}
        useFixedSelectionBox={useFixedSelectionBox}
        isInitialState={history.length <= 1}
        onUploadClick={handleUploadClick}
        currentPrompt={currentStepObj?.description?.prompt || null}
      />

      {/* Ergonomic Mobile Bottom Navigation & Action Bar (Thumb Zone) */}
      <nav
        dir="rtl"
        aria-label="أدوات التحكم بالصورة"
        className="bg-slate-900/95 backdrop-blur-md border-t border-slate-800 px-2 py-1.5 z-20 shrink-0"
      >
        <div className="max-w-3xl mx-auto grid grid-cols-6 gap-1 items-center">
          {/* 1. Undo */}
          <button
            onClick={handleUndo}
            onMouseDownCapture={stopPropagation}
            disabled={historyIndex <= 0 || appState === AppState.ENHANCING || isGeneratingGif}
            className="min-h-[48px] flex flex-col items-center justify-center rounded-xl text-slate-200 hover:bg-slate-800 disabled:opacity-35 disabled:pointer-events-none active:scale-95 transition"
          >
            <Undo2 className="w-5 h-5" />
            <span className="text-[10px] font-medium mt-0.5 whitespace-nowrap">تراجع</span>
          </button>

          {/* 2. Redo */}
          <button
            onClick={handleRedo}
            onMouseDownCapture={stopPropagation}
            disabled={
              historyIndex >= history.length - 1 ||
              appState === AppState.ENHANCING ||
              isGeneratingGif
            }
            className="min-h-[48px] flex flex-col items-center justify-center rounded-xl text-slate-200 hover:bg-slate-800 disabled:opacity-35 disabled:pointer-events-none active:scale-95 transition"
          >
            <Redo2 className="w-5 h-5" />
            <span className="text-[10px] font-medium mt-0.5 whitespace-nowrap">تقدم</span>
          </button>

          {/* 3. Re-generate */}
          <button
            onClick={handleRegenerate}
            onMouseDownCapture={stopPropagation}
            disabled={historyIndex <= 0 || appState === AppState.ENHANCING || isGeneratingGif}
            className="min-h-[48px] flex flex-col items-center justify-center rounded-xl text-emerald-400 hover:bg-slate-800 disabled:opacity-35 disabled:pointer-events-none active:scale-95 transition"
          >
            <Sparkles className="w-5 h-5" />
            <span className="text-[10px] font-medium mt-0.5 whitespace-nowrap">إعادة تحسين</span>
          </button>

          {/* 4. Camera / Upload */}
          <button
            onClick={handleUploadClick}
            onMouseDownCapture={stopPropagation}
            disabled={appState === AppState.ENHANCING || isGeneratingGif}
            className="min-h-[48px] flex flex-col items-center justify-center rounded-xl text-slate-200 hover:bg-slate-800 disabled:opacity-35 active:scale-95 transition"
          >
            <ImagePlus className="w-5 h-5 text-emerald-400" />
            <span className="text-[10px] font-medium mt-0.5 whitespace-nowrap">صورة جديدة</span>
          </button>

          {/* 5. Export GIF or Save PNG */}
          {historyIndex >= 1 ? (
            <button
              onClick={handleExportGif}
              onMouseDownCapture={stopPropagation}
              disabled={isGeneratingGif || appState === AppState.ENHANCING}
              className="min-h-[48px] flex flex-col items-center justify-center rounded-xl text-emerald-300 hover:bg-slate-800 disabled:opacity-35 active:scale-95 transition"
            >
              <Film className={`w-5 h-5 ${isGeneratingGif ? 'animate-spin' : ''}`} />
              <span className="text-[10px] font-medium mt-0.5 whitespace-nowrap">
                {isGeneratingGif ? 'جاري...' : 'تصدير GIF'}
              </span>
            </button>
          ) : (
            <button
              onClick={handleDownloadCurrentImage}
              onMouseDownCapture={stopPropagation}
              disabled={!finalImageSrc || appState === AppState.ENHANCING}
              className="min-h-[48px] flex flex-col items-center justify-center rounded-xl text-slate-200 hover:bg-slate-800 disabled:opacity-35 active:scale-95 transition"
            >
              <Download className="w-5 h-5" />
              <span className="text-[10px] font-medium mt-0.5 whitespace-nowrap">حفظ الصورة</span>
            </button>
          )}

          {/* 6. Reset */}
          <button
            onClick={resetState}
            onMouseDownCapture={stopPropagation}
            disabled={appState === AppState.ENHANCING || isGeneratingGif}
            className="min-h-[48px] flex flex-col items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-35 active:scale-95 transition"
          >
            <RotateCcw className="w-5 h-5" />
            <span className="text-[10px] font-medium mt-0.5 whitespace-nowrap">إعادة ضبط</span>
          </button>
        </div>
      </nav>

      {/* Hidden File Inputs for Gallery & Mobile Camera */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        className="hidden"
        accept="image/*"
      />
      <input
        type="file"
        ref={cameraInputRef}
        onChange={handleFileSelect}
        className="hidden"
        accept="image/*"
        capture="environment"
      />

      {/* History & AI Analysis Bottom Sheet */}
      {isHistoryDrawerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4"
          onClick={() => setIsHistoryDrawerOpen(false)}
        >
          <div
            dir="rtl"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-slate-900 border-t sm:border border-slate-800 p-5 shadow-2xl max-h-[82vh] flex flex-col text-right"
          >
            <div className="w-10 h-1.5 bg-slate-700 rounded-full mx-auto mb-3 sm:hidden" />
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white">سجل التكبير والتحليل الذكي</h3>
                <p className="text-xs text-slate-400">
                  اضغط على أي خطوة للانتقال إليها مباشرة أو احفظ الصورة الحالية
                </p>
              </div>
              <button
                onClick={() => setIsHistoryDrawerOpen(false)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="my-3 flex items-center gap-2">
              <button
                onClick={() => {
                  setIsHistoryDrawerOpen(false);
                  handleCameraClick();
                }}
                className="flex-1 min-h-[44px] rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-100 flex items-center justify-center gap-1.5 border border-slate-700"
              >
                <Camera className="w-4 h-4 text-emerald-400" />
                <span>التقاط بالكاميرا</span>
              </button>
              <button
                onClick={() => {
                  handleDownloadCurrentImage();
                }}
                className="flex-1 min-h-[44px] rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-100 flex items-center justify-center gap-1.5 border border-slate-700"
              >
                <Download className="w-4 h-4 text-emerald-400" />
                <span>تنزيل PNG الحالية</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {history.map((step, idx) => {
                const isCurrent = idx === historyIndex;
                return (
                  <button
                    key={idx}
                    onClick={() => {
                      jumpToHistoryIndex(idx);
                      setIsHistoryDrawerOpen(false);
                    }}
                    className={`w-full p-2.5 rounded-2xl border text-right flex items-center gap-3 transition ${
                      isCurrent
                        ? 'bg-emerald-500/15 border-emerald-500/50 text-white'
                        : 'bg-slate-950/60 border-slate-800/80 text-slate-300 hover:bg-slate-800/50'
                    }`}
                  >
                    <img
                      src={step.imageSrc}
                      alt={`Step ${idx + 1}`}
                      referrerPolicy="no-referrer"
                      className="w-14 h-14 rounded-xl object-cover border border-slate-700 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-emerald-400 font-mono tabular-nums">
                          الخطوة #{idx + 1}
                        </span>
                        {isCurrent && (
                          <span className="text-[11px] text-emerald-300 font-semibold">
                            المعروضة حالياً
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-200 truncate mt-0.5" dir="ltr">
                        {step.description?.prompt || 'الصورة الأصلية الأساسية (Base Image)'}
                      </p>
                      {step.description?.selectionDescription && (
                        <p className="text-[11px] text-slate-400 truncate mt-0.5" dir="ltr">
                          {step.description.selectionDescription}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* APK Build & Auto-Update Manager Drawer */}
      <ApkBuildDrawer
        isOpen={isApkDrawerOpen}
        onClose={() => setIsApkDrawerOpen(false)}
      />
    </div>
  );
};

export default App;
