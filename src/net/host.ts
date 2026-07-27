/**
 * HostEngine — runs in the host player's browser. Owns the authoritative
 * BuraRoom, consumes the `actions` queue, applies each action through the
 * game logic, and writes the resulting state / hands / deck / chat to Firestore.
 */
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  addDoc,
  Firestore,
  Unsubscribe,
} from 'firebase/firestore';
import { BuraRoom } from '../game/room';
import { RaiseLevel } from '../types/game';

// Firestore rejects `undefined`; JSON round-trip strips it from plain data.
const clean = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const TRICK_REVEAL_DELAY_MS = 2400;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface ActionDoc {
  uid: string;
  type: string;
  payload?: any;
  ts?: any;
}

export class HostEngine {
  private room: BuraRoom;
  private code: string;
  private db: Firestore;
  private actionsUnsub: Unsubscribe | null = null;
  private chain: Promise<void> = Promise.resolve();
  private timerId: ReturnType<typeof setInterval> | null = null;

  constructor(code: string, room: BuraRoom, db: Firestore) {
    this.code = code;
    this.room = room;
    this.db = db;
  }

  private roomRef() { return doc(this.db, 'rooms', this.code); }
  private deckRef() { return doc(this.db, 'rooms', this.code, 'private', 'deck'); }
  private handRef(uid: string) { return doc(this.db, 'rooms', this.code, 'hands', uid); }
  private actionsCol() { return collection(this.db, 'rooms', this.code, 'actions'); }
  private chatCol() { return collection(this.db, 'rooms', this.code, 'chat'); }
  private mmRef() { return doc(this.db, 'matchmaking', this.code); }

  /** Create the room in Firestore and start consuming actions. */
  async startAsCreator(): Promise<void> {
    await this.persistAll();
    if (!this.room.state.isPrivate) await this.updateMatchmaking();
    this.listen();
  }

  /** Reattach as host after a reload: state is already in `this.room`. */
  attach(): void {
    this.listen();
  }

  stop() {
    if (this.actionsUnsub) this.actionsUnsub();
    this.actionsUnsub = null;
    if (this.timerId) clearInterval(this.timerId);
    this.timerId = null;
  }

  private listen() {
    if (!this.timerId) {
      this.timerId = setInterval(() => {
        this.chain = this.chain.then(() => this.handleTimers()).catch((e) => console.error('timer error', e));
      }, 1000);
    }

    const q = query(this.actionsCol(), orderBy('ts', 'asc'));
    this.actionsUnsub = onSnapshot(q, (snap) => {
      snap.docChanges().forEach((change) => {
        if (change.type !== 'added') return;
        const id = change.doc.id;
        const data = change.doc.data() as ActionDoc;
        // Serialise processing so state mutations never interleave.
        this.chain = this.chain.then(() => this.handle(id, data)).catch((e) => console.error('action error', e));
      });
    });
  }

  private async handleTimers() {
    const changed = this.room.tickTimers();
    if (!changed) return;

    await this.persistAll();
    if (this.room.state.phase === 'TRICK_RESOLUTION') {
      await wait(TRICK_REVEAL_DELAY_MS);
      this.room.resolvePendingTrick();
      await this.persistAll();
    }
  }

  private async handle(actionId: string, action: ActionDoc) {
    const { uid, type, payload } = action;

    // Heartbeats only refresh in-memory presence (used by tickTimers on the
    // host). No full persist on every heartbeat — persist only if it caused a
    // reconnect (so other clients see the player come back online).
    if (type === 'HEARTBEAT') {
      const before = this.room.state.players.find((p) => p.id === uid)?.isConnected;
      this.room.heartbeat(uid);
      const after = this.room.state.players.find((p) => p.id === uid)?.isConnected;
      if (before === false && after) await this.persistAll();
      await deleteDoc(doc(this.db, 'rooms', this.code, 'actions', actionId));
      return;
    }

    switch (type) {
      case 'JOIN':
        this.room.addPlayer(uid, payload?.name || 'მოთამაშე');
        if (payload?.autoReady) this.room.setReady(uid, true);
        break;
      case 'LEAVE':
        this.room.removePlayer(uid);
        break;
      case 'SET_READY':
        this.room.setReady(uid, !!payload?.ready);
        break;
      case 'MOVE_TO_TEAM':
        this.room.moveToTeam(uid, payload?.targetUid || uid, payload?.team === 2 ? 2 : 1);
        break;
      case 'START_GAME':
        this.room.startGame(uid);
        break;
      case 'NEXT_ROUND':
        this.room.startNextRound(uid);
        break;
      case 'NEW_MATCH':
        this.room.newMatch(uid);
        break;
      case 'PLAY_CARDS':
        this.room.playCards(uid, payload?.cardIds || []);
        break;
      case 'PROPOSE_RAISE':
        this.room.proposeRaise(uid, payload?.level as RaiseLevel);
        break;
      case 'RESPOND_RAISE':
        this.room.respondRaise(uid, !!payload?.accept);
        break;
      case 'DECLARE_BURA':
        this.room.declareBura(uid);
        break;
      case 'DECLARE_MOLODKA':
        this.room.declareMolodka(uid);
        break;
    }

    // Auto-start public (matchmade) rooms once they are full and everyone is ready.
    const st = this.room.state;
    if (
      st.phase === 'LOBBY' &&
      !st.isPrivate &&
      st.players.length === st.settings.playerCount &&
      st.players.every((p) => p.isReady || p.isHost)
    ) {
      const host = st.players.find((p) => p.isHost);
      if (host) this.room.startGame(host.id);
    }

    await this.persistAll();

    if (this.room.state.phase === 'TRICK_RESOLUTION') {
      await wait(TRICK_REVEAL_DELAY_MS);
      this.room.resolvePendingTrick();
      await this.persistAll();
    }

    await deleteDoc(doc(this.db, 'rooms', this.code, 'actions', actionId));
    if (!this.room.state.isPrivate) await this.updateMatchmaking();
  }

  private async persistAll() {
    const st = this.room.state;
    const memberUids = st.players.map((p) => p.id);

    await setDoc(this.roomRef(), clean({
      ...st,
      hostUid: st.players.find((p) => p.isHost)?.id || memberUids[0],
      memberUids,
      updatedAt: Date.now(),
    }));

    // Hands (small: 2-4 docs).
    for (const [uid, cards] of this.room.hands) {
      await setDoc(this.handRef(uid), { cards: clean(cards) });
    }
    // Deck (host-only).
    await setDoc(this.deckRef(), { cards: clean(this.room.deck) });

    // Flush any new system chat messages.
    const msgs = this.room.flushChat();
    for (const m of msgs) {
      await addDoc(this.chatCol(), clean(m));
    }
  }

  private async updateMatchmaking() {
    const st = this.room.state;
    // Advertise only rooms that another searcher can actually join: still in the
    // lobby, not full, and with at least one live player.
    const open = st.phase === 'LOBBY' && st.players.length > 0 && st.players.length < st.settings.playerCount;
    if (open) {
      // Keep the original createdAt stable so matchmaking can order by "oldest
      // open room" and reconcile simultaneous searches deterministically.
      const existing = await getDoc(this.mmRef());
      const createdAt = existing.exists() ? existing.data().createdAt || Date.now() : Date.now();
      await setDoc(this.mmRef(), clean({
        code: this.code,
        mode: st.settings.playerCount,
        count: st.players.length,
        createdAt,
        updatedAt: Date.now(),
      }));
    } else {
      await deleteDoc(this.mmRef()).catch(() => {});
    }
  }

  /** Tear down the whole room (host leaving an unstarted/dead room). Removes the
   *  matchmaking advert and the public room doc so no one joins a hostless room. */
  async destroy(): Promise<void> {
    this.stop();
    await deleteDoc(this.mmRef()).catch(() => {});
    await deleteDoc(this.roomRef()).catch(() => {});
  }

  /** Public, still in the lobby — safe to garbage-collect when the host leaves. */
  isPublicLobby(): boolean {
    const st = this.room.state;
    return !st.isPrivate && st.phase === 'LOBBY';
  }

  /** Rehydrate a HostEngine from Firestore (host tab reloaded mid-game). */
  static async rehydrate(code: string, db: Firestore): Promise<HostEngine | null> {
    const roomSnap = await getDoc(doc(db, 'rooms', code));
    if (!roomSnap.exists()) return null;
    const state: any = roomSnap.data();
    const deckSnap = await getDoc(doc(db, 'rooms', code, 'private', 'deck'));
    const deck = deckSnap.exists() ? (deckSnap.data().cards || []) : [];
    const handsSnap = await getDocs(collection(db, 'rooms', code, 'hands'));
    const hands: Record<string, any> = {};
    handsSnap.forEach((d) => { hands[d.id] = d.data().cards || []; });
    const room = BuraRoom.rehydrate(state, hands, deck);
    return new HostEngine(code, room, db);
  }
}
