import React, { useMemo, useState } from 'react';
import { Card, GameState, Player, PlayerPosition, Rank, Suit } from '../types/game';
import { CardSvg } from './CardSvg';
import { isBuraHand, isMolodkaHand } from '../game/engine';
import { soundEffects } from '../utils/audio';
import { User, WifiOff, CheckCircle2, Flame } from 'lucide-react';
import { ge } from '../i18n/ge';

interface TableProps {
  state: GameState;
  hand: Card[];
  myPlayerId: string;
  onPlayCards: (cardIds: string[]) => void;
  onDeclareBura: () => void;
  onDeclareMolodka: () => void;
}

const SUIT_ORDER: Record<Suit, number> = { hearts: 0, diamonds: 1, clubs: 2, spades: 3 };
const RANK_ORDER: Record<Rank, number> = { A: 0, '10': 1, K: 2, Q: 3, J: 4, '9': 5, '8': 6, '7': 7, '6': 8 };

export const Table: React.FC<TableProps> = ({
  state,
  hand,
  myPlayerId,
  onPlayCards,
  onDeclareBura,
  onDeclareMolodka,
}) => {
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);

  const myPlayer = state.players.find((p) => p.id === myPlayerId);
  const myPosition = myPlayer?.position || 'south';

  // Map server positions to relative UI seats (South=You, West=Left, North=Top, East=Right)
  const serverPositions: PlayerPosition[] = ['south', 'west', 'north', 'east'];
  const myIdx = serverPositions.indexOf(myPosition);

  const getRelativePosition = (pos: PlayerPosition): 'south' | 'west' | 'north' | 'east' => {
    const idx = serverPositions.indexOf(pos);
    const relIdx = (idx - myIdx + 4) % 4;
    return ['south', 'west', 'north', 'east'][relIdx] as any;
  };

  const getPlayerByRelPos = (relPos: 'south' | 'west' | 'north' | 'east'): Player | undefined => {
    return state.players.find((p) => getRelativePosition(p.position) === relPos);
  };

  const isMyTurn = state.currentTurnPosition === myPosition;
  const isTwoPlayer = state.settings.playerCount === 2;
  const sortedHand = useMemo(
    () => [...hand].sort((a, b) => SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit] || RANK_ORDER[a.rank] - RANK_ORDER[b.rank]),
    [hand]
  );

  const toggleSelectCard = (card: Card) => {
    soundEffects.playCardSnap();
    if (selectedCardIds.includes(card.id)) {
      setSelectedCardIds(selectedCardIds.filter((id) => id !== card.id));
    } else {
      setSelectedCardIds([...selectedCardIds, card.id]);
    }
  };

  const southPlayer = getPlayerByRelPos('south');
  const northPlayer = getPlayerByRelPos('north');
  const westPlayer = getPlayerByRelPos('west');
  const eastPlayer = getPlayerByRelPos('east');
  const trickWinner = state.currentTempWinnerPosition
    ? state.players.find((p) => p.position === state.currentTempWinnerPosition)
    : null;
  const currentTurnPlayer = state.players.find((p) => p.position === state.currentTurnPosition);
  const showTrickWinner =
    state.phase === 'TRICK_RESOLUTION' && state.currentTrickCards.length === state.settings.playerCount;
  const currentTrickCardCount = state.currentTrickCards.reduce((sum, trick) => sum + trick.cards.length, 0);

  // Declaration eligibility — only shown when the hand actually qualifies.
  const canDeclareBura = !!state.trumpSuit && state.phase === 'TURN_IN_PROGRESS' && isBuraHand(hand, state.trumpSuit);
  const canDeclareMolodka = !!state.trumpSuit && state.phase === 'TURN_IN_PROGRESS' && isMolodkaHand(hand, state.trumpSuit);

  // When the trick resolves, slide the whole pile toward the winner's seat, then it fades out.
  const winnerRel = showTrickWinner && state.currentTempWinnerPosition
    ? getRelativePosition(state.currentTempWinnerPosition)
    : null;
  const trickSlide =
    winnerRel === 'south' ? 'translateY(300px)'
    : winnerRel === 'north' ? 'translateY(-300px)'
    : winnerRel === 'west' ? 'translateX(-340px)'
    : winnerRel === 'east' ? 'translateX(300px)'
    : 'none';
  const selectedCards = sortedHand.filter((card) => selectedCardIds.includes(card.id));
  const selectedCardsAreSameSuit =
    selectedCards.length > 0 && selectedCards.every((card) => card.suit === selectedCards[0].suit);
  const expectedPlayCount = state.currentTrickCards.length === 0 ? selectedCards.length : state.requiredCardCount;
  const canPlaySelection =
    isMyTurn &&
    state.phase === 'TURN_IN_PROGRESS' &&
    selectedCards.length > 0 &&
    (state.currentTrickCards.length > 0 || selectedCardsAreSameSuit) &&
    selectedCards.length === expectedPlayCount;

  const handlePlaySelected = () => {
    if (!canPlaySelection) return;
    onPlayCards(selectedCardIds);
    setSelectedCardIds([]);
  };

  const renderPlayerBadge = (player?: Player, relPos?: string) => {
    if (!player) {
      return (
        <div className="flex items-center gap-2 bg-slate-900/60 border border-slate-800/80 px-3 py-1.5 rounded-full text-slate-500 text-xs">
          <User className="w-3.5 h-3.5" />
          <span>ცარიელი ადგილი</span>
        </div>
      );
    }

    const isCurrentTurn = state.currentTurnPosition === player.position;
    const isDealer = state.dealerPosition === player.position;

    return (
      <div
        className={`flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-md border transition-all ${
          isCurrentTurn
            ? 'bg-amber-500/20 border-amber-400 text-amber-300 ring-2 ring-amber-400/50 shadow-lg scale-105'
            : 'bg-slate-900/80 border-slate-700 text-slate-200'
        }`}
      >
        <div className="relative">
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${
              player.team === 1 ? 'bg-amber-500 text-slate-950' : 'bg-cyan-600 text-slate-100'
            }`}
          >
            {player.name.charAt(0).toUpperCase()}
          </div>
          {isDealer && (
            <span className="absolute -bottom-1 -right-1 bg-amber-400 text-slate-950 text-[8px] font-black w-3.5 h-3.5 rounded-full flex items-center justify-center border border-slate-900">
              D
            </span>
          )}
        </div>

        <div className="flex flex-col text-left leading-tight">
          <div className="flex items-center gap-1">
            <span className="font-bold text-xs truncate max-w-[90px]">{player.name}</span>
            {player.id === myPlayerId && <span className="text-[9px] text-amber-400">(თქვენ)</span>}
          </div>
          <span className="text-[9px] text-slate-400">
            გუნდი {player.team} • {player.cardsInHandCount} კარტი
          </span>
        </div>

        {!player.isConnected && (
          <WifiOff className="w-3.5 h-3.5 text-red-400 animate-pulse ml-1" />
        )}
      </div>
    );
  };

  return (
    <div className="relative w-full h-[520px] sm:h-[600px] rounded-3xl bg-gradient-to-b from-emerald-950 via-emerald-900 to-slate-950 border-4 border-amber-900/60 shadow-2xl p-4 overflow-hidden flex flex-col justify-between select-none">
      {/* Felt Texture Overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(#10b981_1px,transparent_1px)] [background-size:16px_16px] opacity-10 pointer-events-none" />

      {/* Table Center Felt Ring */}
      <div className="absolute inset-16 sm:inset-20 rounded-full border border-emerald-500/20 bg-emerald-900/20 pointer-events-none" />

      {state.trumpCard && (
        <div className="absolute top-4 right-4 z-20 flex flex-col items-center gap-1 bg-emerald-950/75 border border-amber-400/50 rounded-2xl px-2 py-2 shadow-xl backdrop-blur-md">
          <CardSvg card={state.trumpCard} size="sm" isTrump trumpMark />
          <span className="text-[10px] font-black text-amber-300">კოზირი</span>
        </div>
      )}

      {/* TOP SEAT (NORTH - PARTNER) */}
      <div className="relative z-10 flex flex-col items-center gap-1">
        {renderPlayerBadge(northPlayer, 'north')}
        {northPlayer && (
          <div className="flex -space-x-4">
            {Array.from({ length: northPlayer.cardsInHandCount }).map((_, idx) => (
              <CardSvg key={idx} faceDown size="sm" />
            ))}
          </div>
        )}
      </div>

      {/* MIDDLE ROW (WEST & EAST & CENTER TRICK AREA) */}
      <div className="relative z-10 flex items-center justify-between my-auto px-2 sm:px-6">
        {/* WEST SEAT (hidden in 1v1 mode) */}
        {!isTwoPlayer && (
          <div className="flex flex-col items-center gap-2 max-w-[120px]">
            {renderPlayerBadge(westPlayer, 'west')}
            {westPlayer && (
              <div className="flex -space-x-6 rotate-90 my-2">
                {Array.from({ length: westPlayer.cardsInHandCount }).map((_, idx) => (
                  <CardSvg key={idx} faceDown size="sm" />
                ))}
              </div>
            )}
          </div>
        )}

        {/* CENTER TRICK PLAY AREA */}
        <div className="flex-1 flex flex-col items-center justify-center min-h-[160px] relative">
          {state.currentTrickCards.length === 0 ? (
            <div className="flex flex-col items-center gap-2">
              {state.turnWarningSent && (
                <div className="bg-red-600 text-white px-4 py-1.5 rounded-full text-xs font-black shadow-lg">
                  გაფრთხილება: {currentTurnPlayer?.name || 'მოთამაშე'} უნდა ჩამოვიდეს
                </div>
              )}
              {!currentTurnPlayer?.isConnected && (
                <div className="bg-amber-400 text-slate-950 px-4 py-1.5 rounded-full text-xs font-black shadow-lg">
                  კავშირი გაწყვეტილია, ავტომატური სვლა მზადდება
                </div>
              )}
              <div className="text-center text-xs text-emerald-300/60 italic bg-emerald-950/40 px-4 py-2 rounded-full border border-emerald-500/10 backdrop-blur-sm">
                {isMyTurn ? ge.yourTurn : `${ge.waitingForTurn} ${currentTurnPlayer?.name || ''}`}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              {showTrickWinner && (
                <div className="bg-amber-400 text-slate-950 px-4 py-1.5 rounded-full text-xs font-black shadow-lg">
                  ხელი წაიღო {trickWinner?.name || state.currentTempWinnerPosition} • {currentTrickCardCount} კარტი
                </div>
              )}

              <div
                className="relative h-[190px] w-[190px] sm:w-[220px] bg-emerald-950/50 rounded-2xl border border-emerald-500/20 backdrop-blur-md overflow-visible"
                style={{
                  transform: showTrickWinner ? trickSlide : 'none',
                  opacity: showTrickWinner ? 0 : 1,
                  transition: showTrickWinner
                    ? 'transform 900ms ease-in 1200ms, opacity 700ms ease-in 1500ms'
                    : 'none',
                }}
              >
              {state.currentTrickCards.map((trick, idx) => {
                const isWinner = state.currentTempWinnerPosition === trick.playerPosition;
                const playerName = state.players.find((p) => p.id === trick.playerId)?.name || trick.playerPosition;

                return (
                  <div
                    key={idx}
                    className={`absolute left-1/2 top-2 flex flex-col items-center p-2 rounded-xl border transition-all ${
                      isWinner
                        ? 'bg-amber-500/20 border-amber-400 ring-2 ring-amber-400/50 shadow-lg'
                        : 'bg-slate-900/60 border-slate-800'
                    }`}
                    style={{ zIndex: idx + 1, transform: `translate(-50%, ${idx * 26}px)` }}
                  >
                    <span className="text-[10px] font-bold text-slate-300 mb-1">
                      {playerName}
                    </span>
                    <div className="flex -space-x-2">
                      {trick.cards.map((card) => (
                        <CardSvg key={card.id} card={card} size="sm" isTrump={card.suit === state.trumpSuit} />
                      ))}
                    </div>
                    {isWinner && (
                      <span className="mt-1 text-[9px] font-black text-amber-300">
                        იღებს
                      </span>
                    )}
                  </div>
                );
              })}
              </div>
            </div>
          )}
        </div>

        {/* EAST SEAT (hidden in 1v1 mode) */}
        {!isTwoPlayer && (
          <div className="flex flex-col items-center gap-2 max-w-[120px]">
            {renderPlayerBadge(eastPlayer, 'east')}
            {eastPlayer && (
              <div className="flex -space-x-6 -rotate-90 my-2">
                {Array.from({ length: eastPlayer.cardsInHandCount }).map((_, idx) => (
                  <CardSvg key={idx} faceDown size="sm" />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* BOTTOM SEAT (SOUTH - YOU & YOUR HAND) */}
      <div className="relative z-10 flex flex-col items-center gap-2">
        {/* Declaration buttons — only when your hand actually qualifies */}
        {(canDeclareBura || canDeclareMolodka) && (
          <div className="flex items-center gap-2 mb-1">
            {canDeclareBura && (
              <button
                onClick={onDeclareBura}
                className="bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white font-black px-4 py-2 rounded-xl text-xs shadow-lg transition-all flex items-center gap-1.5 border border-red-300 ring-2 ring-red-400/40 animate-pulse"
              >
                <Flame className="w-4 h-4" />
                <span>{ge.declareBura}</span>
              </button>
            )}
            {canDeclareMolodka && (
              <button
                onClick={onDeclareMolodka}
                className="bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 text-white font-black px-4 py-2 rounded-xl text-xs shadow-lg transition-all flex items-center gap-1.5 border border-fuchsia-300 ring-2 ring-fuchsia-400/40 animate-pulse"
              >
                <span>🃏 {ge.declareMolodka}</span>
              </button>
            )}
          </div>
        )}

        {/* Play control when it's your turn */}
        {isMyTurn && state.phase === 'TURN_IN_PROGRESS' && (
          <div className="flex items-center gap-2 mb-1 animate-bounce">
            <button
              onClick={handlePlaySelected}
              disabled={!canPlaySelection}
              className={`font-black px-5 py-2 rounded-xl text-xs shadow-lg transition-all flex items-center gap-1.5 ${
                canPlaySelection
                  ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 scale-105 ring-2 ring-amber-200'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{ge.playSelectedCards} ({selectedCardIds.length})</span>
            </button>
          </div>
        )}

        {/* Player's Cards in Hand */}
        <div className="flex items-center justify-center -space-x-3 sm:-space-x-4 max-w-full overflow-x-auto p-1">
          {sortedHand.map((card) => {
            const isSelected = selectedCardIds.includes(card.id);
            const isTrump = card.suit === state.trumpSuit;

            return (
              <CardSvg
                key={card.id}
                card={card}
                selected={isSelected}
                isTrump={isTrump}
                trumpMark={state.trumpCard?.id === card.id}
                onClick={() => toggleSelectCard(card)}
                size="md"
              />
            );
          })}
        </div>

        {renderPlayerBadge(southPlayer, 'south')}
      </div>
    </div>
  );
};
