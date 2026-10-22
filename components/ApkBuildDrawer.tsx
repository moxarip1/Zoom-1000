import React, { useEffect, useState, useCallback } from 'react';
import { Download, RefreshCw, CheckCircle2, Package, ShieldCheck, X, FileCode, Clock } from 'lucide-react';

export interface ApkMetadata {
  apkPath: string;
  fileName: string;
  packageName: string;
  versionName: string;
  versionCode: number;
  fileSize: number;
  sha256: string;
  sourceHash: string;
  builtAt: string;
  autoUpdateEnabled: boolean;
  bundledFilesCount: number;
  features: string[];
}

interface ApkBuildDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ApkBuildDrawer: React.FC<ApkBuildDrawerProps> = ({ isOpen, onClose }) => {
  const [apkInfo, setApkInfo] = useState<ApkMetadata | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRebuilding, setIsRebuilding] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const fetchApkInfo = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/apk/info');
      if (res.ok) {
        const data = await res.json();
        setApkInfo(data);
      }
    } catch (err) {
      console.error('Failed to fetch APK info:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchApkInfo();
    }
  }, [isOpen, fetchApkInfo]);

  const handleRebuildApk = async () => {
    setIsRebuilding(true);
    setStatusMessage('جاري تجميع كافة التحديثات وبناء ملف debug/debug.apk...');
    try {
      const res = await fetch('/api/apk/rebuild', { method: 'POST' });
      if (res.ok) {
        const updated = await res.json();
        setApkInfo(updated);
        setStatusMessage('تم تحديث ملف debug/debug.apk بأحدث نسخة بنجاح!');
      } else {
        setStatusMessage('تعذر تحديث الحزمة حالياً.');
      }
    } catch (err) {
      console.error('Failed to rebuild APK:', err);
      setStatusMessage('حدث خطأ أثناء الاتصال بالخادم.');
    } finally {
      setIsRebuilding(false);
      setTimeout(() => setStatusMessage(null), 4000);
    }
  };

  if (!isOpen) return null;

  const formattedSize = apkInfo
    ? `${(apkInfo.fileSize / 1024).toFixed(1)} KB`
    : '...';

  const formattedDate = apkInfo?.builtAt
    ? new Date(apkInfo.builtAt).toLocaleString('ar-EG', {
        dateStyle: 'medium',
        timeStyle: 'medium',
      })
    : '...';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-slate-900 border-t sm:border border-slate-800 p-5 sm:p-6 shadow-2xl max-h-[88vh] overflow-y-auto text-right"
      >
        {/* Drag handle on mobile */}
        <div className="w-10 h-1.5 bg-slate-700 rounded-full mx-auto mb-4 sm:hidden" />

        <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <Package className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">
                حزمة أندرويد (debug/debug.apk)
              </h2>
              <p className="text-xs text-slate-400">
                تتحدث تلقائياً مع كل تعديل حالي أو مستقبلي في الكود
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
            aria-label="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Auto-Sync Banner */}
        <div className="mt-4 rounded-2xl bg-slate-950/90 border border-slate-800 p-4">
          <div className="flex items-center justify-between gap-2 text-xs text-slate-300 mb-3">
            <span className="flex items-center gap-1.5 font-semibold text-emerald-400">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>المزامنة التلقائية للتحديثات: مفعّلة دائماً</span>
            </span>
            <span className="font-mono tabular-nums text-slate-400">
              /debug/debug.apk
            </span>
          </div>

          {isLoading && !apkInfo ? (
            <div className="py-6 text-center text-sm text-slate-400">
              جاري قراءة بيانات النسخة...
            </div>
          ) : apkInfo ? (
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl bg-slate-900/90 border border-slate-800/80 p-3">
                <span className="text-slate-400 block mb-1">رقم الإصدار</span>
                <span className="font-mono font-semibold text-white tabular-nums">
                  {apkInfo.versionName}
                </span>
              </div>
              <div className="rounded-xl bg-slate-900/90 border border-slate-800/80 p-3">
                <span className="text-slate-400 block mb-1">حجم ملف APK</span>
                <span className="font-mono font-semibold text-emerald-400 tabular-nums">
                  {formattedSize} ({apkInfo.bundledFilesCount} ملف مدمج)
                </span>
              </div>
              <div className="rounded-xl bg-slate-900/90 border border-slate-800/80 p-3">
                <span className="text-slate-400 block mb-1 flex items-center gap-1">
                  <FileCode className="w-3.5 h-3.5" />
                  <span>بصمة الكود المصدري</span>
                </span>
                <span className="font-mono text-slate-200 tabular-nums">
                  {apkInfo.sourceHash}
                </span>
              </div>
              <div className="rounded-xl bg-slate-900/90 border border-slate-800/80 p-3">
                <span className="text-slate-400 block mb-1 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  <span>آخر تحديث للنسخة</span>
                </span>
                <span className="font-mono text-slate-200 tabular-nums text-[11px]">
                  {formattedDate}
                </span>
              </div>
            </div>
          ) : null}

          {apkInfo?.sha256 && (
            <div className="mt-3 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400 flex flex-col gap-1">
              <span>بصمة الحزمة (SHA-256):</span>
              <code className="font-mono text-[10px] text-slate-300 break-all bg-slate-900 px-2 py-1 rounded">
                {apkInfo.sha256}
              </code>
            </div>
          )}
        </div>

        {/* Features included in this build */}
        {apkInfo?.features && (
          <div className="mt-4">
            <h3 className="text-xs font-semibold text-slate-300 mb-2">
              التحديثات والميزات المدمجة في نسخة الهاتف:
            </h3>
            <ul className="space-y-1.5 text-xs text-slate-300">
              {apkInfo.features.map((feat, idx) => (
                <li key={idx} className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>{feat}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {statusMessage && (
          <div className="mt-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 px-3.5 py-2.5 text-xs font-medium text-emerald-300">
            {statusMessage}
          </div>
        )}

        {/* Primary Action Buttons */}
        <div className="mt-5 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <a
            href="/debug/debug.apk"
            download="debug.apk"
            className="flex-1 min-h-[48px] rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.99] text-slate-950 font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span>تحميل debug.apk الآن</span>
          </a>

          <button
            onClick={handleRebuildApk}
            disabled={isRebuilding}
            className="min-h-[48px] px-4 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-100 font-semibold text-xs flex items-center justify-center gap-2 border border-slate-700 transition whitespace-nowrap"
          >
            <RefreshCw className={`w-4 h-4 shrink-0 ${isRebuilding ? 'animate-spin text-emerald-400' : ''}`} />
            <span>{isRebuilding ? 'جاري التحديث...' : 'فحص وتحديث النسخة'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
