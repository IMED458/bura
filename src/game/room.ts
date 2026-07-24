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
  RANK_POINTS,
  RANK_STRENGTH,
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

const WARNING_AFTER_MS = 15_000;
const DISCONNECT_AFTER_MS = 30_000;
const AUTO_PLAY_AFTER_DISCONNECT_MS = 20_000;

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
      team1TakenCardCount: 0,
      team2TakenCardCount: 0,
      team1MatchScore: 0,
      team2MatchScore: 0,
      currentRaiseLevel: 1,
      pendingRaise: null,
      roundNumber: 1,
      winningTeam: null,
      turnDeadline: null,
      turnStartedAt: null,
      turnWarningAt: null,
      turnWarningSent: false,
      autoPlayDeadline: null,
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
    const existing = state.players.find((p) => p.id === uid);
    if (existing) {
      existing.isConnected = true;
      existing.disconnectedAt = undefined;
      if (state.phase === 'TURN_IN_PROGRESS' && existing.position === state.currentTurnPosition) {
        this.startTurnTimer();
      }
      return { success: true };
    }

    if (state.phase !== 'LOBBY') return { success: false, error: 'თამაში უკვე დაწყებულია' };

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
      player.disconnectedAt = Date.now();
      this.say(`${player.name} კავშირიდან გავიდა. თუ მისი სვლაა, 20 წამში კარტი ავტომატურად დაიდება.`, 'leave');
      if (player.position === state.currentTurnPosition) {
        state.autoPlayDeadline = player.disconnectedAt + AUTO_PLAY_AFTER_DISCONNECT_MS;
        state.turnDeadline = state.autoPlayDeadline;
      }
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
    this.startTurnTimer();
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
    this.startTurnTimer();
    this.say(`რაუნდი ${newState.roundNumber} დაიწყო! კოზირია: ` + newState.trumpSuit, 'join');
    return { success: true };
  }

  /** Start a brand-new match after one finished: reset scores and re-deal. */
  newMatch(uid: string): ActionResult {
    const state = this.state;
    const player = state.players.find((p) => p.id === uid);
    if (!player || !player.isHost) return { success: false, error: 'მხოლოდ ჰოსტს შეუძლია' };

    state.team1MatchScore = 0;
    state.team2MatchScore = 0;
    state.roundNumber = 1;
    state.dealerPosition = 'south';
    const { state: newState, cardsByPlayer, deck } = initializeRound(state, this.hands, createDeck());
    this.state = newState;
    this.hands = cardsByPlayer;
    this.deck = deck;
    this.startTurnTimer();
    this.say('ახალი მატჩი დაიწყო! კოზირია: ' + newState.trumpSuit, 'join');
    return { success: true };
  }

  // ---- gameplay ------------------------------------------------------------

  private startTurnTimer(now = Date.now()) {
    const state = this.state;
    const player = state.players.find((p) => p.position === state.currentTurnPosition);
    state.turnStartedAt = now;
    state.turnWarningAt = now + WARNING_AFTER_MS;
    state.turnWarningSent = false;
    if (player && !player.isConnected) {
      const disconnectedAt = player.disconnectedAt || now;
      player.disconnectedAt = disconnectedAt;
      state.autoPlayDeadline = disconnectedAt + AUTO_PLAY_AFTER_DISCONNECT_MS;
      state.turnDeadline = state.autoPlayDeadline;
    } else {
      state.autoPlayDeadline = null;
      state.turnDeadline = now + DISCONNECT_AFTER_MS;
    }
  }

  private sortCardsForAuto(cards: Card[]): Card[] {
    return [...cards].sort((a, b) => {
      const points = RANK_POINTS[a.rank] - RANK_POINTS[b.rank];
      if (points !== 0) return points;
      return RANK_STRENGTH[a.rank] - RANK_STRENGTH[b.rank];
    });
  }

  private combinations(cards: Card[], count: number): Card[][] {
    if (count <= 0) return [];
    if (count === 1) return cards.map((card) => [card]);
    const out: Card[][] = [];
    const walk = (start: number, picked: Card[]) => {
      if (picked.length === count) {
        out.push(picked);
        return;
      }
      for (let i = start; i < cards.length; i++) {
        walk(i + 1, [...picked, cards[i]]);
      }
    };
    walk(0, []);
    return out;
  }

  private comboValue(cards: Card[]): number {
    return cards.reduce((sum, card) => sum + RANK_POINTS[card.rank] * 10 + RANK_STRENGTH[card.rank], 0);
  }

  private chooseAutoCards(uid: string): Card[] {
    const state = this.state;
    const hand = this.sortCardsForAuto(this.hands.get(uid) || []);
    if (hand.length === 0) return [];

    if (state.currentTrickCards.length === 0) {
      const bySuit = new Map<string, Card[]>();
      for (const card of hand) bySuit.set(card.suit, [...(bySuit.get(card.suit) || []), card]);
      const groups = [...bySuit.values()].sort((a, b) => b.length - a.length || this.comboValue(a.slice(0, 1)) - this.comboValue(b.slice(0, 1)));
      return groups[0]?.slice(0, 1) || [hand[0]];
    }

    const count = Math.min(state.requiredCardCount || 1, hand.length);
    const combos = this.combinations(hand, count).sort((a, b) => this.comboValue(a) - this.comboValue(b));
    const leaderTrick = state.currentTrickCards.find((t) => t.playerPosition === state.currentTempWinnerPosition);
    if (leaderTrick && state.trumpSuit) {
      const winning = combos.find((combo) => canBeatAllCards(combo, leaderTrick.cards, state.trumpSuit!));
      if (winning) return winning;
    }
    return combos[0] || hand.slice(0, count);
  }

  autoPlayCurrentTurn(reason: 'timeout' | 'disconnected' = 'timeout'): ActionResult {
    const state = this.state;
    if (state.phase !== 'TURN_IN_PROGRESS') return { success: false, error: 'ახლა სვლის ფაზა არ არის' };
    const player = state.players.find((p) => p.position === state.currentTurnPosition);
    if (!player) return { success: false, error: 'მოთამაშე ვერ მოიძებნა' };
    const cards = this.chooseAutoCards(player.id);
    if (cards.length === 0) return { success: false, error: 'ავტომატურად დასადები კარტი არ არის' };
    const res = this.playCards(player.id, cards.map((card) => card.id));
    if (res.success) {
      this.say(`${player.name}-ის მაგივრად ავტომატურად დაიდო ${cards.length} კარტი (${reason === 'disconnected' ? 'კავშირი გაწყვეტილია' : 'დრო ამოიწურა'})`, 'trick_win');
    }
    return res;
  }

  tickTimers(now = Date.now()): boolean {
    const state = this.state;
    if (state.phase !== 'TURN_IN_PROGRESS') return false;

    const player = state.players.find((p) => p.position === state.currentTurnPosition);
    if (!player) return false;

    if (!player.isConnected) {
      if (!state.autoPlayDeadline) {
        state.autoPlayDeadline = (player.disconnectedAt || now) + AUTO_PLAY_AFTER_DISCONNECT_MS;
        state.turnDeadline = state.autoPlayDeadline;
        return true;
      }
      if (now >= state.autoPlayDeadline) {
        this.autoPlayCurrentTurn('disconnected');
        return true;
      }
      return false;
    }

    if (!state.turnWarningSent && state.turnWarningAt && now >= state.turnWarningAt) {
      state.turnWarningSent = true;
      this.say(`${player.name}, 15 წამი დაგრჩათ სვლისთვის`, 'join');
      return true;
    }

    if (state.turnDeadline && now >= state.turnDeadline) {
      player.isConnected = false;
      player.disconnectedAt = now;
      state.autoPlayDeadline = now + AUTO_PLAY_AFTER_DISCONNECT_MS;
      state.turnDeadline = state.autoPlayDeadline;
      this.say(`${player.name} დროის ამოწურვის გამო დროებით გავიდა თამაშიდან. 20 წამში კარტი ავტომატურად დაიდება.`, 'leave');
      return true;
    }

    return false;
  }

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
      state.phase = 'TRICK_RESOLUTION';
      state.turnDeadline = null;
    } else {
      state.currentTurnPosition = getNextPosition(state.currentTurnPosition, state.settings.playerCount);
      this.startTurnTimer();
    }
    return { success: true };
  }

  resolvePendingTrick(): ActionResult {
    if (this.state.phase !== 'TRICK_RESOLUTION') {
      return { success: false, error: 'დასასრულებელი ხელი არ არის' };
    }
    this.resolveTrick();
    return { success: true };
  }

  private resolveTrick() {
    const state = this.state;
    const winnerPos = state.currentTempWinnerPosition || state.currentTrickLeadPosition || 'south';
    const winner = state.players.find((p) => p.position === winnerPos);
    const winningTeam = winner ? winner.team : getTeamForPosition(winnerPos, state.settings.playerCount);

    const points = calculateCardPoints(state.currentTrickCards.flatMap((t) => t.cards));
    const takenCards = state.currentTrickCards.reduce((sum, trick) => sum + trick.cards.length, 0);
    if (winningTeam === 1) state.team1TrickPoints += points;
    else state.team2TrickPoints += points;
    if (winningTeam === 1) state.team1TakenCardCount += takenCards;
    else state.team2TakenCardCount += takenCards;

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
      state.phase = 'TURN_IN_PROGRESS';
      this.startTurnTimer();
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
      this.startTurnTimer();
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
