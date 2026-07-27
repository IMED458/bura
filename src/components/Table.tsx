import React, { useMemo, useState } from 'react';
import { Card, GameState, Player, PlayerPosition, Rank, Suit } from '../types/game';
import { CardSvg } from './CardSvg';
import { isBuraHand, isMolodkaHand } from '../game/engine';
import { soundEffects } from '../utils/audio';
import { User, WifiOff, CheckCircle2, Flame, Crown, Layers } from 'lucide-react';
import { ge } from '../i18n/ge';

interface TableProps {
  state: GameState;
  hand: Card[];
  myPlayerId: string;
  onPlayCards: (cardIds: string[]) => void;
  onDeclareBura: () => void;
  onDeclareMolodka: () => void;
  onProposeRaise: (level: number) => void;
}

type RelPos = 'south' | 'west' | 'north' | 'east';

const SUIT_ORDER: Record<Suit, number> = { hearts: 0, diamonds: 1, clubs: 2, spades: 3 };
const RANK_ORDER: Record<Rank, number> = { A: 0, '10': 1, K: 2, Q: 3, J: 4, '9': 5, '8': 6, '7': 7, '6': 8 };
const SUIT_SYMBOL: Record<Suit, string> = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
const SUIT_NAME: Record<Suit, string> = { hearts: 'გული', diamonds: 'აგური', clubs: 'ჯვარი', spades: 'ყვავი' };
const SUIT_IS_RED = (s: Suit) => s === 'hearts' || s === 'diamonds';

export const Table: React.FC<TableProps> = ({
  state,
  hand,
  myPlayerId,
  onPlayCards,
  onDeclareBura,
  onDeclareMolodka,
  onProposeRaise,
}) => {
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);

  const myPlayer = state.players.find((p) => p.id === myPlayerId);
  const myPosition = myPlayer?.position || 'south';

  // Map server positions to relative UI seats (South=You, West=Left, North=Top, East=Right)
  const serverPositions: PlayerPosition[] = ['south', 'west', 'north', 'east'];
  const myIdx = serverPositions.indexOf(myPosition);

  const getRelativePosition = (pos: PlayerPosition): RelPos => {
    const idx = serverPositions.indexOf(pos);
    const relIdx = (idx - myIdx + 4) % 4;
    return ['south', 'west', 'north', 'east'][relIdx] as RelPos;
  };

  const getPlayerByRelPos = (relPos: RelPos): Player | undefined =>
    state.players.find((p) => getRelativePosition(p.position) === relPos);

  const isMyTurn = state.currentTurnPosition === myPosition;
  const isTwoPlayer = state.settings.playerCount === 2;
  const sortedHand = useMemo(
    () => [...hand].sort((a, b) => SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit] || RANK_ORDER[a.rank] - RANK_ORDER[b.rank]),
    [hand]
  );

  const toggleSelectCard = (card: Card) => {
    soundEffects.playCardSnap();
    setSelectedCardIds((prev) =>
      prev.includes(card.id) ? prev.filter((id) => id !== card.id) : [...prev, card.id]
    );
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

  // When the trick resolves, slide the whole pile toward the winner's seat, then it fades.
  const winnerRel = showTrickWinner && state.currentTempWinnerPosition
    ? getRelativePosition(state.currentTempWinnerPosition)
    : null;
  const trickSlide =
    winnerRel === 'south' ? 'translate(-50%, 46%) scale(0.75)'
    : winnerRel === 'north' ? 'translate(-50%, -46%) scale(0.75)'
    : winnerRel === 'west' ? 'translate(-88%, -50%) scale(0.75)'
    : winnerRel === 'east' ? 'translate(-12%, -50%) scale(0.75)'
    : 'translate(-50%, -50%)';

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

  // Double-click a card to play it immediately — but only when a single card is
  // a legal move (leading, or following a one-card trick).
  const canPlaySingle =
    isMyTurn &&
    state.phase === 'TURN_IN_PROGRESS' &&
    (state.currentTrickCards.length === 0 || state.requiredCardCount === 1);
  const playSingle = (card: Card) => {
    if (!canPlaySingle) return;
    onPlayCards([card.id]);
    setSelectedCardIds([]);
  };

  // Offer (davi / se / chari …) eligibility — offers only at the top of the
  // round and only by the team allowed to escalate next.
  const myTeam = myPlayer?.team;
  const raiseWindowOpen =
    state.phase === 'TURN_IN_PROGRESS' && !state.roundCardPlayed && state.currentRaiseLevel < 6;
  const teamEligibleToRaise =
    state.raiseEligibleTeam === null || state.raiseEligibleTeam === myTeam;
  const nextRaiseLevel = state.currentRaiseLevel + 1;
  const canProposeRaise = raiseWindowOpen && teamEligibleToRaise;
  const raiseDisabledReason = !teamEligibleToRaise
    ? ge.raiseOnlyOpponent.replace('{name}', ge.raiseNames[nextRaiseLevel] || '')
    : '';

  // ---- seat badge ----------------------------------------------------------
  const renderPlayerBadge = (player?: Player, compact = false) => {
    if (!player) {
      return (
        <div className="flex items-center gap-1.5 bg-black/30 border border-white/10 px-2.5 py-1 rounded-full text-rose-200/60 text-[11px]">
          <User className="w-3.5 h-3.5" />
          {!compact && <span>{ge.emptySeat}</span>}
        </div>
      );
    }

    const isCurrentTurn = state.currentTurnPosition === player.position;
    const isDealer = state.dealerPosition === player.position;
    const isMe = player.id === myPlayerId;
    const declaredRaise = state.lastRaiseProposerId === player.id && state.currentRaiseLevel > 1;
    const teamScore = player.team === 1 ? state.team1MatchScore : state.team2MatchScore;

    return (
      <div
        title={`${player.name} · გუნდი ${player.team} · ${teamScore} ქულა · ${player.cardsInHandCount} კარტი`}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-2xl backdrop-blur-md border transition-all ${
          compact ? 'max-w-[24vw] sm:max-w-[120px]' : 'max-w-[46vw]'
        } ${
          isCurrentTurn
            ? 'bg-amber-400/25 border-amber-300 text-amber-50 ring-2 ring-amber-300/60 shadow-lg bura-turn-active'
            : 'bg-black/45 border-white/15 text-rose-50'
        }`}
      >
        <div className="relative shrink-0">
          <div
            className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center font-black text-[11px] shadow ${
              player.team === 1 ? 'bg-amber-400 text-rose-950' : 'bg-cyan-400 text-cyan-950'
            }`}
          >
            {player.name.charAt(0).toUpperCase()}
          </div>
          {isDealer && (
            <span className="absolute -bottom-1 -right-1 bg-white text-rose-900 text-[8px] font-black w-3.5 h-3.5 rounded-full flex items-center justify-center border border-rose-900/40">
              D
            </span>
          )}
        </div>

        <div className="flex flex-col text-left leading-tight min-w-0">
          <div className="flex items-center gap-1 min-w-0">
            <span className="font-bold text-[11px] sm:text-xs truncate">{player.name}</span>
            {isMe && !compact && <span className="text-[9px] text-amber-200 shrink-0">({ge.you})</span>}
          </div>
          {!compact && (
            <span className="text-[9px] text-rose-100/70 truncate">
              გუნდი {player.team} · {player.cardsInHandCount} კარტი
            </span>
          )}
        </div>

        {!compact && declaredRaise && (
          <span className="shrink-0 text-[9px] font-black bg-orange-500 text-white px-1.5 py-0.5 rounded-full">
            {ge.raiseNames[state.currentRaiseLevel] || ''}
          </span>
        )}
        {isCurrentTurn && (
          <span className="shrink-0 text-[9px] font-black text-amber-100 whitespace-nowrap">●</span>
        )}
        {!player.isConnected && <WifiOff className="w-3 h-3 text-red-300 animate-pulse shrink-0" />}
      </div>
    );
  };

  // Face-down fan for opponents/partner.
  const faceDownFan = (player: Player, orientation: 'row' | 'col') => (
    <div className={`flex ${orientation === 'row' ? '-space-x-5' : 'flex-col -space-y-8'} items-center`}>
      {Array.from({ length: Math.min(player.cardsInHandCount, 5) }).map((_, idx) => (
        <CardSvg key={idx} faceDown size="sm" />
      ))}
    </div>
  );

  // ---- played card slot (positional, animated deal) ------------------------
  const slotStyle: Record<RelPos, React.CSSProperties> = {
    south: { left: '50%', bottom: 0, transform: 'translateX(-50%)' },
    north: { left: '50%', top: 0, transform: 'translateX(-50%)' },
    west: { left: 0, top: '50%', transform: 'translateY(-50%)' },
    east: { right: 0, top: '50%', transform: 'translateY(-50%)' },
  };

  const renderPlayedSlot = (trick: (typeof state.currentTrickCards)[number]) => {
    const relPos = getRelativePosition(trick.playerPosition);
    const player = state.players.find((p) => p.id === trick.playerId);
    const isWinner = state.currentTempWinnerPosition === trick.playerPosition;
    const teamColor = player?.team === 1 ? 'bg-amber-400 text-rose-950' : 'bg-cyan-400 text-cyan-950';

    return (
      <div key={trick.playerId} className="absolute flex flex-col items-center gap-1" style={slotStyle[relPos]}>
        {(relPos === 'north') && (
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full max-w-[80px] truncate ${teamColor}`} title={player?.name}>
            {player?.name}
          </span>
        )}
        <div className={`deal-from-${relPos} rounded-xl ${isWinner ? 'ring-2 ring-amber-300 rounded-xl shadow-[0_0_18px_rgba(251,191,36,0.7)]' : ''}`}>
          <div className="flex -space-x-3">
            {trick.cards.map((card) => (
              <CardSvg key={card.id} card={card} size="sm" isTrump={card.suit === state.trumpSuit} />
            ))}
          </div>
        </div>
        {(relPos !== 'north') && (
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full max-w-[80px] truncate ${teamColor}`} title={player?.name}>
            {player?.name}
          </span>
        )}
      </div>
    );
  };

  const turnLabel = isMyTurn ? ge.yourTurn : `${ge.waitingForTurn} ${currentTurnPlayer?.name || ''}`;

  return (
    <div className="bura-table bura-table-felt relative rounded-[28px] border-4 border-amber-900/50 flex flex-col justify-between p-3 sm:p-5 select-none overflow-hidden">
      {/* Trump indicator + remaining deck count — always visible, its own block */}
      {state.trumpCard && state.trumpSuit && (
        <div className="absolute top-2.5 right-2.5 sm:top-4 sm:right-4 z-30 flex flex-col items-center gap-1 bg-black/45 border border-amber-300/50 rounded-2xl px-2 py-2 shadow-xl backdrop-blur-md">
          <CardSvg card={state.trumpCard} size="sm" isTrump trumpMark />
          <div className="flex items-center gap-1 text-[11px] font-black text-amber-200">
            <span className={SUIT_IS_RED(state.trumpSuit) ? 'text-red-400' : 'text-slate-100'}>
              {SUIT_SYMBOL[state.trumpSuit]}
            </span>
            <span>{ge.trump}</span>
          </div>
          <span className="text-[9px] text-rose-100/70">{SUIT_NAME[state.trumpSuit]}</span>
          <div className="mt-1 flex flex-col items-center gap-0.5 bg-black/45 rounded-xl px-2.5 py-1 border border-white/15">
            <div className="flex items-center gap-1 text-amber-100">
              <Layers className="w-3.5 h-3.5" />
              <span className="text-sm font-black leading-none">{state.deckRemainingCount}</span>
            </div>
            <span className="text-[8px] text-rose-100/70 leading-none">{ge.deckRemainingLabel}</span>
          </div>
        </div>
      )}

      {/* TOP SEAT (NORTH / PARTNER) */}
      <div className="relative z-10 flex flex-col items-center gap-1 min-h-[60px]">
        {renderPlayerBadge(northPlayer)}
        {northPlayer && faceDownFan(northPlayer, 'row')}
      </div>

      {/* MIDDLE ROW (WEST | CENTER | EAST) */}
      <div className="relative z-10 flex items-stretch justify-between gap-1 flex-1 my-1">
        {/* WEST */}
        <div className="flex flex-col items-start justify-center gap-1.5 w-[22%] max-w-[140px]">
          {!isTwoPlayer && westPlayer && renderPlayerBadge(westPlayer, true)}
          {!isTwoPlayer && westPlayer && faceDownFan(westPlayer, 'col')}
        </div>

        {/* CENTER — played cards + turn banner */}
        <div className="flex-1 flex flex-col items-center justify-center gap-2 min-w-0">
          {showTrickWinner && (
            <div className="z-20 flex items-center gap-1.5 bg-amber-300 text-rose-950 px-3 py-1.5 rounded-full text-[11px] font-black shadow-lg animate-fade-in">
              <Crown className="w-3.5 h-3.5" />
              {ge.trickTakenBy} {trickWinner?.name || ''} · {currentTrickCardCount} {ge.cardsWord}
            </div>
          )}

          {state.currentTrickCards.length === 0 ? (
            <div className="flex flex-col items-center gap-2 text-center">
              {state.turnWarningSent && (
                <div className="bg-red-600 text-white px-3 py-1.5 rounded-full text-[11px] font-black shadow-lg">
                  {ge.turnWarning}: {currentTurnPlayer?.name || ''}
                </div>
              )}
              {!currentTurnPlayer?.isConnected && (
                <div className="bg-amber-300 text-rose-950 px-3 py-1.5 rounded-full text-[11px] font-black shadow-lg">
                  {ge.autoPlayPending}
                </div>
              )}
              <div
                className={`px-4 py-2 rounded-full border text-xs font-bold backdrop-blur-sm ${
                  isMyTurn
                    ? 'bg-amber-400/25 border-amber-300 text-amber-50 bura-turn-active'
                    : 'bg-black/35 border-white/10 text-rose-100/80'
                }`}
              >
                {turnLabel}
              </div>
            </div>
          ) : (
            <div
              className="relative"
              style={{
                width: 'clamp(180px, 44vw, 340px)',
                height: 'clamp(150px, 30vh, 250px)',
              }}
            >
              <div
                className="absolute left-1/2 top-1/2"
                style={{
                  width: '100%',
                  height: '100%',
                  transform: trickSlide,
                  opacity: showTrickWinner ? 0 : 1,
                  // Always-on transition so the pile visibly glides toward the
                  // winner's seat (after a beat) instead of snapping.
                  transition:
                    'transform 800ms cubic-bezier(0.22,1,0.36,1) 900ms, opacity 550ms ease-in 1350ms',
                }}
              >
                <div className="relative w-full h-full">
                  {state.currentTrickCards.map(renderPlayedSlot)}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* EAST */}
        <div className="flex flex-col items-end justify-center gap-1.5 w-[22%] max-w-[140px]">
          {!isTwoPlayer && eastPlayer && renderPlayerBadge(eastPlayer, true)}
          {!isTwoPlayer && eastPlayer && faceDownFan(eastPlayer, 'col')}
        </div>
      </div>

      {/* BOTTOM SEAT (SOUTH — YOU) */}
      <div className="relative z-10 flex flex-col items-center gap-1.5">
        {/* Offer controls (davi / se / chari …) — only at the top of the round */}
        {raiseWindowOpen && (
          <button
            onClick={() => canProposeRaise && onProposeRaise(nextRaiseLevel)}
            disabled={!canProposeRaise}
            title={canProposeRaise ? undefined : raiseDisabledReason}
            aria-label={ge.declareNext.replace('{name}', ge.raiseNames[nextRaiseLevel] || '')}
            className={`font-black px-5 py-2 rounded-xl text-xs shadow-lg transition-all flex items-center gap-1.5 border ${
              canProposeRaise
                ? 'bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-400 hover:to-red-500 text-white border-orange-200 ring-2 ring-orange-400/40 animate-pulse'
                : 'bg-black/30 text-rose-200/50 cursor-not-allowed border-white/10'
            }`}
          >
            <Flame className="w-4 h-4" />
            <span>{ge.raiseNamesLong[nextRaiseLevel] || ge.raiseNames[nextRaiseLevel]} {ge.declareVerb}</span>
          </button>
        )}

        {/* Declaration buttons — only when your hand qualifies */}
        {(canDeclareBura || canDeclareMolodka) && (
          <div className="flex items-center gap-2">
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

        {/* Play control */}
        {isMyTurn && state.phase === 'TURN_IN_PROGRESS' && (
          <button
            onClick={handlePlaySelected}
            disabled={!canPlaySelection}
            aria-label={ge.playSelectedCards}
            className={`font-black px-5 py-2 rounded-xl text-xs shadow-lg transition-all flex items-center gap-1.5 ${
              canPlaySelection
                ? 'bg-amber-300 hover:bg-amber-200 text-rose-950 scale-105 ring-2 ring-amber-100'
                : 'bg-black/30 text-rose-200/50 cursor-not-allowed border border-white/10'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{ge.playSelectedCards} ({selectedCardIds.length})</span>
          </button>
        )}

        {renderPlayerBadge(southPlayer)}
        {isMyTurn && state.phase === 'TURN_IN_PROGRESS' && (
          <span className="text-[9px] text-rose-100/60">{ge.doubleClickHint}</span>
        )}

        {/* Your hand */}
        <div className="flex items-end justify-center overflow-x-auto max-w-full px-1">
          <div className="flex items-end -space-x-3 sm:-space-x-2">
            {sortedHand.map((card) => (
              <CardSvg
                key={card.id}
                card={card}
                selected={selectedCardIds.includes(card.id)}
                isTrump={card.suit === state.trumpSuit}
                trumpMark={state.trumpCard?.id === card.id}
                onClick={() => toggleSelectCard(card)}
                onDoubleClick={() => playSingle(card)}
                size="md"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
