/**
 * GameClient — the per-browser networking facade used by the React app.
 * Replaces the old WebSocket layer. Handles anonymous auth, room creation /
 * joining / matchmaking, live subscriptions, and action submission. When this
 * browser is the room creator it also spins up a HostEngine authority.
 *
 * The Firestore/Auth context is injected so the same code runs against the
 * real project (App) or a local emulator (tests) with isolated instances.
 */
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
  Firestore,
  Unsubscribe,
} from 'firebase/firestore';
import { Auth, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { HostEngine } from './host';
import { BuraRoom } from '../game/room';
import { isRoomJoinable, pickSeniorAdvert, sortOpenCandidates } from './matchmaking';
import { Card, ChatMessage, GameState, PlayerCount, RaiseLevel, RoomSettings } from '../types/game';

export interface FbCtx {
  db: Firestore;
  auth: Auth;
}

export interface RoomCallbacks {
  onState: (state: GameState, myPlayerId: string) => void;
  onHand: (cards: Card[]) => void;
  onChat: (messages: ChatMessage[]) => void;
  onError: (message: string) => void;
}

export class GameClient {
  uid = '';
  private ctx: FbCtx;
  private cb: RoomCallbacks;
  private host: HostEngine | null = null;
  private unsubs: Unsubscribe[] = [];
  private mmReconcileUnsub: Unsubscribe | null = null;
  private reconciling = false;
  code: string | null = null;

  constructor(cb: RoomCallbacks, ctx: FbCtx) {
    this.cb = cb;
    this.ctx = ctx;
  }

  async init(): Promise<string> {
    const { auth } = this.ctx;
    if (auth.currentUser) { this.uid = auth.currentUser.uid; return this.uid; }
    const user = await new Promise<any>((resolve, reject) => {
      const unsub = onAuthStateChanged(auth, (u) => { if (u) { unsub(); resolve(u); } });
      signInAnonymously(auth).catch((e) => { unsub(); reject(e); });
    });
    this.uid = user.uid;
    return this.uid;
  }

  private get db() { return this.ctx.db; }

  private async uniqueCode(): Promise<string> {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const makeCode = () => Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');

    for (let i = 0; i < 10; i++) {
      const code = makeCode();
      const snap = await getDoc(doc(this.db, 'rooms', code));
      if (!snap.exists()) return code;
    }
    return Date.now().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(-6).padStart(6, '0');
  }

  async createRoom(name: string, settings: Partial<RoomSettings>, isPrivate = true): Promise<string> {
    await this.init();
    const code = await this.uniqueCode();
    const room = BuraRoom.createNew(this.uid, name, code, isPrivate, settings);
    this.host = new HostEngine(code, room, this.db);
    await this.host.startAsCreator();
    this.subscribe(code);
    localStorage.setItem('bura_room_code', code);
    return code;
  }

  async joinRoom(code: string, name: string, autoReady = false): Promise<void> {
    await this.init();
    const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    const snap = await getDoc(doc(this.db, 'rooms', clean));
    if (!snap.exists()) {
      this.cb.onError('ოთახი კოდით ' + clean + ' ვერ მოიძებნა');
      return;
    }
    const st = snap.data() as any;
    const already = (st.players || []).some((p: any) => p.id === this.uid);
    if (!already) {
      if ((st.players || []).length >= st.settings.playerCount) {
        this.cb.onError(`ოთახი უკვე სავსეა (${st.settings.playerCount} მოთამაშე)`);
        return;
      }
      if ((st.players || []).some((p: any) => p.name.toLowerCase() === name.toLowerCase())) {
        this.cb.onError('ამ სახელით მოთამაშე უკვე ოთახშია');
        return;
      }
    }
    await this.sendActionTo(clean, 'JOIN', { name, autoReady });
    await this.attachRoom(clean);
  }

  async resumeRoom(code: string, name: string): Promise<boolean> {
    await this.init();
    const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    const snap = await getDoc(doc(this.db, 'rooms', clean));
    if (!snap.exists()) return false;

    const st = snap.data() as any;
    if (!(st.players || []).some((p: any) => p.id === this.uid)) return false;

    await this.attachRoom(clean);
    await this.sendActionTo(clean, 'JOIN', { name, autoReady: false });
    return true;
  }

  private async attachRoom(code: string) {
    const snap = await getDoc(doc(this.db, 'rooms', code));
    const st = snap.exists() ? (snap.data() as any) : null;
    if (st?.hostUid === this.uid && !this.host) {
      const host = await HostEngine.rehydrate(code, this.db);
      if (host) {
        this.host = host;
        this.host.attach();
      }
    }
    this.subscribe(code);
    localStorage.setItem('bura_room_code', code);
  }

  async startMatchmaking(name: string, mode: PlayerCount): Promise<void> {
    await this.init();
    // Try to join the oldest genuinely-open public room first.
    const joined = await this.tryJoinOpenRoom(name, mode);
    if (joined) return;
    // Otherwise open our own public room and start reconciling, so if another
    // searcher created one at the same moment the two rooms merge into one.
    const code = await this.createRoom(name, { playerCount: mode }, false);
    this.startMatchmakingReconcile(name, mode, code);
  }

  /** Read the matchmaking board, skipping/cleaning dead entries, and join the
   *  oldest room that is really joinable. Returns true if we joined one. */
  private async tryJoinOpenRoom(name: string, mode: PlayerCount): Promise<boolean> {
    const snap = await getDocs(query(collection(this.db, 'matchmaking'), where('mode', '==', mode)));
    const candidates = sortOpenCandidates(
      snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })),
      mode
    );

    for (const c of candidates) {
      if (c.id === this.code) continue;
      const roomSnap = await getDoc(doc(this.db, 'rooms', c.id));
      if (!roomSnap.exists()) {
        // Advert points at a room that no longer exists — clean it up.
        await deleteDoc(doc(this.db, 'matchmaking', c.id)).catch(() => {});
        continue;
      }
      if (!isRoomJoinable(roomSnap.data() as any, this.uid)) continue;
      await this.joinRoom(c.id, name, true);
      return true;
    }
    return false;
  }

  /** While waiting alone in our freshly-created public room, watch the board and
   *  merge into an older open room if one shows up (simultaneous-search race). */
  private startMatchmakingReconcile(name: string, mode: PlayerCount, myCode: string) {
    this.stopReconcile();

    this.mmReconcileUnsub = onSnapshot(
      query(collection(this.db, 'matchmaking'), where('mode', '==', mode)),
      async () => {
        if (this.reconciling) return;
        if (!this.host || this.code !== myCode) { this.stopReconcile(); return; }

        const mySnap = await getDoc(doc(this.db, 'rooms', myCode));
        if (!mySnap.exists()) { this.stopReconcile(); return; }
        const myst = mySnap.data() as any;
        // Only merge while we are still a lone host in the lobby.
        if (myst.phase !== 'LOBBY' || (myst.players || []).length !== 1) { this.stopReconcile(); return; }

        const myMm = await getDoc(doc(this.db, 'matchmaking', myCode));
        const myCreatedAt = myMm.exists() ? myMm.data().createdAt || 0 : 0;

        const boardSnap = await getDocs(query(collection(this.db, 'matchmaking'), where('mode', '==', mode)));
        const older = pickSeniorAdvert(
          boardSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })),
          mode,
          myCode,
          myCreatedAt
        );
        if (!older) return;

        const oSnap = await getDoc(doc(this.db, 'rooms', older.id));
        if (!isRoomJoinable(oSnap.exists() ? (oSnap.data() as any) : null, this.uid)) return;

        // Abandon our room and join the senior one.
        this.reconciling = true;
        this.stopReconcile();
        await this.destroyMyRoom();
        await this.joinRoom(older.id, name, true);
        if (!this.code) {
          // The senior room filled up before we got in — reopen our own room
          // and keep reconciling so we still end up matched.
          const code = await this.createRoom(name, { playerCount: mode }, false);
          this.reconciling = false;
          this.startMatchmakingReconcile(name, mode, code);
          return;
        }
        this.reconciling = false;
      }
    );
  }

  private stopReconcile() {
    if (this.mmReconcileUnsub) { this.mmReconcileUnsub(); this.mmReconcileUnsub = null; }
  }

  /** Tear down the room this client hosts (used when merging or leaving a
   *  still-empty public lobby) so no hostless room lingers in matchmaking. */
  private async destroyMyRoom() {
    const code = this.code;
    this.unsubClearRoom();
    if (this.host) { await this.host.destroy(); this.host = null; }
    else if (code) { await deleteDoc(doc(this.db, 'rooms', code)).catch(() => {}); }
    if (code) {
      await deleteDoc(doc(this.db, 'matchmaking', code)).catch(() => {});
      localStorage.removeItem('bura_room_code');
    }
    this.code = null;
  }

  private subscribe(code: string) {
    this.unsubClearRoom();
    this.code = code;

    this.unsubs.push(
      onSnapshot(doc(this.db, 'rooms', code), (snap) => {
        if (!snap.exists()) return;
        this.cb.onState(snap.data() as GameState, this.uid);
      })
    );

    this.unsubs.push(
      onSnapshot(doc(this.db, 'rooms', code, 'hands', this.uid), (snap) => {
        this.cb.onHand(snap.exists() ? ((snap.data().cards as Card[]) || []) : []);
      })
    );

    this.unsubs.push(
      onSnapshot(query(collection(this.db, 'rooms', code, 'chat'), orderBy('timestamp', 'asc')), (snap) => {
        const msgs: ChatMessage[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        this.cb.onChat(msgs);
      })
    );
  }

  private unsubClearRoom() {
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
  }

  disconnectLocal() {
    this.stopReconcile();
    this.unsubClearRoom();
    if (this.host) { this.host.stop(); this.host = null; }
    this.code = null;
  }

  private async sendActionTo(code: string, type: string, payload?: any) {
    await addDoc(collection(this.db, 'rooms', code, 'actions'), {
      uid: this.uid,
      type,
      payload: payload ?? null,
      ts: serverTimestamp(),
    });
  }

  private async sendAction(type: string, payload?: any) {
    if (!this.code) return;
    await this.sendActionTo(this.code, type, payload);
  }

  toggleReady(ready: boolean) { return this.sendAction('SET_READY', { ready }); }
  moveToTeam(targetUid: string, team: 1 | 2) { return this.sendAction('MOVE_TO_TEAM', { targetUid, team }); }
  startGame() { return this.sendAction('START_GAME'); }
  nextRound() { return this.sendAction('NEXT_ROUND'); }
  newMatch() { return this.sendAction('NEW_MATCH'); }
  playCards(cardIds: string[]) { return this.sendAction('PLAY_CARDS', { cardIds }); }
  proposeRaise(level: RaiseLevel) { return this.sendAction('PROPOSE_RAISE', { level }); }
  respondRaise(accept: boolean) { return this.sendAction('RESPOND_RAISE', { accept }); }
  declareBura() { return this.sendAction('DECLARE_BURA'); }
  declareMolodka() { return this.sendAction('DECLARE_MOLODKA'); }
  heartbeat() { if (this.code) void this.sendAction('HEARTBEAT').catch(() => {}); }

  async sendChat(name: string, text: string) {
    if (!this.code) return;
    const { validateChatMessage } = await import('../game/chat');
    const res = validateChatMessage(this.uid, name, text);
    if (!res.valid || !res.message) {
      if (res.error) this.cb.onError(res.error);
      return;
    }
    await addDoc(collection(this.db, 'rooms', this.code, 'chat'), res.message);
  }

  async leave() {
    this.stopReconcile();
    // If we host a still-unstarted public room, delete it outright so it stops
    // being advertised to matchmaking as a joinable (but hostless) room.
    if (this.host && this.host.isPublicLobby()) {
      await this.host.destroy().catch(() => {});
      this.host = null;
      if (this.code) await deleteDoc(doc(this.db, 'matchmaking', this.code)).catch(() => {});
    } else if (this.code) {
      await this.sendAction('LEAVE').catch(() => {});
    }
    localStorage.removeItem('bura_room_code');
    this.disconnectLocal();
  }
}
