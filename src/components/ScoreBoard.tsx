import React from 'react';
import { Player } from '../types/game';
import { ge } from '../i18n/ge';
import { Flame, Layers } from 'lucide-react';

interface ScoreBoardProps {
  team1MatchScore: number;
  team2MatchScore: number;
  team1TakenCardCount: number;
  team2TakenCardCount: number;
  targetMatchScore: number;
  currentRaiseLevel: number;
  deckRemainingCount: number;
  players: Player[];
  onProposeRaise?: (level: any) => void;
  canRaise?: boolean;
}

export const ScoreBoard: React.FC<ScoreBoardProps> = ({
  team1MatchScore,
  team2MatchScore,
  team1TakenCardCount,
  team2TakenCardCount,
  targetMatchScore,
  currentRaiseLevel,
  deckRemainingCount,
  players,
  onProposeRaise,
  canRaise = false,
}) => {
  const levelNames: Record<number, string> = {
    1: 'ჩვეულებრივი',
    2: ge.davi,
    3: ge.se,
    4: ge.chari,
    5: ge.fanji,
    6: ge.shashi,
  };
  const nextRaiseLevel = (currentRaiseLevel + 1) as any;
  const takenCardCount = team1TakenCardCount + team2TakenCardCount;
  const teamNames = (team: 1 | 2) =>
    players
      .filter((player) => player.team === team)
      .map((player) => player.name)
      .join(' / ') || 'მოთამაშე';

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
          <span className="max-w-[120px] truncate text-[10px] text-slate-400">{teamNames(1)}</span>
        </div>

        <div className="text-slate-600 font-bold text-lg">:</div>

        {/* Team 2 */}
        <div className="flex flex-col items-center min-w-[86px]">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">გუნდი 2</span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-black text-amber-400">{team2MatchScore}</span>
          </div>
          <span className="max-w-[120px] truncate text-[10px] text-slate-400">{teamNames(2)}</span>
        </div>

        <div className="h-8 w-px bg-slate-800" />

        {/* Target & Raise Level */}
        <div className="flex flex-col text-[11px] text-slate-300">
          <div>
            {ge.matchScore} <span className="font-bold text-amber-400">{targetMatchScore}</span>)
          </div>
          <div>რაუნდის ფასი <span className="font-bold text-amber-300">{levelNames[currentRaiseLevel] || currentRaiseLevel}</span></div>
          <div>წაყვანილია <span className="font-bold text-emerald-300">{takenCardCount} კარტი</span></div>
        </div>
      </div>

      {/* Trump & Deck Status */}
      <div className="flex items-center gap-4">
        {canRaise && currentRaiseLevel < 6 && (
          <button
            onClick={() => onProposeRaise?.(nextRaiseLevel)}
            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black px-3 py-2 rounded-xl text-xs shadow-md transition-colors"
          >
            <Flame className="w-4 h-4" />
            <span>{levelNames[nextRaiseLevel]}</span>
          </button>
        )}

        {/* Deck Count */}
        <div className="flex items-center gap-1.5 text-xs text-slate-300 bg-slate-950/40 px-2.5 py-1.5 rounded-xl border border-slate-800">
          <Layers className="w-4 h-4 text-amber-400" />
          <span>{deckRemainingCount} კარტი</span>
        </div>
      </div>
    </div>
  );
};
