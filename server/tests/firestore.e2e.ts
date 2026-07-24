/**
 * End-to-end test of the full host-authoritative flow with two independent
 * anonymous players, exercising the REAL security rules (firestore.rules).
 *
 * Against the real project (default — requires rules published + Anonymous auth):
 *   npx tsx server/tests/firestore.e2e.ts
 * Against local emulators (needs a JRE + firebase-tools):
 *   USE_EMULATOR=1 npx firebase-tools emulators:exec --project demo-bura \
 *     "USE_EMULATOR=1 tsx server/tests/firestore.e2e.ts"
 */
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, Auth } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, Firestore } from 'firebase/firestore';
import { GameClient, FbCtx } from '../../src/net/client';
import { Card, GameState } from '../../src/types/game';

const USE_EMULATOR = process.env.USE_EMULATOR === '1';
async function waitFor(pred: () => boolean, timeoutMs = 10000, step = 150): Promise<boolean> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (pred()) return true;
    await new Promise((r) => setTimeout(r, step));
  }
  return pred();
}
const REAL_CONFIG = {
  apiKey: 'AIzaSyBuo94xljbJM9Cji_3HcFvlzN_4dj0pko4',
  authDomain: 'bura-f478a.firebaseapp.com',
  projectId: 'bura-f478a',
  storageBucket: 'bura-f478a.firebasestorage.app',
  messagingSenderId: '702644274821',
  appId: '1:702644274821:web:ab3fd49b6c012b1cb90bec',
};

let pass = 0, fail = 0;
const assert = (c: boolean, m: string) => { c ? (pass++, console.log('[PASS] ' + m)) : (fail++, console.log('[FAIL] ' + m)); };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function makeCtx(name: string): FbCtx {
  const app = initializeApp(USE_EMULATOR ? { apiKey: 'fake', projectId: 'demo-bura' } : REAL_CONFIG, name);
  const auth: Auth = getAuth(app);
  const db: Firestore = getFirestore(app);
  if (USE_EMULATOR) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }
  return { db, auth };
}

interface Seat {
  client: GameClient;
  state: GameState | null;
  hand: Card[];
  sentSig: string | null;
  tick: () => void;
}

// Auto-play hand[0] whenever it is our turn. `state` and `hand` arrive as
// separate Firestore snapshots (order not guaranteed), so we drive from BOTH
// and guard with the room's updatedAt to send exactly once per state, clearing
// the guard on rejection so a stale-hand send retries with the fresh hand.
function makeSeat(ctx: FbCtx): Seat {
  const seat: Seat = { client: null as any, hand: [], state: null, sentSig: null, tick: () => {} };
  const maybePlay = () => {
    const st = seat.state as any;
    if (!st || st.phase !== 'TURN_IN_PROGRESS') return;
    const me = st.players.find((p: any) => p.id === seat.client.uid);
    if (!me || st.currentTurnPosition !== me.position || seat.hand.length === 0) return;
    const sig = String(st.updatedAt ?? `${st.roundNumber}:${st.currentTrickCards.length}`);
    if (seat.sentSig === sig) return;
    seat.sentSig = sig;
    seat.client.playCards([seat.hand[0].id]).catch(() => {});
  };
  seat.tick = maybePlay;
  seat.client = new GameClient(
    {
      onState: (st) => { seat.state = st; maybePlay(); },
      onHand: (cards) => { seat.hand = cards; maybePlay(); },
      onChat: () => {},
      onError: () => { seat.sentSig = null; },
    },
    ctx
  );
  return seat;
}

async function main() {
  const a = makeSeat(makeCtx('A'));
  const b = makeSeat(makeCtx('B'));

  // Sign both players in up front so auth latency is outside the timed flow.
  await Promise.all([a.client.init(), b.client.init()]);

  const code = await a.client.createRoom('Alice', { playerCount: 2 }, true);
  await waitFor(() => !!a.state);
  assert(!!a.state && a.state.players.length === 1, 'ჰოსტმა შექმნა ოთახი (rules: create დაშვებულია)');
  assert(a.state!.settings.playerCount === 2, '2-კაციანი რეჟიმი');

  await b.client.joinRoom(code, 'Bob');
  await waitFor(() => (b.state?.players.length ?? 0) === 2 && a.state!.players.length === 2, 20000);
  assert(!!b.state && b.state.players.length === 2, 'მე-2 მოთამაშე შემოვიდა (JOIN action → host)');
  assert(a.state!.players.length === 2, 'ჰოსტიც ხედავს 2 მოთამაშეს');

  await b.client.toggleReady(true);
  await waitFor(() => !!b.state!.players.find((p) => p.id === b.client.uid)?.isReady);
  await a.client.startGame();
  await waitFor(() => a.state!.phase === 'TURN_IN_PROGRESS' && a.hand.length === 5 && b.hand.length === 5);

  assert(a.state!.phase === 'TURN_IN_PROGRESS', 'თამაში დაიწყო');
  assert(a.hand.length === 5 && b.hand.length === 5, 'თითოს 5 კარტი (თავისი hand-ის წაკითხვა rules-ით)');
  const overlap = a.hand.filter((c) => b.hand.some((d) => d.id === c.id));
  assert(overlap.length === 0, 'ხელები არ ემთხვევა (დარიგება სწორია)');

  // Both seats auto-play on their turn. A periodic ticker (in addition to the
  // snapshot triggers) makes the driver self-heal if any snapshot nudge is missed.
  const ticker = setInterval(() => { a.tick(); b.tick(); }, 250);
  await waitFor(() => a.state!.phase === 'ROUND_FINISHED' || a.state!.phase === 'MATCH_FINISHED', 40000);
  clearInterval(ticker);

  assert(
    a.state!.phase === 'ROUND_FINISHED' || a.state!.phase === 'MATCH_FINISHED',
    `რაუნდი დასრულდა Firestore-ზე (phase=${a.state!.phase})`
  );
  const total = a.state!.team1TrickPoints + a.state!.team2TrickPoints;
  assert(total === 120, `ხელის ქულების ჯამი = 120 (მიღებული ${total})`);
  await waitFor(() => b.state!.phase === a.state!.phase, 5000);
  assert(b.state!.phase === a.state!.phase, 'ორივე კლიენტი სინქრონულია');

  console.log(`\n=== FIRESTORE E2E: ${pass} Passed, ${fail} Failed ===`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
