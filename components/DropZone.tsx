/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Camera, ImagePlus, RotateCcw } from 'lucide-react';

interface DropZoneProps {
  onUploadClick?: () => void;
  onCameraClick?: () => void;
  onLoadSample?: () => void;
}

export const DropZone: React.FC<DropZoneProps> = ({
  onUploadClick,
  onCameraClick,
  onLoadSample,
}) => {
  return (
    <div className="w-full max-w-md mx-auto flex flex-col items-center justify-center rounded-3xl border border-slate-800 bg-slate-900/70 backdrop-blur-md text-center p-8 shadow-2xl">
      <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-4">
        <ImagePlus className="w-7 h-7" />
      </div>
      <h2 className="text-xl font-bold text-white mb-2">Remix ENHANCE!</h2>
      <p className="text-sm text-slate-400 leading-relaxed mb-6">
        التقط صورة بكاميرا الهاتف أو اختر صورة من المعرض للبدء في التكبير اللانهائي والتحسين الذكي.
      </p>

      <div className="w-full flex flex-col gap-3">
        {onCameraClick && (
          <button
            onClick={onCameraClick}
            className="w-full min-h-[48px] rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 transition active:scale-[0.98]"
          >
            <Camera className="w-4 h-4 shrink-0" />
            <span>التقاط صورة بالكاميرا</span>
          </button>
        )}

        {onUploadClick && (
          <button
            onClick={onUploadClick}
            className="w-full min-h-[48px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold text-sm flex items-center justify-center gap-2 border border-slate-700 transition active:scale-[0.98]"
          >
            <ImagePlus className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>اختيار صورة من الهاتف</span>
          </button>
        )}

        {onLoadSample && (
          <button
            onClick={onLoadSample}
            className="w-full min-h-[44px] rounded-xl text-slate-400 hover:text-slate-200 text-xs font-medium flex items-center justify-center gap-1.5 transition"
          >
            <RotateCcw className="w-3.5 h-3.5 shrink-0" />
            <span>تحميل الصورة التجريبية الافتراضية</span>
          </button>
        )}
      </div>
    </div>
  );
};
