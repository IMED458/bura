import crypto from 'node:crypto';
import {
  Card,
  ChatMessage,
  ClientMessage,
  GameState,
  Player,
  PlayerPosition,
  RaiseLevel,
  RoomSettings,
  ServerMessage,
} from '../src/types/game';
import {
  calculateCardPoints,
  canBeatAllCards,
  createDeck,
  getNextPosition,
  getTeamForPosition,
  initializeRound,
  isBuraHand,
  isSameSuitPlay,
  shuffleDeck,
  POSITION_ORDER,
} from '../src/game/engine';
import { createSystemMessage, validateChatMessage } from './chatService';

export interface RoomInstance {
  state: GameState;
  hands: Map<string, Card[]>; // playerId -> hand
  deck: Card[];
  chat: ChatMessage[];
  lastActivity: number;
}

export interface MatchmakingEntry {
  socketId: string;
  sessionToken: string;
  name: string;
  timestamp: number;
}

export class RoomManager {
  private rooms = new Map<string, RoomInstance>(); // roomCode -> RoomInstance
  private socketToRoom = new Map<string, string>(); // socketId -> roomCode
  private socketToSession = new Map<string, string>(); // socketId -> sessionToken
  private matchmakingQueue: MatchmakingEntry[] = [];

  constructor() {
    // Run periodic cleanup every 60 seconds
    setInterval(() => this.cleanupExpiredRooms(), 60000);
  }

  public generateRoomCode(): string {
    const code = 'BURA-' + Math.floor(1000 + Math.random() * 9000).toString();
    if (this.rooms.has(code)) {
      return this.generateRoomCode();
    }
    return code;
  }

  public createRoom(
    hostSocketId: string,
    hostName: string,
    customSettings?: Partial<RoomSettings>
  ): { roomCode: string; sessionToken: string } {
    const roomCode = this.generateRoomCode();
    const sessionToken = crypto.randomUUID();

    const defaultSettings: RoomSettings = {
      turnTimeSeconds: 30,
      targetMatchScore: 11,
      drawRule6060: 'redeal',
      buraAutoWin: true,
      daviWhoCanRaise: 'turn_player',
      ...customSettings,
    };

    const hostPlayer: Player = {
      id: hostSocketId,
      sessionToken,
      name: hostName,
      position: 'south',
      team: 1,
      isHost: true,
      isReady: true,
      isConnected: true,
      cardsInHandCount: 0,
    };

    const initialState: GameState = {
      roomId: roomCode,
      roomCode,
      isPrivate: true,
      phase: 'LOBBY',
      settings: defaultSettings,
      players: [hostPlayer],
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

    const instance: RoomInstance = {
      state: initialState,
      hands: new Map(),
      deck: createDeck(),
      chat: [createSystemMessage(`ოთახი ${roomCode} შეიქმნა. გაუზიარეთ კოდი მეგობრებს.`, 'join')],
      lastActivity: Date.now(),
    };

    this.rooms.set(roomCode, instance);
    this.socketToRoom.set(hostSocketId, roomCode);
    this.socketToSession.set(hostSocketId, sessionToken);

    return { roomCode, sessionToken };
  }

  public joinRoom(
    socketId: string,
    roomCode: string,
    name: string,
    sessionToken?: string
  ): { success: boolean; sessionToken: string; error?: string } {
    const cleanCode = roomCode.toUpperCase().trim();
    const instance = this.rooms.get(cleanCode);

    if (!instance) {
      return { success: false, sessionToken: '', error: 'ოთახი კოდით ' + cleanCode + ' ვერ მოიძებნა' };
    }

    const state = instance.state;

    // Check for reconnecting player
    if (sessionToken) {
      const existingPlayer = state.players.find((p) => p.sessionToken === sessionToken);
      if (existingPlayer) {
        existingPlayer.id = socketId;
        existingPlayer.isConnected = true;
        existingPlayer.disconnectedAt = undefined;
        this.socketToRoom.set(socketId, cleanCode);
        this.socketToSession.set(socketId, sessionToken);
        instance.chat.push(createSystemMessage(`${existingPlayer.name} დაუბრუნდა თამაშს`, 'join'));
        return { success: true, sessionToken };
      }
    }

    if (state.players.length >= 4) {
      return { success: false, sessionToken: '', error: 'ოთახი უკვე სავსეა (4 მოთამაშე)' };
    }

    // Name collision check
    if (state.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      return { success: false, sessionToken: '', error: 'ამ სახელით მოთამაშე უკვე ოთახშია' };
    }

    // Find first available seat
    const occupiedPositions = new Set(state.players.map((p) => p.position));
    const availablePos = POSITION_ORDER.find((pos) => !occupiedPositions.has(pos)) || 'west';

    const newToken = crypto.randomUUID();
    const newPlayer: Player = {
      id: socketId,
      sessionToken: newToken,
      name,
      position: availablePos,
      team: getTeamForPosition(availablePos),
      isHost: false,
      isReady: false,
      isConnected: true,
      cardsInHandCount: 0,
    };

    state.players.push(newPlayer);
    this.socketToRoom.set(socketId, cleanCode);
    this.socketToSession.set(socketId, newToken);

    instance.chat.push(createSystemMessage(`${name} შემოვიდა ოთახში`, 'join'));
    instance.lastActivity = Date.now();

    return { success: true, sessionToken: newToken };
  }

  public handleMatchmaking(
    socketId: string,
    name: string,
    sessionToken?: string
  ): { inQueue: boolean; playersFound: number } {
    // Remove if already in queue
    this.matchmakingQueue = this.matchmakingQueue.filter((m) => m.socketId !== socketId);

    const newToken = sessionToken || crypto.randomUUID();
    this.matchmakingQueue.push({
      socketId,
      sessionToken: newToken,
      name,
      timestamp: Date.now(),
    });

    if (this.matchmakingQueue.length >= 4) {
      // Create auto match room
      const matched = this.matchmakingQueue.splice(0, 4);
      const roomCode = this.generateRoomCode();

      const defaultSettings: RoomSettings = {
        turnTimeSeconds: 30,
        targetMatchScore: 11,
        drawRule6060: 'redeal',
        buraAutoWin: true,
        daviWhoCanRaise: 'turn_player',
      };

      const players: Player[] = matched.map((m, idx) => {
        const pos = POSITION_ORDER[idx];
        return {
          id: m.socketId,
          sessionToken: m.sessionToken,
          name: m.name,
          position: pos,
          team: getTeamForPosition(pos),
          isHost: idx === 0,
          isReady: true,
          isConnected: true,
          cardsInHandCount: 0,
        };
      });

      const initialState: GameState = {
        roomId: roomCode,
        roomCode,
        isPrivate: false,
        phase: 'LOBBY',
        settings: defaultSettings,
        players,
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

      const instance: RoomInstance = {
        state: initialState,
        hands: new Map(),
        deck: createDeck(),
        chat: [createSystemMessage('მატჩმეიკინგით 4 მოთამაშე შეგროვდა. თამაში მზადაა!', 'join')],
        lastActivity: Date.now(),
      };

      this.rooms.set(roomCode, instance);
      for (const m of matched) {
        this.socketToRoom.set(m.socketId, roomCode);
        this.socketToSession.set(m.socketId, m.sessionToken);
      }

      return { inQueue: false, playersFound: 4 };
    }

    return { inQueue: true, playersFound: this.matchmakingQueue.length };
  }

  public leaveMatchmaking(socketId: string) {
    this.matchmakingQueue = this.matchmakingQueue.filter((m) => m.socketId !== socketId);
  }

  public handleDisconnect(socketId: string): string | null {
    const roomCode = this.socketToRoom.get(socketId);
    if (!roomCode) return null;

    const instance = this.rooms.get(roomCode);
    if (!instance) return null;

    const player = instance.state.players.find((p) => p.id === socketId);
    if (player) {
      player.isConnected = false;
      player.disconnectedAt = Date.now();

      instance.chat.push(createSystemMessage(`${player.name} დროებით გაითიშა`, 'leave'));

      // If in lobby, host migration or removal
      if (instance.state.phase === 'LOBBY' || instance.state.phase === 'WAITING_FOR_PLAYERS') {
        instance.state.players = instance.state.players.filter((p) => p.id !== socketId);
        if (player.isHost && instance.state.players.length > 0) {
          instance.state.players[0].isHost = true;
          instance.chat.push(
            createSystemMessage(`ახალი ჰოსტია ${instance.state.players[0].name}`, 'join')
          );
        }
      }
    }

    this.socketToRoom.delete(socketId);
    return roomCode;
  }

  public toggleReady(socketId: string): boolean {
    const instance = this.getRoomBySocket(socketId);
    if (!instance) return false;

    const player = instance.state.players.find((p) => p.id === socketId);
    if (player) {
      player.isReady = !player.isReady;
      return true;
    }
    return false;
  }

  public startGame(socketId: string): { success: boolean; error?: string } {
    const instance = this.getRoomBySocket(socketId);
    if (!instance) return { success: false, error: 'ოთახი ვერ მოიძებნა' };

    const player = instance.state.players.find((p) => p.id === socketId);
    if (!player || !player.isHost) {
      return { success: false, error: 'მხოლოდ ჰოსტს შეუძლია თამაშის დაწყება' };
    }

    if (instance.state.players.length !== 4) {
      return { success: false, error: 'თამაშის დასაწყებად საჭიროა ზუსტად 4 მოთამაშე' };
    }

    const allReady = instance.state.players.every((p) => p.isReady || p.isHost);
    if (!allReady) {
      return { success: false, error: 'ყველა მოთამაშე უნდა იყოს მზად' };
    }

    // Deal round
    const { state, cardsByPlayer } = initializeRound(
      instance.state,
      instance.hands,
      createDeck()
    );

    instance.state = state;
    instance.hands = cardsByPlayer;
    instance.chat.push(createSystemMessage('თამაში დაიწყო! კოზირია: ' + state.trumpSuit, 'join'));

    return { success: true };
  }

  public playCards(
    socketId: string,
    cardIds: string[]
  ): { success: boolean; error?: string } {
    const instance = this.getRoomBySocket(socketId);
    if (!instance) return { success: false, error: 'ოთახი ვერ მოიძებნა' };

    const state = instance.state;
    if (state.phase !== 'TURN_IN_PROGRESS') {
      return { success: false, error: 'ახლა სვლის ფაზა არ არის' };
    }

    const player = state.players.find((p) => p.id === socketId);
    if (!player || player.position !== state.currentTurnPosition) {
      return { success: false, error: 'თქვენი სვლა არ არის' };
    }

    const playerHand = instance.hands.get(socketId) || [];
    const selectedCards = playerHand.filter((c) => cardIds.includes(c.id));

    if (selectedCards.length !== cardIds.length || cardIds.length === 0) {
      return { success: false, error: 'არასწორი კარტებია არჩეული' };
    }

    // If first player in trick
    if (state.currentTrickCards.length === 0) {
      if (!isSameSuitPlay(selectedCards)) {
        return { success: false, error: 'პირველმა სვლამ უნდა ჩამოვიდეს ერთი და იმავე მასტის კარტები' };
      }
      state.requiredCardCount = selectedCards.length;
      state.currentTrickLeadPosition = player.position;
      state.currentTempWinnerPosition = player.position;
    } else {
      // Must play exact required card count
      if (selectedCards.length !== state.requiredCardCount) {
        return {
          success: false,
          error: `უნდა დადოთ ზუსტად ${state.requiredCardCount} კარტი`,
        };
      }

      // Check if player beats current temp winner cards
      const leaderTrick = state.currentTrickCards.find(
        (t) => t.playerPosition === state.currentTempWinnerPosition
      );

      if (leaderTrick && state.trumpSuit) {
        const beats = canBeatAllCards(selectedCards, leaderTrick.cards, state.trumpSuit);
        if (beats) {
          state.currentTempWinnerPosition = player.position;
        }
      }
    }

    // Remove played cards from player's hand
    const remainingHand = playerHand.filter((c) => !cardIds.includes(c.id));
    instance.hands.set(socketId, remainingHand);
    player.cardsInHandCount = remainingHand.length;

    // Record played trick
    state.currentTrickCards.push({
      playerId: socketId,
      playerPosition: player.position,
      cards: selectedCards,
      timestamp: Date.now(),
    });

    // Advance turn or resolve trick
    if (state.currentTrickCards.length === 4) {
      // Resolve trick
      this.resolveTrick(instance);
    } else {
      state.currentTurnPosition = getNextPosition(state.currentTurnPosition);
      state.turnDeadline = Date.now() + (state.settings.turnTimeSeconds || 30) * 1000;
    }

    instance.lastActivity = Date.now();
    return { success: true };
  }

  private resolveTrick(instance: RoomInstance) {
    const state = instance.state;
    const winnerPos = state.currentTempWinnerPosition || state.currentTrickLeadPosition || 'south';
    const winningTeam = getTeamForPosition(winnerPos);

    // Sum all points in trick
    const allTrickCards = state.currentTrickCards.flatMap((t) => t.cards);
    const points = calculateCardPoints(allTrickCards);

    if (winningTeam === 1) {
      state.team1TrickPoints += points;
    } else {
      state.team2TrickPoints += points;
    }

    const winnerPlayer = state.players.find((p) => p.position === winnerPos);
    instance.chat.push(
      createSystemMessage(
        `${winnerPlayer?.name || winnerPos} მოიგო ხელი (+${points} ქულა)`,
        'trick_win'
      )
    );

    // Reset trick state
    state.currentTrickCards = [];
    state.requiredCardCount = 0;
    state.currentTrickLeadPosition = null;
    state.currentTempWinnerPosition = null;
    state.currentTurnPosition = winnerPos;

    // Draw cards back up to 5 clockwise starting from trick winner
    this.drawCardsForPlayers(instance, winnerPos);

    // Check if round is finished (all hands empty and deck empty)
    const totalHandCards = state.players.reduce((sum, p) => sum + p.cardsInHandCount, 0);
    if (totalHandCards === 0 && instance.deck.length === 0) {
      this.resolveRound(instance);
    } else {
      state.turnDeadline = Date.now() + (state.settings.turnTimeSeconds || 30) * 1000;
    }
  }

  private drawCardsForPlayers(instance: RoomInstance, startPos: PlayerPosition) {
    const state = instance.state;
    let pos = startPos;

    // Distribute 1 card at a time clockwise until everyone has 5 or deck is empty
    let cardsDrawnInPass = true;
    while (cardsDrawnInPass && instance.deck.length > 0) {
      cardsDrawnInPass = false;
      for (let i = 0; i < 4; i++) {
        const p = state.players.find((pl) => pl.position === pos);
        if (p && p.cardsInHandCount < 5 && instance.deck.length > 0) {
          const card = instance.deck.pop();
          if (card) {
            const hand = instance.hands.get(p.id) || [];
            hand.push(card);
            instance.hands.set(p.id, hand);
            p.cardsInHandCount = hand.length;
            cardsDrawnInPass = true;
          }
        }
        pos = getNextPosition(pos);
      }
    }
    state.deckRemainingCount = instance.deck.length;
  }

  private resolveRound(instance: RoomInstance) {
    const state = instance.state;
    state.phase = 'ROUND_FINISHED';

    if (state.team1TrickPoints > state.team2TrickPoints) {
      state.team1MatchScore += state.currentRaiseLevel;
      state.winningTeam = 1;
      instance.chat.push(
        createSystemMessage(
          `რაუნდი მოიგო გუნდმა 1 (სამხრეთი/ჩრდილოეთი)! +${state.currentRaiseLevel} მატჩის ქულა`,
          'round_win'
        )
      );
    } else if (state.team2TrickPoints > state.team1TrickPoints) {
      state.team2MatchScore += state.currentRaiseLevel;
      state.winningTeam = 2;
      instance.chat.push(
        createSystemMessage(
          `რაუნდი მოიგო გუნდმა 2 (დასავლეთი/აღმოსავლეთი)! +${state.currentRaiseLevel} მატჩის ქულა`,
          'round_win'
        )
      );
    } else {
      // 60-60 Draw
      instance.chat.push(createSystemMessage('რაუნდი დასრულდა ფრედ (60 - 60)!', 'round_win'));
    }

    // Check match finish
    if (
      state.team1MatchScore >= state.settings.targetMatchScore ||
      state.team2MatchScore >= state.settings.targetMatchScore
    ) {
      state.phase = 'MATCH_FINISHED';
      instance.chat.push(
        createSystemMessage(
          `🏆 მატჩი დასრულდა! გამარჯვებულია გუნდი ${state.team1MatchScore >= state.settings.targetMatchScore ? 1 : 2}`,
          'round_win'
        )
      );
    }
  }

  public proposeRaise(
    socketId: string,
    requestedLevel: RaiseLevel
  ): { success: boolean; error?: string } {
    const instance = this.getRoomBySocket(socketId);
    if (!instance) return { success: false, error: 'ოთახი ვერ მოიძებნა' };

    const state = instance.state;
    if (state.phase !== 'TURN_IN_PROGRESS') {
      return { success: false, error: 'დავის გამოცხადება მხოლოდ თამაშისას შეიძლება' };
    }

    const player = state.players.find((p) => p.id === socketId);
    if (!player) return { success: false, error: 'მოთამაშე ვერ მოიძებნა' };

    if (requestedLevel <= state.currentRaiseLevel) {
      return { success: false, error: 'გაზრდა უნდა იყოს მიმდინარე დონეზე მაღალი' };
    }

    state.phase = 'RAISE_OFFER_PENDING';
    state.pendingRaise = {
      proposedByPlayerId: socketId,
      proposedByTeam: player.team,
      level: requestedLevel,
      timestamp: Date.now(),
    };

    const daviNames: Record<number, string> = {
      2: 'დავი (2 ქულა)',
      3: 'სე (3 ქულა)',
      4: 'ჩარი (4 ქულა)',
      5: 'ფანჯი (5 ქულა)',
      6: 'შაში (6 ქულა)',
    };

    instance.chat.push(
      createSystemMessage(
        `${player.name} გამოაცხადა ${daviNames[requestedLevel] || 'გაზრდა'}!`,
        'davi'
      )
    );

    return { success: true };
  }

  public respondRaise(
    socketId: string,
    accept: boolean
  ): { success: boolean; error?: string } {
    const instance = this.getRoomBySocket(socketId);
    if (!instance) return { success: false, error: 'ოთახი ვერ მოიძებნა' };

    const state = instance.state;
    if (state.phase !== 'RAISE_OFFER_PENDING' || !state.pendingRaise) {
      return { success: false, error: 'აქტიური შეთავაზება არ არის' };
    }

    const player = state.players.find((p) => p.id === socketId);
    if (!player || player.team === state.pendingRaise.proposedByTeam) {
      return { success: false, error: 'მხოლოდ მოწინააღმდეგე გუნდს შეუძლია პასუხი' };
    }

    if (accept) {
      state.currentRaiseLevel = state.pendingRaise.level;
      state.pendingRaise = null;
      state.phase = 'TURN_IN_PROGRESS';
      instance.chat.push(createSystemMessage('შეთავაზება მიღებულია! რაუნდის ფასია ' + state.currentRaiseLevel, 'davi'));
    } else {
      // Rejected: proposing team wins round at previous raise level value
      const winningTeam = state.pendingRaise.proposedByTeam;
      if (winningTeam === 1) {
        state.team1MatchScore += state.currentRaiseLevel;
      } else {
        state.team2MatchScore += state.currentRaiseLevel;
      }
      state.pendingRaise = null;
      state.phase = 'ROUND_FINISHED';
      state.winningTeam = winningTeam;
      instance.chat.push(
        createSystemMessage(`შეთავაზებაზე უარი ითქვა. რაუნდი მოიგო გუნდმა ${winningTeam}`, 'davi')
      );
    }

    return { success: true };
  }

  public declareBura(socketId: string): { success: boolean; error?: string } {
    const instance = this.getRoomBySocket(socketId);
    if (!instance) return { success: false, error: 'ოთახი ვერ მოიძებნა' };

    const state = instance.state;
    const player = state.players.find((p) => p.id === socketId);
    if (!player || !state.trumpSuit) return { success: false, error: 'შეცდომა' };

    const hand = instance.hands.get(socketId) || [];
    if (!isBuraHand(hand, state.trumpSuit)) {
      return { success: false, error: 'თქვენ არ გაქვთ 5 კოზირი ხელში!' };
    }

    // Award immediate round victory
    if (player.team === 1) {
      state.team1MatchScore += state.currentRaiseLevel;
    } else {
      state.team2MatchScore += state.currentRaiseLevel;
    }

    state.phase = 'ROUND_FINISHED';
    state.winningTeam = player.team;
    instance.chat.push(
      createSystemMessage(`🔥 ${player.name}-მ გამოაცხადა ბურა (5 კოზირი)! გუნდმა ${player.team} მოიგო რაუნდი!`, 'bura')
    );

    return { success: true };
  }

  public getRoomBySocket(socketId: string): RoomInstance | undefined {
    const code = this.socketToRoom.get(socketId);
    return code ? this.rooms.get(code) : undefined;
  }

  public getRoomByCode(code: string): RoomInstance | undefined {
    return this.rooms.get(code.toUpperCase().trim());
  }

  public getStats() {
    let activeRooms = 0;
    let activeMatches = 0;
    this.rooms.forEach((r) => {
      activeRooms++;
      if (r.state.phase === 'TURN_IN_PROGRESS') activeMatches++;
    });

    return {
      activeRooms,
      activeMatches,
      matchmakingQueueLength: this.matchmakingQueue.length,
      connectedSocketCount: this.socketToRoom.size,
      timestamp: Date.now(),
    };
  }

  private cleanupExpiredRooms() {
    const now = Date.now();
    const expireTime = 15 * 60 * 1000; // 15 mins idle

    this.rooms.forEach((inst, code) => {
      if (now - inst.lastActivity > expireTime) {
        this.rooms.delete(code);
      }
    });

    // Clear stale matchmaking
    this.matchmakingQueue = this.matchmakingQueue.filter((m) => now - m.timestamp < 120000);
  }
}
