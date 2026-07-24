import {
  Card,
  GameState,
  Player,
  PlayerPosition,
  Rank,
  Suit,
  RaiseLevel,
} from '../types/game';

export const RANK_STRENGTH: Record<Rank, number> = {
  '6': 1,
  '7': 2,
  '8': 3,
  '9': 4,
  'J': 5,
  'Q': 6,
  'K': 7,
  '10': 8,
  'A': 9,
};

export const RANK_POINTS: Record<Rank, number> = {
  '6': 0,
  '7': 0,
  '8': 0,
  '9': 0,
  'J': 2,
  'Q': 3,
  'K': 4,
  '10': 10,
  'A': 11,
};

export const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
export const RANKS: Rank[] = ['6', '7', '8', '9', 'J', 'Q', 'K', '10', 'A'];

export const POSITION_ORDER: PlayerPosition[] = ['south', 'west', 'north', 'east'];

export function getNextPosition(pos: PlayerPosition): PlayerPosition {
  const idx = POSITION_ORDER.indexOf(pos);
  return POSITION_ORDER[(idx + 1) % 4];
}

export function getTeamForPosition(pos: PlayerPosition): 1 | 2 {
  return pos === 'south' || pos === 'north' ? 1 : 2;
}

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({
        id: `${suit}_${rank}`,
        suit,
        rank,
      });
    }
  }
  return deck;
}

/**
 * Fisher-Yates shuffle
 */
export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Check if Card A beats Card B under trumpSuit
 */
export function cardBeats(cardA: Card, cardB: Card, trumpSuit: Suit): boolean {
  const isATrump = cardA.suit === trumpSuit;
  const isBTrump = cardB.suit === trumpSuit;

  if (isATrump && !isBTrump) return true;
  if (!isATrump && isBTrump) return false;

  if (isATrump && isBTrump) {
    return RANK_STRENGTH[cardA.rank] > RANK_STRENGTH[cardB.rank];
  }

  // Neither is trump
  if (cardA.suit === cardB.suit) {
    return RANK_STRENGTH[cardA.rank] > RANK_STRENGTH[cardB.rank];
  }

  // Different non-trump suits
  return false;
}

/**
 * Check if playedCards beats leadCards in 1-to-1 matching
 */
export function canBeatAllCards(
  playedCards: Card[],
  leadCards: Card[],
  trumpSuit: Suit
): boolean {
  if (playedCards.length !== leadCards.length) return false;
  const count = playedCards.length;

  // Generate permutations of playedCards
  const permutations: Card[][] = [];

  function permute(arr: Card[], m: Card[] = []) {
    if (arr.length === 0) {
      permutations.push(m);
    } else {
      for (let i = 0; i < arr.length; i++) {
        const curr = arr.slice();
        const next = curr.splice(i, 1);
        permute(curr.slice(), m.concat(next));
      }
    }
  }

  permute(playedCards);

  for (const perm of permutations) {
    let allBeat = true;
    for (let i = 0; i < count; i++) {
      if (!cardBeats(perm[i], leadCards[i], trumpSuit)) {
        allBeat = false;
        break;
      }
    }
    if (allBeat) return true;
  }

  return false;
}

/**
 * Calculate total points in a list of cards
 */
export function calculateCardPoints(cards: Card[]): number {
  return cards.reduce((sum, card) => sum + RANK_POINTS[card.rank], 0);
}

/**
 * Check if hand contains Bura (5 trumps)
 */
export function isBuraHand(hand: Card[], trumpSuit: Suit): boolean {
  if (hand.length < 5) return false;
  return hand.every((c) => c.suit === trumpSuit);
}

/**
 * Check if cards played are all same suit (required for lead)
 */
export function isSameSuitPlay(cards: Card[]): boolean {
  if (cards.length === 0) return false;
  const suit = cards[0].suit;
  return cards.every((c) => c.suit === suit);
}

/**
 * Initialize new game state for a room
 */
export function initializeRound(
  state: GameState,
  cardsByPlayer: Map<string, Card[]>,
  deck: Card[]
): { state: GameState; cardsByPlayer: Map<string, Card[]> } {
  const shuffled = shuffleDeck(deck.length === 36 ? deck : createDeck());
  const newCardsByPlayer = new Map<string, Card[]>();

  // Rotate dealer clockwise
  const dealerPos = state.roundNumber === 1
    ? 'south'
    : getNextPosition(state.dealerPosition);

  // First turn goes to dealer's left
  const firstTurnPos = getNextPosition(dealerPos);

  // Deal 5 cards to each player
  const updatedPlayers = state.players.map((p) => {
    const hand = shuffled.splice(0, 5);
    newCardsByPlayer.set(p.id, hand);
    return {
      ...p,
      cardsInHandCount: 5,
    };
  });

  // Turn bottom card as trump
  const trumpCard = shuffled.pop() || null;
  const trumpSuit = trumpCard ? trumpCard.suit : 'hearts';

  // Place trump card back at the bottom of deck
  if (trumpCard) {
    shuffled.unshift(trumpCard);
  }

  const newState: GameState = {
    ...state,
    phase: 'TURN_IN_PROGRESS',
    dealerPosition: dealerPos,
    currentTurnPosition: firstTurnPos,
    trumpCard,
    trumpSuit,
    deckRemainingCount: shuffled.length,
    currentTrickLeadPosition: null,
    currentTempWinnerPosition: null,
    currentTrickCards: [],
    requiredCardCount: 0,
    team1TrickPoints: 0,
    team2TrickPoints: 0,
    currentRaiseLevel: 1,
    pendingRaise: null,
    winningTeam: null,
    turnDeadline: Date.now() + (state.settings.turnTimeSeconds || 30) * 1000,
  };

  return { state: newState, cardsByPlayer: newCardsByPlayer };
}
