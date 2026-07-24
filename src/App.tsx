import React, { useState, useEffect, useRef } from 'react';
import { Card, ChatMessage, GameState, Player, PlayerPosition, PlayerCount, ClientMessage, ServerMessage } from './types/game';
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
import { MessageSquare, Volume2, VolumeX, BookOpen, RotateCcw } from 'lucide-react';

export default function App() {
  const [name, setName] = useState<string>(() => localStorage.getItem('bura_name') || '');
  const [sessionToken, setSessionToken] = useState<string>(
    () => localStorage.getItem('bura_session_token') || ''
  );

  const [gameState, setGameState] = useState<GameState | null>(null);
  const [hand, setHand] = useState<Card[]>([]);
  const [myPosition, setMyPosition] = useState<PlayerPosition>('south');
  const [myPlayerId, setMyPlayerId] = useState<string>('');

  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const [inMatchmaking, setInMatchmaking] = useState(false);
  const [matchmakingCount, setMatchmakingCount] = useState(0);
  const [mode, setMode] = useState<PlayerCount>(
    () => (localStorage.getItem('bura_mode') === '4' ? 4 : 2)
  );

  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isHowToPlayOpen, setIsHowToPlayOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);

  // Initialize WebSocket
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const ws = new WebSocket(`${protocol}//${host}`);
    wsRef.current = ws;

    ws.onopen = () => {
      // Auto reconnect check if sessionToken exists
    };

    ws.onmessage = (event) => {
      try {
        const msg: ServerMessage = JSON.parse(event.data);

        switch (msg.type) {
          case 'SESSION_INIT':
            setSessionToken(msg.sessionToken);
            setMyPlayerId(msg.player.id);
            localStorage.setItem('bura_session_token', msg.sessionToken);
            break;

          case 'ROOM_STATE':
            setGameState(msg.state);
            setHand(msg.hand || []);
            setMyPosition(msg.myPosition);
            setInMatchmaking(false);

            // Trigger sounds on trick win or round finish
            if (msg.state.phase === 'ROUND_FINISHED' || msg.state.phase === 'MATCH_FINISHED') {
              soundEffects.playVictory();
            }
            break;

          case 'MATCHMAKING_STATUS':
            setInMatchmaking(msg.inQueue);
            setMatchmakingCount(msg.playersFound);
            break;

          case 'CHAT_MESSAGE':
            setChat((prev) => [...prev, msg.message]);
            if (!isChatOpen) {
              setUnreadCount((c) => c + 1);
            }
            soundEffects.playChatChime();
            break;

          case 'ERROR':
          case 'ACTION_REJECTED':
            setErrorMsg(msg.type === 'ERROR' ? msg.message : msg.reason);
            setTimeout(() => setErrorMsg(null), 4000);
            break;

          case 'SYSTEM_ANNOUNCEMENT':
            // Log to system chat
            break;
        }
      } catch (e) {
        console.error('Failed to parse WS message', e);
      }
    };

    ws.onclose = () => {
      // Reconnect logic
    };

    return () => {
      ws.close();
    };
  }, []);

  // Save nickname
  useEffect(() => {
    if (name) {
      localStorage.setItem('bura_name', name);
    }
  }, [name]);

  const sendMsg = (msg: ClientMessage) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  };

  const selectMode = (m: PlayerCount) => {
    setMode(m);
    localStorage.setItem('bura_mode', String(m));
  };

  const handleCreateRoom = () => {
    if (!name.trim()) return;
    sendMsg({ type: 'CREATE_ROOM', name: name.trim(), settings: { playerCount: mode } });
  };

  const handleJoinRoom = (code: string) => {
    if (!name.trim()) return;
    sendMsg({
      type: 'JOIN_ROOM',
      roomCode: code,
      name: name.trim(),
      sessionToken,
    });
  };

  const handleStartMatchmaking = () => {
    if (!name.trim()) return;
    sendMsg({
      type: 'JOIN_MATCHMAKING',
      name: name.trim(),
      sessionToken,
      mode,
    });
  };

  const handleCancelMatchmaking = () => {
    sendMsg({ type: 'LEAVE_MATCHMAKING' });
  };

  const handleToggleReady = () => {
    sendMsg({ type: 'TOGGLE_READY' });
  };

  const handleStartGame = () => {
    sendMsg({ type: 'START_GAME' });
  };

  const handlePlayCards = (cardIds: string[]) => {
    sendMsg({ type: 'PLAY_CARDS', cardIds });
  };

  const handleProposeRaise = (level: any) => {
    sendMsg({ type: 'PROPOSE_RAISE', level });
    soundEffects.playDaviRaise();
  };

  const handleRespondRaise = (accept: boolean) => {
    sendMsg({ type: 'RESPOND_RAISE', accept });
  };

  const handleDeclareBura = () => {
    sendMsg({ type: 'DECLARE_BURA' });
  };

  const handleSendChat = (text: string) => {
    sendMsg({ type: 'SEND_CHAT', text });
  };

  const handleLeaveRoom = () => {
    sendMsg({ type: 'LEAVE_ROOM' });
    setGameState(null);
  };

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    soundEffects.setEnabled(next);
  };

  const openChat = () => {
    setIsChatOpen(true);
    setUnreadCount(0);
  };

  // Determine current screen view
  const isGameActive =
    gameState &&
    gameState.phase !== 'LOBBY' &&
    gameState.phase !== 'WAITING_FOR_PLAYERS';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-500 selection:text-slate-950">
      {/* Global Navbar */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md px-4 py-3 flex items-center justify-between z-30 sticky top-0">
        <div
          onClick={handleLeaveRoom}
          className="flex items-center gap-2 cursor-pointer group"
        >
          <div className="w-8 h-8 rounded-xl bg-amber-400 text-slate-950 font-black flex items-center justify-center text-sm shadow-md group-hover:scale-105 transition-transform">
            ბ
          </div>
          <span className="font-extrabold text-sm sm:text-base tracking-tight text-slate-100 group-hover:text-amber-400 transition-colors">
            {ge.appName}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Rules Button */}
          <button
            onClick={() => setIsHowToPlayOpen(true)}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 text-xs font-bold transition-colors flex items-center gap-1.5"
          >
            <BookOpen className="w-4 h-4 text-amber-400" />
            <span className="hidden sm:inline">წესები</span>
          </button>

          {/* Sound Toggle */}
          <button
            onClick={toggleSound}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-amber-400 rounded-xl border border-slate-700 transition-colors"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
          </button>

          {/* Chat Toggle Button */}
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

      {/* Main Body Content */}
      <main className="flex-1 p-3 sm:p-6 flex flex-col justify-center max-w-5xl w-full mx-auto relative">
        {/* Toast Alert */}
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
            inMatchmaking={inMatchmaking}
            matchmakingCount={matchmakingCount}
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
            {/* Score Board */}
            <ScoreBoard
              team1MatchScore={gameState.team1MatchScore}
              team2MatchScore={gameState.team2MatchScore}
              team1TrickPoints={gameState.team1TrickPoints}
              team2TrickPoints={gameState.team2TrickPoints}
              targetMatchScore={gameState.settings.targetMatchScore}
              currentRaiseLevel={gameState.currentRaiseLevel}
              trumpCard={gameState.trumpCard}
              trumpSuit={gameState.trumpSuit}
              deckRemainingCount={gameState.deckRemainingCount}
              onProposeRaise={handleProposeRaise}
              canRaise={gameState.phase === 'TURN_IN_PROGRESS'}
            />

            {/* Table Canvas */}
            <Table
              state={gameState}
              hand={hand}
              myPlayerId={myPlayerId}
              onPlayCards={handlePlayCards}
              onDeclareBura={handleDeclareBura}
            />
          </div>
        )}

        {/* Modals */}
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
            onRematch={handleStartGame}
            onBackToLobby={handleLeaveRoom}
          />
        )}

        <HowToPlayModal
          isOpen={isHowToPlayOpen}
          onClose={() => setIsHowToPlayOpen(false)}
        />

        {/* Chat Drawer */}
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
    </div>
  );
}
