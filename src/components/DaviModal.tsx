import React from 'react';
import { DaviProposal, Player } from '../types/game';
import { ge } from '../i18n/ge';
import { Flame } from 'lucide-react';

interface DaviModalProps {
  proposal: DaviProposal;
  players: Player[];
  myPlayerId: string;
  onRespond: (accept: boolean) => void;
}

export const DaviModal: React.FC<DaviModalProps> = ({
  proposal,
  players,
  myPlayerId,
  onRespond,
}) => {
  const proposer = players.find((p) => p.id === proposal.proposedByPlayerId);
  const myPlayer = players.find((p) => p.id === myPlayerId);
  const isMyTeamProposer = myPlayer?.team === proposal.proposedByTeam;

  const levelNames: Record<number, string> = {
    2: 'დავი (2 ქულა)',
    3: 'სე (3 ქულა)',
    4: 'ჩარი (4 ქულა)',
    5: 'ფანჯი (5 ქულა)',
    6: 'შაში (6 ქულა)',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-amber-500/40 rounded-3xl p-6 max-w-sm w-full text-center shadow-2xl relative overflow-hidden">
        <div className="absolute -top-12 -right-12 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="w-12 h-12 bg-amber-500/20 text-amber-400 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-amber-500/30">
          <Flame className="w-6 h-6 animate-pulse" />
        </div>

        <h3 className="text-xl font-black text-amber-400 mb-1">{ge.raiseProposed}</h3>
        <p className="text-xs text-slate-400 mb-4">
          {ge.proposedBy} <span className="text-slate-200 font-bold">{proposer?.name || 'მოთამაშე'}</span>
        </p>

        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 mb-6">
          <div className="text-2xl font-black text-amber-300">
            {levelNames[proposal.level] || `${proposal.level} ქულა`}
          </div>
        </div>

        {isMyTeamProposer ? (
          <p className="text-xs text-slate-400 italic">
            ველოდებით მოწინააღმდეგე გუნდის გადაწყვეტილებას...
          </p>
        ) : (
          <div className="flex items-center gap-3">
            <button
              onClick={() => onRespond(false)}
              className="flex-1 bg-red-950/80 hover:bg-red-900 text-red-200 font-bold py-3 px-4 rounded-xl border border-red-800 text-xs transition-all"
            >
              {ge.reject}
            </button>
            <button
              onClick={() => onRespond(true)}
              className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-3 px-4 rounded-xl shadow-lg shadow-amber-500/20 text-xs transition-all"
            >
              {ge.accept}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
