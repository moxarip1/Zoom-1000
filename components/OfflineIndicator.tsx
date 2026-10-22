import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-xl bg-amber-500/95 px-3.5 py-2 text-xs font-semibold text-slate-950 shadow-lg whitespace-nowrap">
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>وضع عدم الاتصال — يتم استخدام النسخة المخزنة</span>
    </div>
  );
};
