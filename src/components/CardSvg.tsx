import React from 'react';
import { Card, Suit } from '../types/game';

interface CardSvgProps {
  card?: Card;
  faceDown?: boolean;
  selected?: boolean;
  isTrump?: boolean;
  onClick?: () => void;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const CardSvg: React.FC<CardSvgProps> = ({
  card,
  faceDown = false,
  selected = false,
  isTrump = false,
  onClick,
  size = 'md',
  className = '',
}) => {
  const getSuitSymbol = (s: Suit) => {
    switch (s) {
      case 'hearts':
        return '♥';
      case 'diamonds':
        return '♦';
      case 'clubs':
        return '♣';
      case 'spades':
        return '♠';
    }
  };

  const getSuitColor = (s: Suit) => {
    return s === 'hearts' || s === 'diamonds' ? 'text-red-600' : 'text-slate-900';
  };

  const dimensions = {
    sm: 'w-12 h-18 text-xs',
    md: 'w-16 h-24 sm:w-20 sm:h-28 text-sm',
    lg: 'w-24 h-36 sm:w-28 sm:h-40 text-base',
  }[size];

  if (faceDown || !card) {
    return (
      <div
        onClick={onClick}
        className={`relative rounded-xl border-2 border-amber-900/40 bg-gradient-to-br from-amber-800 via-amber-900 to-amber-950 p-1.5 shadow-md transition-transform duration-200 select-none ${dimensions} ${className}`}
      >
        <div className="h-full w-full rounded-lg border border-amber-500/30 bg-[radial-gradient(#f59e0b_1px,transparent_1px)] [background-size:8px_8px] flex items-center justify-center">
          <div className="w-6 h-6 rounded-full border border-amber-400/40 flex items-center justify-center text-amber-400/80 font-bold text-xs">
            ბ
          </div>
        </div>
      </div>
    );
  }

  const symbol = getSuitSymbol(card.suit);
  const colorClass = getSuitColor(card.suit);

  return (
    <div
      onClick={onClick}
      className={`relative rounded-xl border bg-white p-1.5 shadow-md transition-all duration-200 select-none cursor-pointer ${dimensions} ${colorClass} ${
        selected
          ? '-translate-y-4 ring-4 ring-amber-400 shadow-xl z-20 border-amber-400'
          : 'hover:-translate-y-1 hover:shadow-lg border-slate-200'
      } ${className}`}
    >
      {isTrump && (
        <span className="absolute -top-1.5 -right-1.5 bg-amber-400 text-amber-950 font-black text-[9px] px-1 py-0.5 rounded-full shadow border border-amber-200 z-10">
          კოზირი
        </span>
      )}

      <div className="flex flex-col justify-between h-full">
        {/* Top Left Rank & Suit */}
        <div className="flex flex-col items-start leading-none">
          <span className="font-extrabold tracking-tight text-sm sm:text-base">{card.rank}</span>
          <span className="text-xs sm:text-sm">{symbol}</span>
        </div>

        {/* Center Suit Symbol */}
        <div className="self-center text-2xl sm:text-3xl my-auto opacity-90">{symbol}</div>

        {/* Bottom Right Rank & Suit */}
        <div className="flex flex-col items-end leading-none rotate-180">
          <span className="font-extrabold tracking-tight text-sm sm:text-base">{card.rank}</span>
          <span className="text-xs sm:text-sm">{symbol}</span>
        </div>
      </div>
    </div>
  );
};
