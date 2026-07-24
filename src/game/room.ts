/**
 * BuraRoom — single-room, transport-agnostic game authority.
 *
 * Holds one room's full state (public state + secret hands + secret deck + chat)
 * and exposes the action methods ported from the old server RoomManager.
 * It knows nothing about WebSockets or Firestore: the host client instantiates it,
 * feeds it player actions, and serialises the result to Firestore after each change.
 *
 * Players are identified by their Firebase Auth uid (previously socket id).
 */
import {
  Card,
  ChatMessage,
  GameState,
  Player,
  PlayerPosition,
  RaiseLevel,
  RoomSettings,
} from '../types/game';
import {
  calculateCardPoints,
  canBeatAllCards,
  createDeck,
  getNextPosition,
  getSeatOrder,
  getTeamForPosition,
  initializeRound,
  isBuraHand,
  isSameSuitPlay,
} from './engine';
import { createSystemMessage } from './chat';

type NewChat = Omit<ChatMessage, 'id'>;
export type ActionResult = { success: boolean; error?: string };

export const DEFAULT_SETTINGS: RoomSettings = {
  playerCount: 4,
  turnTimeSeconds: 30,
  targetMatchScore: 11,
  drawRule6060: 'redeal',
  buraAutoWin: true,
  daviWhoCanRaise: 'turn_player',
};

export class BuraRoom {
  state: GameState;
  hands: Map<string, Card[]> = new Map();
  deck: Card[] = [];
  pendingChat: NewChat[] = [];

  private constructor(state: GameState) {
    this.state = state;
  }

  // ---- construction / rehydration ------------------------------------------

  static createNew(
    hostUid: string,
    hostName: string,
    roomCode: string,
    isPrivate: boolean,
    customSettings?: Partial<RoomSettings>
  ): BuraRoom {
    const settings: RoomSettings = { ...DEFAULT_SETTINGS, ...customSettings };
    settings.playerCount = settings.playerCount === 2 ? 2 : 4;

    const host: Player = {
      id: hostUid,
      sessionToken: hostUid,
      name: hostName,
      position: 'south',
      team: getTeamForPosition('south', settings.playerCount),
      isHost: true,
      isReady: true,
      isConnected: true,
      cardsInHandCount: 0,
    };

    const state: GameState = {
      roomId: roomCode,
      roomCode,
      isPrivate,
      phase: 'LOBBY',
      settings,
      players: [host],
      dealerPosition: 'south',
      currentTurnPosition: 'south',
      trumpCard: null,
      trumpSuit: null,
      deckRemainingCount: 36,
      currentTrickLeadPosition: null,
      currentTempWinnerPosition: null,
      currentTrickCards: [],
      requiredCardCount: 0,
      team1TrickPoints: 0,
      team2TrickPoints: 0,
      team1MatchScore: 0,
      team2MatchScore: 0,
      currentRaiseLevel: 1,
      pendingRaise: null,
      roundNumber: 1,
      winningTeam: null,
      turnDeadline: null,
    };

    const room = new BuraRoom(state);
    room.deck = createDeck();
    room.pendingChat.push(
      createSystemMessage(`ოთახი ${roomCode} შეიქმნა. გაუზიარეთ კოდი მეგობრებს.`, 'join')
    );
    return room;
  }

  /** Rebuild an authority instance from Firestore data (e.g. host tab reloaded). */
  static rehydrate(state: GameState, hands: Record<string, Card[]>, deck: Card[]): BuraRoom {
    const room = new BuraRoom(state);
    room.hands = new Map(Object.entries(hands || {}));
    room.deck = deck || [];
    return room;
  }

  handsAsObject(): Record<string, Card[]> {
    return Object.fromEntries(this.hands);
  }

  flushChat(): NewChat[] {
    const out = this.pendingChat;
    this.pendingChat = [];
    return out;
  }

  private say(text: string, type: ChatMessage['type'] = 'chat') {
    this.pendingChat.push(createSystemMessage(text, type));
  }

  // ---- lobby ---------------------------------------------------------------

  addPlayer(uid: string, name: string): ActionResult {
    const state = this.state;
    if (state.phase !== 'LOBBY') return { success: false, error: 'თამაში უკვე დაწყებულია' };

    const existing = state.players.find((p) => p.id === uid);
    if (existing) {
      existing.isConnected = true;
      return { success: true };
    }

    const maxPlayers = state.settings.playerCount;
    if (state.players.length >= maxPlayers) {
      return { success: false, error: `ოთახი უკვე სავსეა (${maxPlayers} მოთამაშე)` };
    }
    if (state.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      return { success: false, error: 'ამ სახელით მოთამაშე უკვე ოთახშია' };
    }

    const seatOrder = getSeatOrder(maxPlayers);
    const occupied = new Set(state.players.map((p) => p.position));
    const pos = seatOrder.find((s) => !occupied.has(s)) || seatOrder[seatOrder.length - 1];

    state.players.push({
      id: uid,
      sessionToken: uid,
      name,
      position: pos,
      team: getTeamForPosition(pos, maxPlayers),
      isHost: false,
      isReady: false,
      isConnected: true,
      cardsInHandCount: 0,
    });
    this.say(`${name} შემოვიდა ოთახში`, 'join');
    return { success: true };
  }

  removePlayer(uid: string): ActionResult {
    const state = this.state;
    const player = state.players.find((p) => p.id === uid);
    if (!player) return { success: false };
    // Only meaningful in the lobby; mid-game removal pauses via isConnected elsewhere.
    if (state.phase === 'LOBBY') {
      state.players = state.players.filter((p) => p.id !== uid);
      this.say(`${player.name} გავიდა ოთახიდან`, 'leave');
      if (player.isHost && state.players.length > 0) {
        state.players[0].isHost = true;
        this.say(`ახალი ჰოსტია ${state.players[0].name}`, 'join');
      }
    } else {
      player.isConnected = false;
    }
    return { success: true };
  }

  setReady(uid: string, ready: boolean): ActionResult {
    const player = this.state.players.find((p) => p.id === uid);
    if (!player) return { success: false };
    player.isReady = ready;
    return { success: true };
  }

  startGame(uid: string): ActionResult {
    const state = this.state;
    const player = state.players.find((p) => p.id === uid);
    if (!player || !player.isHost) return { success: false, error: 'მხოლოდ ჰოსტს შეუძლია დაწყება' };

    const required = state.settings.playerCount;
    if (state.players.length !== required) {
      return { success: false, error: `თამაშის დასაწყებად საჭიროა ზუსტად ${required} მოთამაშე` };
    }
    if (!state.players.every((p) => p.isReady || p.isHost)) {
      return { success: false, error: 'ყველა მოთამაშე უნდა იყოს მზად' };
    }

    const { state: newState, cardsByPlayer, deck } = initializeRound(state, this.hands, createDeck());
    this.state = newState;
    this.hands = cardsByPlayer;
    this.deck = deck;
    this.say('თამაში დაიწყო! კოზირია: ' + newState.trumpSuit, 'join');
    return { success: true };
  }

  /** Re-deal for a rematch, keeping match scores and rotating the dealer. */
  startNextRound(uid: string): ActionResult {
    const state = this.state;
    const player = state.players.find((p) => p.id === uid);
    if (!player || !player.isHost) return { success: false, error: 'მხოლოდ ჰოსტს შეუძლია' };
    if (state.phase !== 'ROUND_FINISHED') return { success: false, error: 'რაუნდი არ დასრულებულა' };

    state.roundNumber += 1;
    const { state: newState, cardsByPlayer, deck } = initializeRound(state, this.hands, createDeck());
    this.state = newState;
    this.hands = cardsByPlayer;
    this.deck = deck;
    this.say(`რაუნდი ${newState.roundNumber} დაიწყო! კოზირია: ` + newState.trumpSuit, 'join');
    return { success: true };
  }

  // ---- gameplay ------------------------------------------------------------

  playCards(uid: string, cardIds: string[]): ActionResult {
    const state = this.state;
    if (state.phase !== 'TURN_IN_PROGRESS') return { success: false, error: 'ახლა სვლის ფაზა არ არის' };

    const player = state.players.find((p) => p.id === uid);
    if (!player || player.position !== state.currentTurnPosition) {
      return { success: false, error: 'თქვენი სვლა არ არის' };
    }

    const playerHand = this.hands.get(uid) || [];
    const selected = playerHand.filter((c) => cardIds.includes(c.id));
    if (selected.length !== cardIds.length || cardIds.length === 0) {
      return { success: false, error: 'არასწორი კარტებია არჩეული' };
    }

    if (state.currentTrickCards.length === 0) {
      if (!isSameSuitPlay(selected)) {
        return { success: false, error: 'პირველმა სვლამ უნდა ჩამოვიდეს ერთი მასტის კარტები' };
      }
      state.requiredCardCount = selected.length;
      state.currentTrickLeadPosition = player.position;
      state.currentTempWinnerPosition = player.position;
    } else {
      if (selected.length !== state.requiredCardCount) {
        return { success: false, error: `უნდა დადოთ ზუსტად ${state.requiredCardCount} კარტი` };
      }
      const leaderTrick = state.currentTrickCards.find(
        (t) => t.playerPosition === state.currentTempWinnerPosition
      );
      if (leaderTrick && state.trumpSuit && canBeatAllCards(selected, leaderTrick.cards, state.trumpSuit)) {
        state.currentTempWinnerPosition = player.position;
      }
    }

    const remaining = playerHand.filter((c) => !cardIds.includes(c.id));
    this.hands.set(uid, remaining);
    player.cardsInHandCount = remaining.length;

    state.currentTrickCards.push({
      playerId: uid,
      playerPosition: player.position,
      cards: selected,
      timestamp: Date.now(),
    });

    if (state.currentTrickCards.length === state.settings.playerCount) {
      this.resolveTrick();
    } else {
      state.currentTurnPosition = getNextPosition(state.currentTurnPosition, state.settings.playerCount);
      state.turnDeadline = Date.now() + (state.settings.turnTimeSeconds || 30) * 1000;
    }
    return { success: true };
  }

  private resolveTrick() {
    const state = this.state;
    const winnerPos = state.currentTempWinnerPosition || state.currentTrickLeadPosition || 'south';
    const winner = state.players.find((p) => p.position === winnerPos);
    const winningTeam = winner ? winner.team : getTeamForPosition(winnerPos, state.settings.playerCount);

    const points = calculateCardPoints(state.currentTrickCards.flatMap((t) => t.cards));
    if (winningTeam === 1) state.team1TrickPoints += points;
    else state.team2TrickPoints += points;

    this.say(`${winner?.name || winnerPos} მოიგო ხელი (+${points} ქულა)`, 'trick_win');

    state.currentTrickCards = [];
    state.requiredCardCount = 0;
    state.currentTrickLeadPosition = null;
    state.currentTempWinnerPosition = null;
    state.currentTurnPosition = winnerPos;

    this.drawCards(winnerPos);

    const totalHandCards = state.players.reduce((sum, p) => sum + p.cardsInHandCount, 0);
    if (totalHandCards === 0 && this.deck.length === 0) {
      this.resolveRound();
    } else {
      state.turnDeadline = Date.now() + (state.settings.turnTimeSeconds || 30) * 1000;
    }
  }

  private drawCards(startPos: PlayerPosition) {
    const state = this.state;
    const playerCount = state.settings.playerCount;
    let pos = startPos;
    let drewSomething = true;
    while (drewSomething && this.deck.length > 0) {
      drewSomething = false;
      for (let i = 0; i < playerCount; i++) {
        const p = state.players.find((pl) => pl.position === pos);
        if (p && p.cardsInHandCount < 5 && this.deck.length > 0) {
          const card = this.deck.pop();
          if (card) {
            const hand = this.hands.get(p.id) || [];
            hand.push(card);
            this.hands.set(p.id, hand);
            p.cardsInHandCount = hand.length;
            drewSomething = true;
          }
        }
        pos = getNextPosition(pos, playerCount);
      }
    }
    state.deckRemainingCount = this.deck.length;
  }

  private resolveRound() {
    const state = this.state;
    state.phase = 'ROUND_FINISHED';

    if (state.team1TrickPoints > state.team2TrickPoints) {
      state.team1MatchScore += state.currentRaiseLevel;
      state.winningTeam = 1;
      this.say(`რაუნდი მოიგო გუნდმა 1! +${state.currentRaiseLevel} მატჩის ქულა`, 'round_win');
    } else if (state.team2TrickPoints > state.team1TrickPoints) {
      state.team2MatchScore += state.currentRaiseLevel;
      state.winningTeam = 2;
      this.say(`რაუნდი მოიგო გუნდმა 2! +${state.currentRaiseLevel} მატჩის ქულა`, 'round_win');
    } else {
      this.say('რაუნდი დასრულდა ფრედ (60 - 60)!', 'round_win');
    }

    if (
      state.team1MatchScore >= state.settings.targetMatchScore ||
      state.team2MatchScore >= state.settings.targetMatchScore
    ) {
      state.phase = 'MATCH_FINISHED';
      const champ = state.team1MatchScore >= state.settings.targetMatchScore ? 1 : 2;
      this.say(`🏆 მატჩი დასრულდა! გამარჯვებულია გუნდი ${champ}`, 'round_win');
    }
  }

  proposeRaise(uid: string, level: RaiseLevel): ActionResult {
    const state = this.state;
    if (state.phase !== 'TURN_IN_PROGRESS') return { success: false, error: 'დავი მხოლოდ თამაშისას' };
    const player = state.players.find((p) => p.id === uid);
    if (!player) return { success: false, error: 'მოთამაშე ვერ მოიძებნა' };
    if (level <= state.currentRaiseLevel) return { success: false, error: 'გაზრდა უფრო მაღალი უნდა იყოს' };

    state.phase = 'RAISE_OFFER_PENDING';
    state.pendingRaise = {
      proposedByPlayerId: uid,
      proposedByTeam: player.team,
      level,
      timestamp: Date.now(),
    };
    const names: Record<number, string> = {
      2: 'დავი (2 ქულა)', 3: 'სე (3 ქულა)', 4: 'ჩარი (4 ქულა)', 5: 'ფანჯი (5 ქულა)', 6: 'შაში (6 ქულა)',
    };
    this.say(`${player.name} გამოაცხადა ${names[level] || 'გაზრდა'}!`, 'davi');
    return { success: true };
  }

  respondRaise(uid: string, accept: boolean): ActionResult {
    const state = this.state;
    if (state.phase !== 'RAISE_OFFER_PENDING' || !state.pendingRaise) {
      return { success: false, error: 'აქტიური შეთავაზება არ არის' };
    }
    const player = state.players.find((p) => p.id === uid);
    if (!player || player.team === state.pendingRaise.proposedByTeam) {
      return { success: false, error: 'მხოლოდ მოწინააღმდეგე გუნდს შეუძლია პასუხი' };
    }

    if (accept) {
      state.currentRaiseLevel = state.pendingRaise.level;
      state.pendingRaise = null;
      state.phase = 'TURN_IN_PROGRESS';
      this.say('შეთავაზება მიღებულია! რაუნდის ფასია ' + state.currentRaiseLevel, 'davi');
    } else {
      const winningTeam = state.pendingRaise.proposedByTeam;
      if (winningTeam === 1) state.team1MatchScore += state.currentRaiseLevel;
      else state.team2MatchScore += state.currentRaiseLevel;
      state.pendingRaise = null;
      state.phase = 'ROUND_FINISHED';
      state.winningTeam = winningTeam;
      this.say(`შეთავაზებაზე უარი ითქვა. რაუნდი მოიგო გუნდმა ${winningTeam}`, 'davi');

      if (
        state.team1MatchScore >= state.settings.targetMatchScore ||
        state.team2MatchScore >= state.settings.targetMatchScore
      ) {
        state.phase = 'MATCH_FINISHED';
        this.say(`🏆 მატჩი დასრულდა! გამარჯვებულია გუნდი ${winningTeam}`, 'round_win');
      }
    }
    return { success: true };
  }

  declareBura(uid: string): ActionResult {
    const state = this.state;
    const player = state.players.find((p) => p.id === uid);
    if (!player || !state.trumpSuit) return { success: false, error: 'შეცდომა' };

    const hand = this.hands.get(uid) || [];
    if (!isBuraHand(hand, state.trumpSuit)) {
      return { success: false, error: 'თქვენ არ გაქვთ 5 კოზირი ხელში!' };
    }

    if (player.team === 1) state.team1MatchScore += state.currentRaiseLevel;
    else state.team2MatchScore += state.currentRaiseLevel;
    state.phase = 'ROUND_FINISHED';
    state.winningTeam = player.team;
    this.say(`🔥 ${player.name}-მ გამოაცხადა ბურა! გუნდმა ${player.team} მოიგო რაუნდი!`, 'bura');

    if (
      state.team1MatchScore >= state.settings.targetMatchScore ||
      state.team2MatchScore >= state.settings.targetMatchScore
    ) {
      state.phase = 'MATCH_FINISHED';
      this.say(`🏆 მატჩი დასრულდა! გამარჯვებულია გუნდი ${player.team}`, 'round_win');
    }
    return { success: true };
  }
}
