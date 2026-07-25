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
    const q = query(collection(this.db, 'matchmaking'), where('mode', '==', mode));
    const snap = await getDocs(q);
    const open = snap.docs.find((d) => (d.data().count || 0) < mode);
    if (open) {
      await this.joinRoom(open.id, name, true);
    } else {
      await this.createRoom(name, { playerCount: mode }, false);
    }
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
    if (this.code) await this.sendAction('LEAVE').catch(() => {});
    localStorage.removeItem('bura_room_code');
    this.disconnectLocal();
  }
}
