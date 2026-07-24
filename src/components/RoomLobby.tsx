import React, { useState } from 'react';
import { GameState, Player, RoomSettings } from '../types/game';
import { ge } from '../i18n/ge';
import { Copy, Check, Play, UserCheck, Settings, Users, Shield } from 'lucide-react';

interface RoomLobbyProps {
  state: GameState;
  myPlayerId: string;
  onToggleReady: () => void;
  onStartGame: () => void;
  onUpdateSettings?: (settings: Partial<RoomSettings>) => void;
  onLeaveRoom: () => void;
}

export const RoomLobby: React.FC<RoomLobbyProps> = ({
  state,
  myPlayerId,
  onToggleReady,
  onStartGame,
  onLeaveRoom,
}) => {
  const [copied, setCopied] = useState(false);
  const myPlayer = state.players.find((p) => p.id === myPlayerId);
  const isHost = myPlayer?.isHost || false;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(state.roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const seats = [
    { pos: 'south', name: ge.south, team: 1 },
    { pos: 'west', name: ge.west, team: 2 },
    { pos: 'north', name: ge.north, team: 1 },
    { pos: 'east', name: ge.east, team: 2 },
  ];

  const allReady = state.players.length === 4 && state.players.every((p) => p.isReady || p.isHost);

  return (
    <div className="max-w-2xl mx-auto bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl text-slate-100 flex flex-col gap-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-extrabold text-amber-400 flex items-center gap-2">
            <Users className="w-5 h-5" />
            <span>{ge.roomTitle}</span>
          </h2>
          <p className="text-xs text-slate-400">{ge.waitingForPlayers}</p>
        </div>

        {/* Room Code Badge */}
        <div className="flex items-center gap-2 bg-slate-950 border border-amber-500/30 px-4 py-2 rounded-2xl">
          <span className="text-xs text-slate-400 uppercase font-bold">კოდი:</span>
          <span className="text-lg font-black text-amber-300 tracking-wider">{state.roomCode}</span>
          <button
            onClick={handleCopyCode}
            className="ml-2 p-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded-xl transition-colors"
            title={ge.copyCode}
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Seats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {seats.map((seat) => {
          const player = state.players.find((p) => p.position === seat.pos);

          return (
            <div
              key={seat.pos}
              className={`p-4 rounded-2xl border flex items-center justify-between transition-all ${
                player
                  ? 'bg-slate-950/60 border-amber-500/30'
                  : 'bg-slate-950/20 border-slate-800 border-dashed'
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-sm ${
                    player
                      ? seat.team === 1
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-cyan-600 text-slate-100'
                      : 'bg-slate-800 text-slate-600'
                  }`}
                >
                  {player ? player.name.charAt(0).toUpperCase() : '?'}
                </div>

                <div className="flex flex-col">
                  <span className="font-bold text-sm">
                    {player ? player.name : 'ცარიელი ადგილი'}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {seat.name} • გუნდი {seat.team}
                  </span>
                </div>
              </div>

              {player && (
                <div className="flex items-center gap-2">
                  {player.isHost && (
                    <span className="bg-amber-500/20 text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-500/30 flex items-center gap-1">
                      <Shield className="w-3 h-3" />
                      {ge.host}
                    </span>
                  )}
                  <span
                    className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                      player.isReady || player.isHost
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {player.isReady || player.isHost ? ge.ready : ge.notReady}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Room Settings Summary */}
      <div className="bg-slate-950/40 p-4 rounded-2xl border border-slate-800 flex flex-wrap items-center justify-between text-xs text-slate-300 gap-3">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-amber-400" />
          <span>სვლის დრო: <strong className="text-amber-300">{state.settings.turnTimeSeconds} წმ</strong></span>
        </div>
        <div>
          სამიზნე ანგარიში: <strong className="text-amber-300">{state.settings.targetMatchScore} ქულა</strong>
        </div>
        <div>
          60-60 წესი: <strong className="text-amber-300">გადათამაშება</strong>
        </div>
      </div>

      {/* Bottom Actions */}
      <div className="flex items-center justify-between gap-4 pt-2">
        <button
          onClick={onLeaveRoom}
          className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold px-4 py-2.5 rounded-xl text-xs transition-colors"
        >
          {ge.leaveRoom}
        </button>

        <div className="flex items-center gap-3">
          {!isHost && (
            <button
              onClick={onToggleReady}
              className={`font-bold px-6 py-2.5 rounded-xl text-xs transition-all flex items-center gap-2 ${
                myPlayer?.isReady
                  ? 'bg-slate-800 text-slate-300 border border-slate-700'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/20'
              }`}
            >
              <UserCheck className="w-4 h-4" />
              <span>{myPlayer?.isReady ? 'მზადყოფნის გაუქმება' : ge.ready}</span>
            </button>
          )}

          {isHost && (
            <button
              onClick={onStartGame}
              disabled={!allReady}
              className={`font-black px-8 py-3 rounded-2xl text-xs shadow-xl transition-all flex items-center gap-2 ${
                allReady
                  ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 shadow-amber-500/20 scale-105'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
              }`}
            >
              <Play className="w-4 h-4" />
              <span>{ge.startGame}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
