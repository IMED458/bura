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
  turnLock: boolean;
}

function makeSeat(ctx: FbCtx): Seat {
  const seat: Seat = { client: null as any, hand: [], state: null, turnLock: false };
  seat.client = new GameClient(
    {
      onState: (st) => {
        seat.state = st;
        const me = st.players.find((p) => p.id === seat.client.uid);
        if (st.phase === 'TURN_IN_PROGRESS' && me && st.currentTurnPosition === me.position) {
          if (!seat.turnLock && seat.hand.length > 0) {
            seat.turnLock = true;
            const cardId = seat.hand[0].id;
            setTimeout(() => seat.client.playCards([cardId]).catch(() => {}), 20);
          }
        } else {
          seat.turnLock = false;
        }
      },
      onHand: (cards) => { seat.hand = cards; },
      onChat: () => {},
      onError: (m) => console.log('[client error] ' + m),
    },
    ctx
  );
  return seat;
}

async function main() {
  const a = makeSeat(makeCtx('A'));
  const b = makeSeat(makeCtx('B'));

  const code = await a.client.createRoom('Alice', { playerCount: 2 }, true);
  await wait(400);
  assert(!!a.state && a.state.players.length === 1, 'ჰოსტმა შექმნა ოთახი (rules: create დაშვებულია)');
  assert(a.state!.settings.playerCount === 2, '2-კაციანი რეჟიმი');

  await b.client.joinRoom(code, 'Bob');
  await wait(600);
  assert(!!b.state && b.state.players.length === 2, 'მე-2 მოთამაშე შემოვიდა (JOIN action → host)');
  assert(a.state!.players.length === 2, 'ჰოსტიც ხედავს 2 მოთამაშეს');

  // Bob can read only his own hand; verify hand privacy after deal.
  await b.client.toggleReady(true);
  await wait(300);
  await a.client.startGame();
  await wait(600);

  assert(a.state!.phase === 'TURN_IN_PROGRESS', 'თამაში დაიწყო');
  assert(a.hand.length === 5 && b.hand.length === 5, 'თითოს 5 კარტი (თავისი hand-ის წაკითხვა rules-ით)');
  const overlap = a.hand.filter((c) => b.hand.some((d) => d.id === c.id));
  assert(overlap.length === 0, 'ხელები არ ემთხვევა (დარიგება სწორია)');

  // Kick the first move (both seats auto-play on their turn thereafter).
  const firstMover = a.state!.currentTurnPosition ===
    a.state!.players.find((p) => p.id === a.client.uid)!.position ? a : b;
  if (firstMover.hand.length) await firstMover.client.playCards([firstMover.hand[0].id]);

  let guard = 0;
  while (a.state!.phase === 'TURN_IN_PROGRESS' && guard < 120) { guard++; await wait(150); }

  assert(
    a.state!.phase === 'ROUND_FINISHED' || a.state!.phase === 'MATCH_FINISHED',
    `რაუნდი დასრულდა Firestore-ზე (phase=${a.state!.phase})`
  );
  const total = a.state!.team1TrickPoints + a.state!.team2TrickPoints;
  assert(total === 120, `ხელის ქულების ჯამი = 120 (მიღებული ${total})`);
  assert(b.state!.phase === a.state!.phase, 'ორივე კლიენტი სინქრონულია');

  console.log(`\n=== FIRESTORE E2E: ${pass} Passed, ${fail} Failed ===`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
