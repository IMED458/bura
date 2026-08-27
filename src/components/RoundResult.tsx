import React from 'react';
import { GameState } from '../types/game';
import { Trophy } from 'lucide-react';

interface RoundResultProps {
  state: GameState;
}

/**
 * Non-blocking hand-result card shown during ROUND_FINISHED (the host deals the
 * next round automatically a few seconds later). This is the ONE place the
 * captured point tally is revealed — points stay hidden during play.
 */
export const RoundResult: React.FC<RoundResultProps> = ({ state }) => {
  const winningTeam = state.winningTeam;
  const teamNames = (team: 1 | 2) =>
    state.players
      .filter((p) => p.team === team)
      .map((p) => p.name)
      .join(' / ') || `გუნდი ${team}`;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 pointer-events-none">
      <div className="bg-slate-900/95 border border-amber-500/40 rounded-3xl p-6 max-w-xs w-full text-center shadow-2xl animate-fade-in backdrop-blur-md">
        <div className="w-12 h-12 bg-amber-500/20 text-amber-400 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-amber-500/30">
          <Trophy className="w-6 h-6" />
        </div>

        <h3 className="text-lg font-black text-amber-400 mb-1">ხელი დასრულდა</h3>
        {winningTeam ? (
          <p className="text-xs text-slate-300 mb-4">
            მოიგო <span className="font-bold text-amber-300">გუნდმა {winningTeam}</span>
            <span className="block text-[11px] text-slate-400 mt-0.5">{teamNames(winningTeam)}</span>
          </p>
        ) : (
          <p className="text-xs text-slate-300 mb-4">ფრე (60 - 60)</p>
        )}

        {/* Captured points this hand — revealed only now, at hand end. */}
        <div className="bg-slate-950 rounded-2xl border border-slate-800 p-3 flex items-center justify-around">
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 font-bold uppercase">გუნდი 1</span>
            <span className="text-2xl font-black text-amber-400">{state.team1TrickPoints}</span>
            <span className="text-[9px] text-slate-500">ქულა</span>
          </div>
          <div className="text-slate-600 font-bold text-lg">:</div>
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 font-bold uppercase">გუნდი 2</span>
            <span className="text-2xl font-black text-amber-400">{state.team2TrickPoints}</span>
            <span className="text-[9px] text-slate-500">ქულა</span>
          </div>
        </div>

        <p className="text-[10px] text-slate-500 mt-3">შემდეგი ხელი იწყება…</p>
      </div>
    </div>
  );
};
