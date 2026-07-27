// Structured error codes returned by the authority for rejected actions, so the
// UI can show a clear localized reason (and so the rules stay testable).
export type ActionErrorCode =
  | 'NOT_ELIGIBLE_TO_RAISE'
  | 'OFFER_ALREADY_PENDING'
  | 'CARD_ALREADY_PLAYED'
  | 'NOT_YOUR_TURN'
  | 'NOT_ELIGIBLE_TO_RESPOND'
  | 'INVALID_TEAM_COMPOSITION'
  | 'GAME_ALREADY_STARTED'
  | 'PLAYER_NOT_IN_LOBBY'
  | 'STALE_GAME_STATE'
  | 'TEAM_FULL'
  | 'INVALID_RAISE_LEVEL';

export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  id: string; // e.g. "hearts_A"
  suit: Suit;
  rank: Rank;
}

export type PlayerPosition = 'south' | 'west' | 'north' | 'east';

export interface Player {
  id: string;             // Socket ID or session ID
  sessionToken: string;   // Secret reconnect token
  name: string;
  position: PlayerPosition;
  team: 1 | 2;            // Team 1: South & North. Team 2: West & East
  isHost: boolean;
  isReady: boolean;
  isConnected: boolean;
  disconnectedAt?: number;
  lastSeen?: number;        // last heartbeat timestamp (presence detection)
  cardsInHandCount: number; // Public count sent to other players
  hand?: Card[];           // Only sent to the specific player
}

export type GamePhase =
  | 'LOBBY'
  | 'WAITING_FOR_PLAYERS'
  | 'READY_CHECK'
  | 'DEALING'
  | 'TURN_IN_PROGRESS'
  | 'RAISE_OFFER_PENDING'
  | 'TRICK_RESOLUTION'
  | 'ROUND_FINISHED'
  | 'MATCH_FINISHED'
  | 'PAUSED_FOR_RECONNECT';

export type RaiseLevel = 1 | 2 | 3 | 4 | 5 | 6; // 1=Normal, 2=Davi, 3=Se, 4=Chari, 5=Fanji, 6=Shashi

export interface PlayedTrickCard {
  playerId: string;
  playerPosition: PlayerPosition;
  cards: Card[];
  timestamp: number;
}

export interface DaviProposal {
  proposedByPlayerId: string;
  proposedByTeam: 1 | 2;
  level: RaiseLevel;
  timestamp: number;
}

export type PlayerCount = 2 | 4;

export interface RoomSettings {
  playerCount: PlayerCount;    // 2 = 1v1 (south vs north), 4 = 2v2 teams
  turnTimeSeconds: number;     // 15, 30, 45, 60, 0 (unlimited)
  targetMatchScore: number;    // 3, 5, 7, 11
  drawRule6060: 'redeal' | 'carryover'; // default redeal
  buraAutoWin: boolean;        // default true
  daviWhoCanRaise: 'turn_player' | 'any_player'; // default turn_player
}

export interface GameState {
  roomId: string;
  roomCode: string;
  isPrivate: boolean;
  phase: GamePhase;
  settings: RoomSettings;
  
  // Players array
  players: Player[];
  dealerPosition: PlayerPosition;
  currentTurnPosition: PlayerPosition;
  
  // Deck & Trump
  trumpCard: Card | null;
  trumpSuit: Suit | null;
  deckRemainingCount: number;
  
  // Trick State
  currentTrickLeadPosition: PlayerPosition | null;
  currentTempWinnerPosition: PlayerPosition | null;
  currentTrickCards: PlayedTrickCard[]; // In order of playing
  requiredCardCount: number; // Number of cards led in current trick (1..5)
  
  // Scores
  team1TrickPoints: number; // South & North accumulated trick points in current round
  team2TrickPoints: number; // West & East accumulated trick points in current round
  team1TakenCardCount: number; // Public count of captured cards in current round
  team2TakenCardCount: number; // Public count of captured cards in current round
  team1MatchScore: number;  // Team 1 match wins/points
  team2MatchScore: number;  // Team 2 match wins/points
  
  // Davi / Raise System
  currentRaiseLevel: RaiseLevel;
  pendingRaise: DaviProposal | null;
  // Which team may declare the NEXT raise level. `null` = either team may open
  // the bidding (before any raise is accepted). After a raise is accepted the
  // right to escalate passes to the team that accepted it (the opponents of the
  // proposer), so a team can never declare two consecutive levels.
  raiseEligibleTeam: 1 | 2 | null;
  // Once the first card of the round has been played, no more raises may be
  // proposed (offers happen at the top of the round only).
  roundCardPlayed: boolean;
  // Last player to successfully propose a raise this round (for the seat badge).
  lastRaiseProposerId?: string | null;
  
  // Round info
  roundNumber: number;
  winningTeam: 1 | 2 | null; // For round or match finish
  
  // Turn Timer
  turnDeadline: number | null; // Timestamp ms
  turnStartedAt?: number | null;
  turnWarningAt?: number | null;
  turnWarningSent?: boolean;
  autoPlayDeadline?: number | null;
  
  // Reconnect state
  pausedUntil?: number | null;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
  isSystem?: boolean;
  type?: 'chat' | 'davi' | 'join' | 'leave' | 'trick_win' | 'round_win' | 'bura';
}

// Client to Server Messages
export type ClientMessage =
  | { type: 'JOIN_ROOM'; roomCode: string; name: string; sessionToken?: string }
  | { type: 'CREATE_ROOM'; name: string; settings?: Partial<RoomSettings> }
  | { type: 'JOIN_MATCHMAKING'; name: string; sessionToken?: string; mode?: PlayerCount }
  | { type: 'LEAVE_MATCHMAKING' }
  | { type: 'TOGGLE_READY' }
  | { type: 'MOVE_TO_TEAM'; targetUid: string; team: 1 | 2 }
  | { type: 'START_GAME' }
  | { type: 'UPDATE_SETTINGS'; settings: Partial<RoomSettings> }
  | { type: 'PLAY_CARDS'; cardIds: string[] }
  | { type: 'PROPOSE_RAISE'; level: RaiseLevel }
  | { type: 'RESPOND_RAISE'; accept: boolean; counterLevel?: RaiseLevel }
  | { type: 'DECLARE_BURA' }
  | { type: 'SEND_CHAT'; text: string }
  | { type: 'LEAVE_ROOM' }
  | { type: 'REQUEST_REMATCH' };

// Server to Client Messages
export type ServerMessage =
  | { type: 'SESSION_INIT'; sessionToken: string; player: Player }
  | { type: 'ROOM_STATE'; state: GameState; hand: Card[]; myPosition: PlayerPosition }
  | { type: 'MATCHMAKING_STATUS'; inQueue: boolean; playersFound: number; queueTimeSeconds: number }
  | { type: 'CHAT_MESSAGE'; message: ChatMessage }
  | { type: 'ERROR'; message: string }
  | { type: 'ACTION_REJECTED'; reason: string }
  | { type: 'SYSTEM_ANNOUNCEMENT'; text: string };
