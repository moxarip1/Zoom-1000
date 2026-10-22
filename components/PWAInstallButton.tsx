import React, { useState } from 'react';
import { Smartphone, Share, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        onClick={install}
        className="min-h-[44px] flex items-center gap-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 px-3 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25 active:scale-95 transition whitespace-nowrap shrink-0"
        title="تثبيت التطبيق على الهاتف"
      >
        <Smartphone className="w-4 h-4 shrink-0" />
        <span>تثبيت التطبيق</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="min-h-[44px] flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700 active:scale-95 transition whitespace-nowrap shrink-0"
        >
          <Smartphone className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>تثبيت على iOS</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl text-right" dir="rtl">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-bold text-white">تثبيت التطبيق على iPhone / iPad</h3>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-slate-400 hover:text-white"
                  aria-label="إغلاق"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-sm text-slate-300 leading-relaxed space-y-2">
                <span className="block">1. اضغط على زر <strong>المشاركة (Share)</strong> <Share className="inline w-4 h-4 text-emerald-400" /> في شريط Safari.</span>
                <span className="block">2. مرر لأسفل واختر <strong>إضافة إلى الشاشة الرئيسية (Add to Home Screen)</strong>.</span>
              </p>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full min-h-[44px] rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400 transition"
              >
                حسناً، فهمت
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
