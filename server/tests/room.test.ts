/**
 * Headless unit tests for the transport-agnostic BuraRoom authority.
 * No server, no Firestore — plays full games in-process.
 * Run: tsx server/tests/room.test.ts
 */
import { BuraRoom } from '../../src/game/room';

let pass = 0;
let fail = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { pass++; console.log(`[PASS] ${msg}`); }
  else { fail++; console.log(`[FAIL] ${msg}`); }
}

function playFullGame(playerCount: 2 | 4) {
  const uids = ['u1', 'u2', 'u3', 'u4'].slice(0, playerCount);
  const room = BuraRoom.createNew('u1', 'P1', 'BURA-TEST', true, { playerCount });
  for (let i = 1; i < playerCount; i++) {
    const r = room.addPlayer(uids[i], 'P' + (i + 1));
    assert(r.success, `${playerCount}p: მოთამაშე ${i + 1} დაემატა`);
    room.setReady(uids[i], true);
  }
  assert(room.state.players.length === playerCount, `${playerCount}p: სწორი მოთამაშეთა რაოდენობა`);

  const start = room.startGame('u1');
  assert(start.success, `${playerCount}p: თამაში დაიწყო`);
  assert(room.state.phase === 'TURN_IN_PROGRESS', `${playerCount}p: ფაზა TURN_IN_PROGRESS`);
  assert(uids.every((u) => (room.hands.get(u) || []).length === 5), `${playerCount}p: ყველას 5 კარტი`);

  const uidByPos = (pos: string) => room.state.players.find((p) => p.position === pos)!.id;

  let guard = 0;
  while ((room.state.phase === 'TURN_IN_PROGRESS' || room.state.phase === 'TRICK_RESOLUTION') && guard < 500) {
    guard++;
    if (room.state.phase === 'TRICK_RESOLUTION') {
      const resolved = room.resolvePendingTrick();
      if (!resolved.success) assert(false, `${playerCount}p: ხელის დასრულება ვერ მოხერხდა — ${resolved.error}`);
      continue;
    }
    const uid = uidByPos(room.state.currentTurnPosition);
    const hand = room.hands.get(uid) || [];
    if (hand.length === 0) break;
    const res = room.playCards(uid, [hand[0].id]);
    if (!res.success) { assert(false, `${playerCount}p: სვლა უარყოფილია — ${res.error}`); break; }
  }

  assert(
    room.state.phase === 'ROUND_FINISHED' || room.state.phase === 'MATCH_FINISHED',
    `${playerCount}p: რაუნდი დასრულდა (phase=${room.state.phase})`
  );
  const total = room.state.team1TrickPoints + room.state.team2TrickPoints;
  assert(total === 120, `${playerCount}p: ხელის ქულების ჯამი = 120 (მიღებული ${total})`);
  const taken = room.state.team1TakenCardCount + room.state.team2TakenCardCount;
  assert(taken === 36, `${playerCount}p: წაყვანილი კარტების ჯამი = 36 (მიღებული ${taken})`);
  assert(room.deck.length === 0, `${playerCount}p: დასტა ბოლომდე დაცარიელდა`);

  // No duplicate card ids anywhere (the deck-persistence bug regression guard).
  const allIds = uids.flatMap((u) => (room.hands.get(u) || []).map((c) => c.id));
  assert(new Set(allIds).size === allIds.length, `${playerCount}p: ხელებში დუბლიკატი ბარათი არ არის`);
}

// Bura auto-win path
function testBuraDeclare() {
  const room = BuraRoom.createNew('a', 'A', 'BURA-BURA', true, { playerCount: 2 });
  room.addPlayer('b', 'B');
  room.setReady('b', true);
  room.startGame('a');
  const trump = room.state.trumpSuit!;
  // Force south's hand to five trumps.
  room.hands.set('a', ['A', 'K', 'Q', 'J', '10'].map((r) => ({ id: `${trump}_${r}`, suit: trump, rank: r as any })));
  const southUid = room.state.players.find((p) => p.position === 'south')!.id;
  const before = room.state.team1MatchScore;
  const res = room.declareBura(southUid);
  assert(res.success, 'ბურა: გამოცხადება წარმატდა');
  assert(room.state.team1MatchScore > before, 'ბურა: გუნდმა 1 მიიღო ქულა');
  assert(room.state.phase === 'ROUND_FINISHED' || room.state.phase === 'MATCH_FINISHED', 'ბურა: რაუნდი დასრულდა');
}

// Rejections
function testRejections() {
  const room = BuraRoom.createNew('a', 'A', 'BURA-REJ', true, { playerCount: 2 });
  const full = room.addPlayer('b', 'B');
  assert(full.success, 'უარყოფა: მე-2 დაემატა');
  const third = room.addPlayer('c', 'C');
  assert(!third.success, 'უარყოფა: მე-3 მოთამაშე ვერ დაემატა (სავსე)');
  const early = room.startGame('a');
  assert(!early.success, 'უარყოფა: არ-მზა თამაში ვერ დაიწყო');
}

function testTurnTimeoutAutoPlay() {
  const room = BuraRoom.createNew('a', 'A', 'BURA-TIMER', true, { playerCount: 2 });
  room.addPlayer('b', 'B');
  room.setReady('b', true);
  room.startGame('a');

  const turnPlayer = room.state.players.find((p) => p.position === room.state.currentTurnPosition)!;
  const handBefore = turnPlayer.cardsInHandCount;
  const startedAt = room.state.turnStartedAt || Date.now();

  assert(room.tickTimers(startedAt + 15_000), 'ტაიმერი: 15 წამზე გაფრთხილება ჩაირთო');
  assert(!!room.state.turnWarningSent, 'ტაიმერი: გაფრთხილება state-ში ჩაიწერა');
  assert(room.tickTimers(startedAt + 30_000), 'ტაიმერი: 30 წამზე მოთამაშე დროებით გავიდა');
  assert(!turnPlayer.isConnected, 'ტაიმერი: მოთამაშე disconnected გახდა');

  assert(room.tickTimers((room.state.autoPlayDeadline || startedAt + 50_000)), 'ტაიმერი: disconnected მოთამაშემ ავტომატურად ჩამოვიდა');
  assert(turnPlayer.cardsInHandCount === handBefore - 1, 'ტაიმერი: ავტომატურმა სვლამ 1 კარტი დადო');

  const reconnect = room.addPlayer(turnPlayer.id, turnPlayer.name);
  assert(reconnect.success && !!turnPlayer.isConnected, 'ტაიმერი: დაბრუნებულმა მოთამაშემ იგივე თამაშში განაგრძო');
}

console.log('=== BURA ROOM UNIT TESTS ===');
playFullGame(2);
playFullGame(4);
testBuraDeclare();
testRejections();
testTurnTimeoutAutoPlay();
console.log(`\n=== SUMMARY: ${pass} Passed, ${fail} Failed ===`);
process.exit(fail > 0 ? 1 : 0);
