import React, { useState, useEffect, useRef } from 'react';
import { Card, ChatMessage, GameState, PlayerCount } from './types/game';
import { GameClient } from './net/client';
import { db, auth } from './net/firebase';
import { Lobby } from './components/Lobby';
import { RoomLobby } from './components/RoomLobby';
import { Table } from './components/Table';
import { ScoreBoard } from './components/ScoreBoard';
import { ChatDrawer } from './components/ChatDrawer';
import { DaviModal } from './components/DaviModal';
import { GameOverModal } from './components/GameOverModal';
import { HowToPlayModal } from './components/HowToPlayModal';
import { soundEffects } from './utils/audio';
import { ge } from './i18n/ge';
import { MessageSquare, Volume2, VolumeX, BookOpen, LogOut } from 'lucide-react';

export default function App() {
  const [name, setName] = useState<string>(() => localStorage.getItem('bura_name') || '');

  const [gameState, setGameState] = useState<GameState | null>(null);
  const [hand, setHand] = useState<Card[]>([]);
  const [myPlayerId, setMyPlayerId] = useState<string>('');

  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<PlayerCount>(
    () => (localStorage.getItem('bura_mode') === '4' ? 4 : 2)
  );

  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isHowToPlayOpen, setIsHowToPlayOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const clientRef = useRef<GameClient | null>(null);
  const isChatOpenRef = useRef(isChatOpen);
  const prevChatLen = useRef(0);
  const prevPhase = useRef<string | null>(null);

  useEffect(() => { isChatOpenRef.current = isChatOpen; }, [isChatOpen]);

  // Create the networking client once, wired to React state.
  useEffect(() => {
    const client = new GameClient({
      onState: (state, uid) => {
        setMyPlayerId(uid);
        setGameState(state);
        if (
          (state.phase === 'ROUND_FINISHED' || state.phase === 'MATCH_FINISHED') &&
          prevPhase.current !== state.phase
        ) {
          soundEffects.playVictory();
        }
        prevPhase.current = state.phase;
      },
      onHand: (cards) => setHand(cards),
      onChat: (msgs) => {
        setChat(msgs);
        if (!isChatOpenRef.current && msgs.length > prevChatLen.current) {
          const added = msgs.slice(prevChatLen.current).filter((m) => !m.isSystem);
          if (added.length) {
            setUnreadCount((c) => c + added.length);
            soundEffects.playChatChime();
          }
        }
        prevChatLen.current = msgs.length;
      },
      onError: (message) => {
        setErrorMsg(message);
        setTimeout(() => setErrorMsg(null), 4000);
      },
    }, { db, auth });
    clientRef.current = client;
    client.init().then((uid) => setMyPlayerId(uid)).catch(() => {
      setErrorMsg('Firebase-თან დაკავშირება ვერ მოხერხდა');
    });
    return () => { client.leave(); };
  }, []);

  useEffect(() => { if (name) localStorage.setItem('bura_name', name); }, [name]);

  const selectMode = (m: PlayerCount) => {
    setMode(m);
    localStorage.setItem('bura_mode', String(m));
  };

  const resetToLobby = () => {
    setGameState(null);
    setHand([]);
    setChat([]);
    setUnreadCount(0);
    prevChatLen.current = 0;
    prevPhase.current = null;
  };

  const withBusy = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); }
    catch (e) { console.error(e); setErrorMsg('შეცდომა — სცადეთ თავიდან'); setTimeout(() => setErrorMsg(null), 4000); }
    finally { setBusy(false); }
  };

  const handleCreateRoom = () => {
    if (!name.trim() || !clientRef.current) return;
    withBusy(() => clientRef.current!.createRoom(name.trim(), { playerCount: mode }, true).then(() => {}));
  };

  const handleJoinRoom = (code: string) => {
    if (!name.trim() || !clientRef.current) return;
    withBusy(() => clientRef.current!.joinRoom(code, name.trim()));
  };

  const handleStartMatchmaking = () => {
    if (!name.trim() || !clientRef.current) return;
    withBusy(() => clientRef.current!.startMatchmaking(name.trim(), mode));
  };

  const handleCancelMatchmaking = () => {
    clientRef.current?.leave();
    resetToLobby();
  };

  const myPlayer = gameState?.players.find((p) => p.id === myPlayerId);

  const handleToggleReady = () => clientRef.current?.toggleReady(!(myPlayer?.isReady));
  const handleStartGame = () => clientRef.current?.startGame();
  const handleNextRound = () => clientRef.current?.nextRound();
  const handleNewMatch = () => clientRef.current?.newMatch();
  const handlePlayCards = (cardIds: string[]) => clientRef.current?.playCards(cardIds);
  const handleRespondRaise = (accept: boolean) => clientRef.current?.respondRaise(accept);
  const handleDeclareBura = () => clientRef.current?.declareBura();
  const handleSendChat = (text: string) => clientRef.current?.sendChat(name.trim() || 'მოთამაშე', text);

  const handleLeaveRoom = () => {
    clientRef.current?.leave();
    resetToLobby();
  };

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    soundEffects.setEnabled(next);
  };

  const openChat = () => { setIsChatOpen(true); setUnreadCount(0); };

  const isGameActive =
    gameState && gameState.phase !== 'LOBBY' && gameState.phase !== 'WAITING_FOR_PLAYERS';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-500 selection:text-slate-950">
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md px-4 py-3 flex items-center justify-between z-30 sticky top-0">
        <div onClick={handleLeaveRoom} className="flex items-center gap-2 cursor-pointer group">
          <div className="w-8 h-8 rounded-xl bg-amber-400 text-slate-950 font-black flex items-center justify-center text-sm shadow-md group-hover:scale-105 transition-transform">
            ბ
          </div>
          <span className="font-extrabold text-sm sm:text-base tracking-tight text-slate-100 group-hover:text-amber-400 transition-colors">
            {ge.appName}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsHowToPlayOpen(true)}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 text-xs font-bold transition-colors flex items-center gap-1.5"
          >
            <BookOpen className="w-4 h-4 text-amber-400" />
            <span className="hidden sm:inline">წესები</span>
          </button>

          <button
            onClick={toggleSound}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-amber-400 rounded-xl border border-slate-700 transition-colors"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
          </button>

          {gameState && (
            <button
              onClick={handleLeaveRoom}
              className="p-2 bg-red-950/70 hover:bg-red-900 text-red-200 rounded-xl border border-red-800 text-xs font-bold transition-colors flex items-center gap-1.5"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">გასვლა</span>
            </button>
          )}

          {gameState && (
            <button
              onClick={openChat}
              className="relative p-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl font-bold transition-colors shadow-md"
            >
              <MessageSquare className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-600 text-white font-black text-[9px] w-4 h-4 rounded-full flex items-center justify-center border border-slate-950 animate-pulse">
                  {unreadCount}
                </span>
              )}
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 p-3 sm:p-6 flex flex-col justify-center max-w-5xl w-full mx-auto relative">
        {errorMsg && (
          <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-red-950 border border-red-800 text-red-200 text-xs px-4 py-2.5 rounded-2xl shadow-2xl font-medium animate-bounce">
            {errorMsg}
          </div>
        )}

        {!gameState ? (
          <Lobby
            name={name}
            setName={setName}
            onCreateRoom={handleCreateRoom}
            onJoinRoom={handleJoinRoom}
            onStartMatchmaking={handleStartMatchmaking}
            onCancelMatchmaking={handleCancelMatchmaking}
            inMatchmaking={busy}
            matchmakingCount={0}
            mode={mode}
            onSelectMode={selectMode}
            onOpenHowToPlay={() => setIsHowToPlayOpen(true)}
            soundEnabled={soundEnabled}
            setSoundEnabled={setSoundEnabled}
          />
        ) : !isGameActive ? (
          <RoomLobby
            state={gameState}
            myPlayerId={myPlayerId}
            onToggleReady={handleToggleReady}
            onStartGame={handleStartGame}
            onLeaveRoom={handleLeaveRoom}
          />
        ) : (
          <div className="flex flex-col gap-4">
            <Table
              state={gameState}
              hand={hand}
              myPlayerId={myPlayerId}
              onPlayCards={handlePlayCards}
              onDeclareBura={handleDeclareBura}
            />

            <ScoreBoard
              team1MatchScore={gameState.team1MatchScore}
              team2MatchScore={gameState.team2MatchScore}
              team1TrickPoints={gameState.team1TrickPoints}
              team2TrickPoints={gameState.team2TrickPoints}
              team1TakenCardCount={gameState.team1TakenCardCount || 0}
              team2TakenCardCount={gameState.team2TakenCardCount || 0}
              targetMatchScore={gameState.settings.targetMatchScore}
              trumpCard={gameState.trumpCard}
              trumpSuit={gameState.trumpSuit}
              deckRemainingCount={gameState.deckRemainingCount}
            />
          </div>
        )}

        {gameState && gameState.phase === 'RAISE_OFFER_PENDING' && gameState.pendingRaise && (
          <DaviModal
            proposal={gameState.pendingRaise}
            players={gameState.players}
            myPlayerId={myPlayerId}
            onRespond={handleRespondRaise}
          />
        )}

        {gameState && (gameState.phase === 'ROUND_FINISHED' || gameState.phase === 'MATCH_FINISHED') && (
          <GameOverModal
            state={gameState}
            myPlayerId={myPlayerId}
            onRematch={gameState.phase === 'ROUND_FINISHED' ? handleNextRound : handleNewMatch}
            onBackToLobby={handleLeaveRoom}
          />
        )}

        <HowToPlayModal isOpen={isHowToPlayOpen} onClose={() => setIsHowToPlayOpen(false)} />

        <ChatDrawer
          chat={chat}
          players={gameState?.players || []}
          myPlayerId={myPlayerId}
          onSendMessage={handleSendChat}
          isOpen={isChatOpen}
          onClose={() => setIsChatOpen(false)}
          unreadCount={unreadCount}
        />
      </main>

      <footer className="border-t border-slate-800/80 bg-slate-900/40 py-3 text-center text-xs text-slate-500">
        made by <span className="font-bold text-amber-400">IMED</span>🩺
      </footer>
    </div>
  );
}
