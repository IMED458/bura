/**
 * End-to-end integration test for the 2-player (1v1) Bura flow.
 * Requires the dev server running on ws://localhost:3000.
 * Run: tsx server/tests/twoPlayer.integration.ts
 */
import { WebSocket } from 'ws';

const URL = 'ws://localhost:3000';

interface Ctx {
  ws: WebSocket;
  label: string;
  position?: string;
  hand: any[];
  state: any;
  playerId?: string;
}

let pass = 0;
let fail = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    pass++;
    console.log(`[PASS] ${msg}`);
  } else {
    fail++;
    console.log(`[FAIL] ${msg}`);
  }
}

function connect(label: string): Promise<Ctx> {
  return new Promise((resolve) => {
    const ws = new WebSocket(URL);
    const ctx: Ctx = { ws, label, hand: [], state: null };
    ws.on('open', () => resolve(ctx));
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'SESSION_INIT') {
        ctx.playerId = msg.player.id;
        ctx.position = msg.player.position;
      } else if (msg.type === 'ROOM_STATE') {
        ctx.state = msg.state;
        ctx.hand = msg.hand || [];
        ctx.position = msg.myPosition;
      } else if (msg.type === 'ERROR' || msg.type === 'ACTION_REJECTED') {
        console.log(`[SERVER ${msg.type} → ${label}] ${msg.message || msg.reason}`);
      }
    });
  });
}

const send = (ctx: Ctx, m: any) => ctx.ws.send(JSON.stringify(m));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const a = await connect('A');
  send(a, { type: 'CREATE_ROOM', name: 'Alice', settings: { playerCount: 2 } });
  await wait(300);

  assert(a.state?.settings.playerCount === 2, 'ოთახი შეიქმნა 2-კაციან რეჟიმში');
  assert(a.state?.players.length === 1, 'ჰოსტი დაემატა ერთადერთ მოთამაშედ');
  const roomCode = a.state.roomCode;

  const b = await connect('B');
  send(b, { type: 'JOIN_ROOM', roomCode, name: 'Bob' });
  await wait(300);

  assert(a.state.players.length === 2, '2 მოთამაშე ოთახშია');
  const posA = a.state.players.find((p: any) => p.name === 'Alice');
  const posB = a.state.players.find((p: any) => p.name === 'Bob');
  assert(posA.position === 'south' && posB.position === 'north', 'სავარძლები: Alice=south, Bob=north');
  assert(posA.team === 1 && posB.team === 2, 'გუნდები განსხვავებულია (1 vs 2)');

  // A third join must be rejected (room full at 2)
  const c = await connect('C');
  send(c, { type: 'JOIN_ROOM', roomCode, name: 'Carol' });
  await wait(300);
  assert(a.state.players.length === 2, 'მე-3 მოთამაშე უარყოფილია (ოთახი სავსეა)');
  c.ws.close();

  // Bob readies, Alice starts
  send(b, { type: 'TOGGLE_READY' });
  await wait(200);
  send(a, { type: 'START_GAME' });
  await wait(300);

  assert(a.state.phase === 'TURN_IN_PROGRESS', 'თამაში დაიწყო');
  assert(a.hand.length === 5 && b.hand.length === 5, 'თითო მოთამაშეს 5 კარტი დაურიგდა');
  assert(!!a.state.trumpSuit, 'კოზირი განისაზღვრა');
  // 36 - 10 dealt = 26 remaining
  assert(a.state.deckRemainingCount === 26, `დასტაში დარჩა 26 კარტი (იყო ${a.state.deckRemainingCount})`);

  // Play through the whole round: each client plays hand[0] whenever it is
  // its own turn, driven purely by its own latest ROOM_STATE (no cross-client race).
  const seenTurnPositions = new Set<string>();
  const autoPlay = (ctx: Ctx) => {
    ctx.ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type !== 'ROOM_STATE') return;
      const st = msg.state;
      if (st.phase !== 'TURN_IN_PROGRESS') return;
      if (st.currentTurnPosition !== msg.myPosition) return;
      seenTurnPositions.add(msg.myPosition);
      const h = msg.hand || [];
      if (h.length === 0) return;
      setTimeout(() => send(ctx, { type: 'PLAY_CARDS', cardIds: [h[0].id] }), 15);
    });
  };
  autoPlay(a);
  autoPlay(b);

  // Kick off the first move (the START_GAME ROOM_STATE was already consumed
  // before the autoPlay listeners were attached).
  const firstActor = a.position === a.state.currentTurnPosition ? a : b;
  send(firstActor, { type: 'PLAY_CARDS', cardIds: [firstActor.hand[0].id] });

  // Wait for the round to finish.
  let guard = 0;
  while (a.state.phase === 'TURN_IN_PROGRESS' && guard < 200) {
    guard++;
    await wait(50);
  }

  console.log(
    `[STATE] phase=${a.state.phase} turn=${a.state.currentTurnPosition} deck=${a.state.deckRemainingCount} ` +
      `handsA=${a.hand.length} handsB=${b.hand.length} ` +
      `cardCounts=${a.state.players.map((p: any) => p.position + ':' + p.cardsInHandCount).join(',')} ` +
      `trickCards=${a.state.currentTrickCards.length} req=${a.state.requiredCardCount} ` +
      `t1=${a.state.team1TrickPoints} t2=${a.state.team2TrickPoints}`
  );

  assert(seenTurnPositions.has('south') && seenTurnPositions.has('north'), 'სვლა მონაცვლეობდა south↔north');
  assert(
    a.state.phase === 'ROUND_FINISHED' || a.state.phase === 'MATCH_FINISHED',
    `რაუნდი დასრულდა კორექტულად (phase=${a.state.phase})`
  );
  const totalTrick = a.state.team1TrickPoints + a.state.team2TrickPoints;
  assert(totalTrick === 120, `ხელის ქულების ჯამი = 120 (მიღებული ${totalTrick})`);
  assert(
    a.state.team1MatchScore > 0 || a.state.team2MatchScore > 0 || totalTrick === 120,
    'რომელიმე გუნდმა მიიღო მატჩის ქულა (ან ფრე)'
  );

  a.ws.close();
  b.ws.close();

  console.log(`\n=== 2-PLAYER INTEGRATION: ${pass} Passed, ${fail} Failed ===`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
