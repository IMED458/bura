import React from 'react';
import { Card, Suit } from '../types/game';
import { ge } from '../i18n/ge';
import { CardSvg } from './CardSvg';
import { Layers } from 'lucide-react';

interface ScoreBoardProps {
  team1MatchScore: number;
  team2MatchScore: number;
  team1TrickPoints: number;
  team2TrickPoints: number;
  team1TakenCardCount: number;
  team2TakenCardCount: number;
  targetMatchScore: number;
  trumpCard: Card | null;
  trumpSuit: Suit | null;
  deckRemainingCount: number;
}

export const ScoreBoard: React.FC<ScoreBoardProps> = ({
  team1MatchScore,
  team2MatchScore,
  team1TrickPoints,
  team2TrickPoints,
  team1TakenCardCount,
  team2TakenCardCount,
  targetMatchScore,
  trumpCard,
  deckRemainingCount,
}) => {
  return (
    <div className="w-full bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-2xl p-3 shadow-xl text-slate-100 flex flex-col md:flex-row items-center justify-between gap-4">
      {/* Match & Round Scores */}
      <div className="flex items-center gap-5 text-xs sm:text-sm">
        {/* Team 1 */}
        <div className="flex flex-col items-center min-w-[86px]">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">გუნდი 1</span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-black text-amber-400">{team1MatchScore}</span>
          </div>
          <span className="text-[10px] text-slate-400">{team1TrickPoints} ქულა • {team1TakenCardCount} კარტი</span>
        </div>

        <div className="text-slate-600 font-bold text-lg">:</div>

        {/* Team 2 */}
        <div className="flex flex-col items-center min-w-[86px]">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">გუნდი 2</span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-black text-amber-400">{team2MatchScore}</span>
          </div>
          <span className="text-[10px] text-slate-400">{team2TrickPoints} ქულა • {team2TakenCardCount} კარტი</span>
        </div>

        <div className="h-8 w-px bg-slate-800" />

        {/* Target & Raise Level */}
        <div className="flex flex-col text-[11px] text-slate-300">
          <div>
            {ge.matchScore} <span className="font-bold text-amber-400">{targetMatchScore}</span>)
          </div>
          <div>რაუნდის ფასი <span className="font-bold text-amber-300">1 ქულა</span></div>
        </div>
      </div>

      {/* Trump & Deck Status */}
      <div className="flex items-center gap-4">
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
