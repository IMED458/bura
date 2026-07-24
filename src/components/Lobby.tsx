import React, { useState } from 'react';
import { ge } from '../i18n/ge';
import { Volume2, VolumeX, BookOpen, Users, Search, PlusCircle, ArrowRight, Sparkles } from 'lucide-react';
import { soundEffects } from '../utils/audio';

interface LobbyProps {
  name: string;
  setName: (name: string) => void;
  onCreateRoom: () => void;
  onJoinRoom: (code: string) => void;
  onStartMatchmaking: () => void;
  onCancelMatchmaking: () => void;
  inMatchmaking: boolean;
  matchmakingCount: number;
  onOpenHowToPlay: () => void;
  soundEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => void;
  error?: string;
}

export const Lobby: React.FC<LobbyProps> = ({
  name,
  setName,
  onCreateRoom,
  onJoinRoom,
  onStartMatchmaking,
  onCancelMatchmaking,
  inMatchmaking,
  matchmakingCount,
  onOpenHowToPlay,
  soundEnabled,
  setSoundEnabled,
  error,
}) => {
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [showJoinInput, setShowJoinInput] = useState(false);

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    soundEffects.setEnabled(next);
  };

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (!joinCodeInput.trim()) return;
    onJoinRoom(joinCodeInput.trim());
  };

  return (
    <div className="max-w-md mx-auto bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl text-slate-100 flex flex-col items-center relative overflow-hidden select-none">
      {/* Glow Effects */}
      <div className="absolute -top-20 -left-20 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-20 -right-20 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header Actions */}
      <div className="w-full flex items-center justify-between mb-6 z-10">
        <button
          onClick={onOpenHowToPlay}
          className="flex items-center gap-1.5 text-xs font-bold text-slate-300 hover:text-amber-400 bg-slate-800/80 px-3 py-1.5 rounded-full border border-slate-700/80 transition-colors"
        >
          <BookOpen className="w-3.5 h-3.5 text-amber-400" />
          <span>წესები</span>
        </button>

        <button
          onClick={toggleSound}
          className="p-2 bg-slate-800/80 hover:bg-slate-700 text-amber-400 rounded-full border border-slate-700/80 transition-colors"
          title={soundEnabled ? ge.soundOn : ge.soundOff}
        >
          {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
        </button>
      </div>

      {/* Game Logo & Title */}
      <div className="text-center mb-8 z-10">
        <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-amber-500 to-amber-300 text-slate-950 font-black text-2xl flex items-center justify-center mx-auto mb-3 shadow-xl shadow-amber-500/20 border-2 border-amber-200">
          ბ
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-amber-400 tracking-tight">{ge.appName}</h1>
        <p className="text-xs text-slate-400 mt-1 max-w-xs">{ge.tagline}</p>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="w-full bg-red-950/80 border border-red-800/80 text-red-200 text-xs px-4 py-2.5 rounded-2xl mb-4 text-center font-medium animate-fade-in">
          {error}
        </div>
      )}

      {/* Nickname Input */}
      <div className="w-full mb-6 z-10">
        <label className="block text-xs font-bold text-slate-300 mb-1.5 text-left">
          {ge.enterName}
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={ge.namePlaceholder}
          maxLength={18}
          className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors font-medium"
        />
      </div>

      {/* Matchmaking Overlay or Main Action Buttons */}
      {inMatchmaking ? (
        <div className="w-full bg-slate-950/80 border border-amber-500/30 rounded-2xl p-5 text-center flex flex-col items-center gap-3 animate-pulse z-10">
          <div className="w-8 h-8 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
          <div className="text-xs font-bold text-amber-300">{ge.searchingMatch}</div>
          <div className="text-xs text-slate-400">
            {ge.foundPlayers} <span className="text-amber-400 font-bold">{matchmakingCount}/4</span>
          </div>
          <button
            onClick={onCancelMatchmaking}
            className="mt-2 text-xs text-red-400 hover:text-red-300 font-bold underline"
          >
            {ge.cancelSearch}
          </button>
        </div>
      ) : (
        <div className="w-full space-y-3 z-10">
          {/* Quick Matchmaking */}
          <button
            onClick={onStartMatchmaking}
            disabled={!name.trim()}
            className="w-full bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-black py-3.5 px-4 rounded-2xl shadow-xl shadow-amber-500/20 text-xs flex items-center justify-center gap-2 transition-all scale-100 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Sparkles className="w-4 h-4" />
            <span>{ge.findMatch}</span>
          </button>

          {/* Create Private Room */}
          <button
            onClick={onCreateRoom}
            disabled={!name.trim()}
            className="w-full bg-slate-800 hover:bg-slate-750 text-slate-100 font-bold py-3 px-4 rounded-2xl text-xs flex items-center justify-center gap-2 border border-slate-700 transition-all disabled:opacity-50"
          >
            <PlusCircle className="w-4 h-4 text-amber-400" />
            <span>{ge.createRoom}</span>
          </button>

          {/* Join by Code */}
          {!showJoinInput ? (
            <button
              onClick={() => setShowJoinInput(true)}
              className="w-full bg-slate-950 hover:bg-slate-900 text-slate-300 font-bold py-3 px-4 rounded-2xl text-xs flex items-center justify-center gap-2 border border-slate-800 transition-all"
            >
              <Users className="w-4 h-4 text-slate-400" />
              <span>{ge.joinRoom}</span>
            </button>
          ) : (
            <form onSubmit={handleJoinSubmit} className="flex gap-2">
              <input
                type="text"
                value={joinCodeInput}
                onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                placeholder="BURA-1234"
                maxLength={10}
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-amber-300 font-mono tracking-wider focus:outline-none focus:border-amber-500"
              />
              <button
                type="submit"
                disabled={!name.trim() || !joinCodeInput.trim()}
                className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-black px-4 py-2 rounded-xl text-xs transition-colors flex items-center gap-1"
              >
                <span>შესვლა</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
};
