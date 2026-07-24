import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { GameState } from '../types/game';
import { ge } from '../i18n/ge';
import { Trophy, RotateCcw, Home } from 'lucide-react';
import { soundEffects } from '../utils/audio';

interface GameOverModalProps {
  state: GameState;
  myPlayerId: string;
  onRematch: () => void;
  onBackToLobby: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  state,
  myPlayerId,
  onRematch,
  onBackToLobby,
}) => {
  const isMatchFinished = state.phase === 'MATCH_FINISHED';
  const winningTeam = state.winningTeam || (state.team1MatchScore > state.team2MatchScore ? 1 : 2);

  const myPlayer = state.players.find((p) => p.id === myPlayerId);
  const didIWin = myPlayer?.team === winningTeam;

  useEffect(() => {
    soundEffects.playVictory();
    if (didIWin) {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });
    }
  }, [didIWin]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in">
      <div className="bg-slate-900 border border-amber-500/30 rounded-3xl p-6 sm:p-8 max-w-md w-full text-center shadow-2xl relative overflow-hidden">
        <div className="w-16 h-16 bg-amber-500/20 text-amber-400 rounded-3xl flex items-center justify-center mx-auto mb-4 border border-amber-500/40">
          <Trophy className="w-8 h-8" />
        </div>

        <h2 className="text-2xl font-black text-amber-400 mb-1">
          {isMatchFinished ? ge.matchFinished : ge.roundFinished}
        </h2>

        <p className="text-xs text-slate-400 mb-6">
          {ge.winner}{' '}
          <span className="font-extrabold text-amber-300">
            გუნდი {winningTeam} ({winningTeam === 1 ? 'სამხრეთი/ჩრდილოეთი' : 'დასავლეთი/აღმოსავლეთი'})
          </span>
        </p>

        {/* Scores Card */}
        <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex items-center justify-around mb-6">
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 uppercase font-bold">გუნდი 1</span>
            <span className="text-2xl font-black text-amber-400">{state.team1MatchScore}</span>
            <span className="text-[10px] text-slate-500">({state.team1TrickPoints} ქ)</span>
          </div>

          <div className="text-slate-600 font-bold text-xl">:</div>

          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 uppercase font-bold">გუნდი 2</span>
            <span className="text-2xl font-black text-amber-400">{state.team2MatchScore}</span>
            <span className="text-[10px] text-slate-500">({state.team2TrickPoints} ქ)</span>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToLobby}
            className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold py-3 px-4 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all"
          >
            <Home className="w-4 h-4" />
            <span>{ge.backToLobby}</span>
          </button>

          <button
            onClick={onRematch}
            className="flex-1 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black py-3 px-4 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-amber-500/20 transition-all scale-105"
          >
            <RotateCcw className="w-4 h-4" />
            <span>{ge.rematch}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
