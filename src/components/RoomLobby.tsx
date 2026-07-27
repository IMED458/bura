import React, { useState } from 'react';
import { GameState, Player, RoomSettings } from '../types/game';
import { ge } from '../i18n/ge';
import { Copy, Check, Play, UserCheck, Settings, Users, Shield, ArrowLeftRight } from 'lucide-react';

interface RoomLobbyProps {
  state: GameState;
  myPlayerId: string;
  onToggleReady: () => void;
  onStartGame: () => void;
  onUpdateSettings?: (settings: Partial<RoomSettings>) => void;
  onLeaveRoom: () => void;
  onMoveToTeam?: (targetUid: string, team: 1 | 2) => void;
}

export const RoomLobby: React.FC<RoomLobbyProps> = ({
  state,
  myPlayerId,
  onToggleReady,
  onStartGame,
  onLeaveRoom,
  onMoveToTeam,
}) => {
  const [copied, setCopied] = useState(false);
  const myPlayer = state.players.find((p) => p.id === myPlayerId);
  const isHost = myPlayer?.isHost || false;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(state.roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const playerCount = state.settings.playerCount;
  const isTeamMode = playerCount === 4;

  const teamCount = (team: 1 | 2) => state.players.filter((p) => p.team === team).length;
  const validTeams = !isTeamMode || (teamCount(1) === 2 && teamCount(2) === 2);
  const allReady =
    state.players.length === playerCount &&
    state.players.every((p) => p.isReady || p.isHost) &&
    validTeams;

  const startDisabledReason =
    state.players.length !== playerCount
      ? `${ge.waitingForPlayers} (${state.players.length}/${playerCount})`
      : !validTeams
        ? ge.teamNeedsTwo
        : !state.players.every((p) => p.isReady || p.isHost)
          ? 'ყველა მოთამაშე უნდა იყოს მზად'
          : '';

  // ---- a single player card (used inside team columns / 2p seats) ----------
  const PlayerCard: React.FC<{ player?: Player; team: 1 | 2; seatLabel: string }> = ({ player, team, seatLabel }) => {
    const canMove = !!player && isTeamMode && (isHost || player.id === myPlayerId) && !!onMoveToTeam;
    const otherTeam: 1 | 2 = team === 1 ? 2 : 1;

    return (
      <div
        className={`p-3 rounded-2xl border flex flex-col gap-2 transition-all ${
          player ? 'bg-slate-950/60 border-amber-500/30' : 'bg-slate-950/20 border-slate-800 border-dashed'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`w-9 h-9 rounded-2xl flex items-center justify-center font-bold text-sm shrink-0 ${
                player
                  ? team === 1
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-cyan-500 text-cyan-950'
                  : 'bg-slate-800 text-slate-600'
              }`}
            >
              {player ? player.name.charAt(0).toUpperCase() : '?'}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-sm truncate" title={player?.name}>
                {player ? player.name : ge.emptySeat}
                {player?.id === myPlayerId && <span className="text-[10px] text-amber-400 ml-1">({ge.you})</span>}
              </span>
              <span className="text-[10px] text-slate-400">{seatLabel}</span>
            </div>
          </div>

          {player && (
            <div className="flex items-center gap-1.5 shrink-0">
              {player.isHost && (
                <span className="bg-amber-500/20 text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-500/30 flex items-center gap-1">
                  <Shield className="w-3 h-3" />
                  {ge.host}
                </span>
              )}
              <span
                className={`text-[10px] font-bold px-2 py-1 rounded-full ${
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

        {canMove && (
          <button
            onClick={() => onMoveToTeam!(player!.id, otherTeam)}
            className="self-start flex items-center gap-1.5 text-[11px] font-bold text-cyan-200 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 px-2.5 py-1 rounded-lg transition-colors"
            aria-label={otherTeam === 1 ? ge.moveToTeam1 : ge.moveToTeam2}
          >
            <ArrowLeftRight className="w-3 h-3" />
            {otherTeam === 1 ? ge.moveToTeam1 : ge.moveToTeam2}
          </button>
        )}
      </div>
    );
  };

  // ---- team columns (4p) or simple seats (2p) ------------------------------
  const renderTeams = () => {
    if (!isTeamMode) {
      const south = state.players.find((p) => p.position === 'south');
      const north = state.players.find((p) => p.position === 'north');
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <PlayerCard player={south} team={1} seatLabel={ge.south} />
          <PlayerCard player={north} team={2} seatLabel={ge.opponent} />
        </div>
      );
    }

    const teamPlayers = (team: 1 | 2) => state.players.filter((p) => p.team === team);
    const renderColumn = (team: 1 | 2) => {
      const members = teamPlayers(team);
      const slots: (Player | undefined)[] = [members[0], members[1]];
      return (
        <div className={`flex flex-col gap-3 p-3 rounded-2xl border ${team === 1 ? 'border-amber-500/30 bg-amber-500/5' : 'border-cyan-500/30 bg-cyan-500/5'}`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-black ${team === 1 ? 'text-amber-300' : 'text-cyan-300'}`}>
              გუნდი {team}
            </span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${teamCount(team) === 2 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>
              {teamCount(team)}/2
            </span>
          </div>
          {slots.map((p, i) => (
            <PlayerCard key={p?.id || `empty-${team}-${i}`} player={p} team={team} seatLabel={`გუნდი ${team}`} />
          ))}
        </div>
      );
    };

    return (
      <div>
        <div className="flex items-center gap-2 mb-2 text-slate-300">
          <Users className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-bold">{ge.teamSwitchTitle}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {renderColumn(1)}
          {renderColumn(2)}
        </div>
        <p className="text-[10px] text-slate-500 mt-2">{isHost ? ge.hostCanSwap : ge.teamNeedsTwo}</p>
      </div>
    );
  };

  return (
    <div className="max-w-2xl mx-auto bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl text-slate-100 flex flex-col gap-5">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-extrabold text-amber-400 flex items-center gap-2">
            <Users className="w-5 h-5" />
            <span>{ge.roomTitle}</span>
          </h2>
          <p className="text-xs text-slate-400">
            {ge.waitingForPlayers} ({state.players.length}/{playerCount})
          </p>
        </div>

        <div className="flex items-center gap-2 bg-slate-950 border border-amber-500/30 px-4 py-2 rounded-2xl">
          <span className="text-xs text-slate-400 uppercase font-bold">კოდი:</span>
          <span className="text-lg font-black text-amber-300 tracking-wider">{state.roomCode}</span>
          <button
            onClick={handleCopyCode}
            className="ml-2 p-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded-xl transition-colors"
            title={ge.copyCode}
            aria-label={ge.copyCode}
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {renderTeams()}

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
      <div className="flex items-center justify-between gap-4 pt-1">
        <button
          onClick={onLeaveRoom}
          className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold px-4 py-2.5 rounded-xl text-xs transition-colors"
        >
          {ge.leaveRoom}
        </button>

        <div className="flex flex-col items-end gap-1">
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
                title={allReady ? undefined : startDisabledReason}
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
          {isHost && !allReady && startDisabledReason && (
            <span className="text-[10px] text-red-300">{startDisabledReason}</span>
          )}
        </div>
      </div>
    </div>
  );
};
