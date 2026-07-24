/**
 * End-to-end integration test for the 4-player (2v2) Bura flow.
 * Requires the dev server running on ws://localhost:3000.
 * Run: tsx server/tests/fourPlayer.integration.ts
 */
import { WebSocket } from 'ws';

const URL = 'ws://localhost:3000';
let pass = 0;
let fail = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { pass++; console.log(`[PASS] ${msg}`); }
  else { fail++; console.log(`[FAIL] ${msg}`); }
}

interface Ctx { ws: WebSocket; label: string; position?: string; hand: any[]; state: any; }
function connect(label: string): Promise<Ctx> {
  return new Promise((resolve) => {
    const ws = new WebSocket(URL);
    const ctx: Ctx = { ws, label, hand: [], state: null };
    ws.on('open', () => resolve(ctx));
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'ROOM_STATE') { ctx.state = msg.state; ctx.hand = msg.hand || []; ctx.position = msg.myPosition; }
      else if (msg.type === 'ERROR' || msg.type === 'ACTION_REJECTED') console.log(`[SERVER ${msg.type} → ${label}] ${msg.message || msg.reason}`);
    });
  });
}
const send = (ctx: Ctx, m: any) => ctx.ws.send(JSON.stringify(m));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const players = ['A', 'B', 'C', 'D'];
  const ctxs: Ctx[] = [];
  const host = await connect('A');
  send(host, { type: 'CREATE_ROOM', name: 'A', settings: { playerCount: 4 } });
  await wait(300);
  ctxs.push(host);
  const roomCode = host.state.roomCode;
  assert(host.state.settings.playerCount === 4, 'ოთახი შეიქმნა 4-კაციან რეჟიმში');

  for (const name of ['B', 'C', 'D']) {
    const c = await connect(name);
    send(c, { type: 'JOIN_ROOM', roomCode, name });
    ctxs.push(c);
    await wait(200);
  }
  assert(host.state.players.length === 4, '4 მოთამაშე ოთახშია');
  const positions = host.state.players.map((p: any) => p.position).sort();
  assert(JSON.stringify(positions) === JSON.stringify(['east', 'north', 'south', 'west']), 'ოთხივე სავარძელი დაკავებულია');

  for (const c of ctxs.slice(1)) send(c, { type: 'TOGGLE_READY' });
  await wait(300);
  send(host, { type: 'START_GAME' });
  await wait(400);

  assert(host.state.phase === 'TURN_IN_PROGRESS', 'თამაში დაიწყო');
  assert(ctxs.every((c) => c.hand.length === 5), 'ოთხივეს 5-5 კარტი დაურიგდა');
  assert(host.state.deckRemainingCount === 16, `დასტაში დარჩა 16 (36 - 20 დარიგებული = ${host.state.deckRemainingCount})`);

  const seen = new Set<string>();
  const autoPlay = (ctx: Ctx) => {
    ctx.ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type !== 'ROOM_STATE') return;
      const st = msg.state;
      if (st.phase !== 'TURN_IN_PROGRESS' || st.currentTurnPosition !== msg.myPosition) return;
      seen.add(msg.myPosition);
      const h = msg.hand || [];
      if (h.length === 0) return;
      setTimeout(() => send(ctx, { type: 'PLAY_CARDS', cardIds: [h[0].id] }), 15);
    });
  };
  ctxs.forEach(autoPlay);
  const first = ctxs.find((c) => c.position === host.state.currentTurnPosition)!;
  send(first, { type: 'PLAY_CARDS', cardIds: [first.hand[0].id] });

  let guard = 0;
  while (host.state.phase === 'TURN_IN_PROGRESS' && guard < 200) { guard++; await wait(50); }

  assert(seen.size === 4, `ოთხივე მოთამაშემ ისვლა (seen=${seen.size})`);
  assert(host.state.phase === 'ROUND_FINISHED' || host.state.phase === 'MATCH_FINISHED', `რაუნდი დასრულდა (phase=${host.state.phase})`);
  const total = host.state.team1TrickPoints + host.state.team2TrickPoints;
  assert(total === 120, `ხელის ქულების ჯამი = 120 (მიღებული ${total})`);

  ctxs.forEach((c) => c.ws.close());
  console.log(`\n=== 4-PLAYER INTEGRATION: ${pass} Passed, ${fail} Failed ===`);
  process.exit(fail > 0 ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
