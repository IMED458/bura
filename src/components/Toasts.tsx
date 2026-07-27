import React from 'react';
import { Flame, Trophy, Crown, Info, Users, CheckCircle2 } from 'lucide-react';

export interface Toast {
  id: string;
  text: string;
  kind: 'davi' | 'round_win' | 'trick_win' | 'bura' | 'join' | 'leave' | 'info';
}

const ICON: Record<Toast['kind'], React.ReactNode> = {
  davi: <Flame className="w-4 h-4" />,
  round_win: <Trophy className="w-4 h-4" />,
  trick_win: <Crown className="w-4 h-4" />,
  bura: <Flame className="w-4 h-4" />,
  join: <Users className="w-4 h-4" />,
  leave: <Info className="w-4 h-4" />,
  info: <CheckCircle2 className="w-4 h-4" />,
};

const STYLE: Record<Toast['kind'], string> = {
  davi: 'bg-orange-500/95 text-white border-orange-300',
  round_win: 'bg-amber-400/95 text-rose-950 border-amber-200',
  trick_win: 'bg-emerald-500/95 text-white border-emerald-300',
  bura: 'bg-red-600/95 text-white border-red-300',
  join: 'bg-slate-800/95 text-slate-100 border-slate-600',
  leave: 'bg-slate-800/95 text-slate-100 border-slate-600',
  info: 'bg-slate-800/95 text-slate-100 border-slate-600',
};

export const ToastNotifications: React.FC<{ toasts: Toast[] }> = ({ toasts }) => {
  if (!toasts.length) return null;
  return (
    <div
      className="fixed top-16 left-1/2 -translate-x-1/2 z-[60] flex flex-col items-center gap-2 w-[92vw] max-w-sm pointer-events-none"
      aria-live="polite"
      role="status"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`animate-toast-in flex items-center gap-2 px-4 py-2.5 rounded-2xl border shadow-2xl text-xs font-bold backdrop-blur-md w-full ${STYLE[t.kind]}`}
        >
          <span className="shrink-0">{ICON[t.kind]}</span>
          <span className="leading-snug">{t.text}</span>
        </div>
      ))}
    </div>
  );
};
