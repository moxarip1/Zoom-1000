/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AppState } from '../types';

interface StatusBarProps {
  state: AppState;
  useFixedSelectionBox: boolean;
  isInitialState: boolean;
  onUploadClick: () => void;
  currentPrompt?: string | null;
}

const getStatusMessage = (state: AppState, useFixedSelectionBox: boolean): string => {
  switch (state) {
    case AppState.IDLE:
      return 'جاهز — اختر صورة أو التقط صورة للبدء';
    case AppState.LOADING:
      return 'جاري تجهيز الصورة عالية الدقة...';
    case AppState.LOADED:
      return useFixedSelectionBox
        ? 'المس أي منطقة في الصورة للتكبير والتحسين الذكي'
        : 'اسحب بإصبعك لتحديد منطقة مخصصة للتحسين';
    case AppState.SELECTING:
      return 'جاري تحديد المنطقة...';
    case AppState.ENHANCING:
      return 'جاري تحليل التفاصيل وتوليد الدقة الفائقة...';
    case AppState.ENHANCED:
      return 'جاري دمج البكسلات المحسّنة...';
    default:
      return 'جاهز';
  }
};

export const StatusBar: React.FC<StatusBarProps> = ({
  state,
  useFixedSelectionBox,
  currentPrompt,
}) => {
  const message = getStatusMessage(state, useFixedSelectionBox);

  return (
    <div
      dir="rtl"
      className="w-full px-4 py-1.5 bg-slate-950/80 border-t border-slate-800/80 text-center flex items-center justify-center gap-2 text-xs text-slate-300 truncate"
    >
      <span className="font-medium text-emerald-400 truncate">{message}</span>
      {state === AppState.LOADED && currentPrompt && (
        <>
          <span aria-hidden="true" className="text-slate-600">·</span>
          <span className="text-slate-400 truncate max-w-[200px] sm:max-w-md" dir="ltr">
            {currentPrompt}
          </span>
        </>
      )}
    </div>
  );
};
