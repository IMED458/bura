import React from 'react';
import { Card, Suit } from '../types/game';
import { ge } from '../i18n/ge';
import { CardSvg } from './CardSvg';
import { Flame, Layers } from 'lucide-react';

interface ScoreBoardProps {
  team1MatchScore: number;
  team2MatchScore: number;
  team1TrickPoints: number;
  team2TrickPoints: number;
  targetMatchScore: number;
  currentRaiseLevel: number;
  trumpCard: Card | null;
  trumpSuit: Suit | null;
  deckRemainingCount: number;
  onProposeRaise?: (level: any) => void;
  canRaise?: boolean;
}

export const ScoreBoard: React.FC<ScoreBoardProps> = ({
  team1MatchScore,
  team2MatchScore,
  team1TrickPoints,
  team2TrickPoints,
  targetMatchScore,
  currentRaiseLevel,
  trumpCard,
  deckRemainingCount,
  onProposeRaise,
  canRaise = false,
}) => {
  const raiseLevelNames: Record<number, string> = {
    1: '1 (ჩვეულებრივი)',
    2: '2 (დავი)',
    3: '3 (სე)',
    4: '4 (ჩარი)',
    5: '5 (ფანჯი)',
    6: '6 (შაში)',
  };

  const nextRaiseLevel = (currentRaiseLevel + 1) as any;

  return (
    <div className="w-full bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-2xl p-3 shadow-xl text-slate-100 flex flex-col md:flex-row items-center justify-between gap-4">
      {/* Match & Round Scores */}
      <div className="flex items-center gap-6 text-xs sm:text-sm">
        {/* Team 1 */}
        <div className="flex flex-col items-center">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">გუნდი 1</span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-black text-amber-400">{team1MatchScore}</span>
            <span className="text-xs text-slate-400">({team1TrickPoints} ქ)</span>
          </div>
        </div>

        <div className="text-slate-600 font-bold text-lg">:</div>

        {/* Team 2 */}
        <div className="flex flex-col items-center">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">გუნდი 2</span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-black text-amber-400">{team2MatchScore}</span>
            <span className="text-xs text-slate-400">({team2TrickPoints} ქ)</span>
          </div>
        </div>

        <div className="h-8 w-px bg-slate-800" />

        {/* Target & Raise Level */}
        <div className="flex flex-col text-[11px] text-slate-300">
          <div>
            {ge.matchScore} <span className="font-bold text-amber-400">{targetMatchScore}</span>)
          </div>
          <div>
            {ge.handValue}{' '}
            <span className="font-bold text-amber-300">
              {raiseLevelNames[currentRaiseLevel] || currentRaiseLevel}
            </span>
          </div>
        </div>
      </div>

      {/* Trump & Deck Status */}
      <div className="flex items-center gap-4">
        {/* Raise button */}
        {canRaise && currentRaiseLevel < 6 && (
          <button
            onClick={() => onProposeRaise?.(nextRaiseLevel)}
            className="flex items-center gap-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black px-3 py-1.5 rounded-xl text-xs shadow-md transition-all active:scale-95"
          >
            <Flame className="w-3.5 h-3.5" />
            <span>გაზრდა ({nextRaiseLevel} ქ)</span>
          </button>
        )}

        {/* Deck Count */}
        <div className="flex items-center gap-1.5 text-xs text-slate-300 bg-slate-950/40 px-2.5 py-1.5 rounded-xl border border-slate-800">
          <Layers className="w-4 h-4 text-amber-400" />
          <span>{deckRemainingCount} კარტი</span>
        </div>

        {/* Trump Card */}
        {trumpCard && (
          <div className="flex items-center gap-2 bg-slate-950/40 p-1.5 rounded-xl border border-slate-800">
            <span className="text-[10px] text-slate-400 font-bold uppercase">კოზირი:</span>
            <CardSvg card={trumpCard} size="sm" isTrump />
          </div>
        )}
      </div>
    </div>
  );
};
