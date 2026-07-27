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

// A present player (recent heartbeat) is NEVER auto-played, no matter how long.
function testHeartbeatKeepsPresent() {
  const room = BuraRoom.createNew('a', 'A', 'BURA-HB', true, { playerCount: 2 });
  room.addPlayer('b', 'B');
  room.setReady('b', true);
  room.startGame('a');
  const turnPlayer = room.state.players.find((p) => p.position === room.state.currentTurnPosition)!;
  const handBefore = turnPlayer.cardsInHandCount;
  const startedAt = room.state.turnStartedAt || Date.now();

  // Keep heartbeating; even far past the old 30s deadline, no auto-disconnect/auto-play.
  for (let t = 5_000; t <= 90_000; t += 5_000) {
    room.heartbeat(turnPlayer.id, startedAt + t);
    room.tickTimers(startedAt + t);
  }
  assert(turnPlayer.isConnected, 'heartbeat: present მოთამაშე online დარჩა');
  assert(turnPlayer.cardsInHandCount === handBefore, 'heartbeat: present მოთამაშეს კარტი ავტომ. არ დაუდო');
}

// Malyutka: 5 cards of one non-trump suit.
function testMolodkaDeclare() {
  const room = BuraRoom.createNew('a', 'A', 'BURA-MOL', true, { playerCount: 2 });
  room.addPlayer('b', 'B');
  room.setReady('b', true);
  room.startGame('a');
  const trump = room.state.trumpSuit!;
  const suit = (['hearts', 'diamonds', 'clubs', 'spades'] as const).find((s) => s !== trump)!;
  const southUid = room.state.players.find((p) => p.position === 'south')!.id;
  room.hands.set(southUid, ['A', 'K', 'Q', 'J', '10'].map((r) => ({ id: `${suit}_${r}`, suit, rank: r as any })));
  const before = room.state.team1MatchScore;
  const res = room.declareMolodka(southUid);
  assert(res.success, 'მალიუტკა: გამოცხადება წარმატდა (5 ერთი მასტა)');
  assert(room.state.team1MatchScore > before, 'მალიუტკა: გუნდმა 1 მიიღო ქულა');
  // Trump hand must NOT qualify as malyutka.
  room.hands.set(southUid, ['A', 'K', 'Q', 'J', '10'].map((r) => ({ id: `${trump}_${r}`, suit: trump, rank: r as any })));
  const res2 = room.declareMolodka(southUid);
  assert(!res2.success, 'მალიუტკა: 5 კოზირი მალიუტკად არ ითვლება');
}

function seat4() {
  // u1=south(team1) u2=west(team2) u3=north(team1) u4=east(team2)
  const room = BuraRoom.createNew('u1', 'P1', 'BURA-RAISE', true, { playerCount: 4 });
  ['u2', 'u3', 'u4'].forEach((u, i) => { room.addPlayer(u, 'P' + (i + 2)); room.setReady(u, true); });
  room.startGame('u1');
  return room;
}

// Full alternating-offer sequence (§7 of the spec).
function testRaiseAlternation() {
  const room = seat4();
  const s = room.state;
  assert(s.raiseEligibleTeam === null, 'შეთავაზება: თავიდან ორივე გუნდს შეუძლია გახსნა');

  // 1. Team A (team1, u1) declares davi.
  assert(room.proposeRaise('u1', 2).success, 'შეთავაზება: გუნდი A-მ გამოაცხადა დავი');
  assert(s.phase === 'RAISE_OFFER_PENDING', 'შეთავაზება: ფაზა RAISE_OFFER_PENDING');
  // 2/12. A second offer cannot be opened while one is pending.
  assert(room.proposeRaise('u3', 3).code === 'OFFER_ALREADY_PENDING', 'შეთავაზება: ორი შეთავაზება ერთდროულად ვერ შeიქმნება');
  // 3. Partner of proposer (u3, team A) cannot respond.
  assert(room.respondRaise('u3', true).code === 'NOT_ELIGIBLE_TO_RESPOND', 'შეთავაზება: პროპოზერის გუნდი ვერ პასუხობს');
  // 4. Team B (u2) accepts.
  assert(room.respondRaise('u2', true).success, 'შეთავაზება: გუნდი B-მ უპასუხა კი');
  assert(s.currentRaiseLevel === 2 && s.raiseEligibleTeam === 2, 'შეთავაზება: დონე=2, უფლება გუნდ B-ს');
  // 13. A duplicate "yes" is a no-op (offer already resolved).
  assert(room.respondRaise('u2', true).code === 'STALE_GAME_STATE', 'შეთავაზება: მეორედ დაჭერილი კი აღარ მუშავდება');
  // 2/3. Team A (and its partner) cannot declare se now.
  assert(room.proposeRaise('u1', 3).code === 'NOT_ELIGIBLE_TO_RAISE', 'შეთავაზება: გუნდი A ვეღარ აცხადებს სეს');
  assert(room.proposeRaise('u3', 3).code === 'NOT_ELIGIBLE_TO_RAISE', 'შეთავაზება: A-ს პარტნიორიც ვერ აცხადებს სეს');
  // 5/6. Team B declares se.
  assert(room.proposeRaise('u2', 3).success, 'შეთავაზება: გუნდ B-მ გამოაცხადა სე');
  // 7/8. Team A accepts.
  assert(room.respondRaise('u1', true).success, 'შეთავაზება: გუნდი A-მ უპასუხა კი');
  assert(s.currentRaiseLevel === 3 && s.raiseEligibleTeam === 1, 'შეთავაზება: დონე=3, უფლება გუნდ A-ს');
  // 9. Team A may now declare chari.
  assert(room.canTeamRaise(1) && !room.canTeamRaise(2), 'შეთავაზება: ჩარი მხოლოდ გუნდ A-ს');
  // Only the immediate next level may be proposed.
  assert(room.proposeRaise('u1', 6).code === 'INVALID_RAISE_LEVEL', 'შეთავაზება: მხოლოდ მომდევნო დონეა დაშვებული');
  assert(room.proposeRaise('u1', 4).success, 'შეთავაზება: გუნდი A-მ გამოაცხადა ჩარი');
  room.respondRaise('u2', true);
  assert(s.currentRaiseLevel === 4 && s.raiseEligibleTeam === 2, 'შეთავაზება: დონე=4, უფლება გუნდ B-ს');
}

// 10. After a card is played no further offers are allowed.
function testRaiseLockedAfterPlay() {
  const room = seat4();
  const uidByPos = (pos: string) => room.state.players.find((p) => p.position === pos)!.id;
  const turnUid = uidByPos(room.state.currentTurnPosition);
  const hand = room.hands.get(turnUid)!;
  assert(room.playCards(turnUid, [hand[0].id]).success, 'ბლოკი: პირველი კარტი ჩამოვიდა');
  const res = room.proposeRaise('u1', 2);
  assert(res.code === 'CARD_ALREADY_PLAYED', 'ბლოკი: კარტის ჩამოსვლის შემდეგ შეთავაზება იბლოკება');
}

// 11. A round-reset clears the offer state.
function testRaiseResetsPerRound() {
  const room = seat4();
  room.proposeRaise('u1', 2);
  room.respondRaise('u2', true);
  assert(room.state.raiseEligibleTeam === 2, 'რესეტამდე: უფლება გუნდ B-ს');
  // Force the round to finish and start a new one.
  room.state.phase = 'ROUND_FINISHED';
  room.startNextRound('u1');
  const s = room.state;
  assert(s.currentRaiseLevel === 1 && s.raiseEligibleTeam === null && s.roundCardPlayed === false,
    'რესეტი: ახალ რაუნდში შეთავაზების state გასუფთავდა');
}

// Lobby team assignment (§8).
function testTeamAssignment() {
  const room = BuraRoom.createNew('u1', 'P1', 'BURA-TEAM', true, { playerCount: 4 });
  ['u2', 'u3', 'u4'].forEach((u, i) => room.addPlayer(u, 'P' + (i + 2)));
  const by = (u: string) => room.state.players.find((p) => p.id === u)!;
  assert(by('u3').team === 1 && by('u2').team === 2, 'გუნდი: საწყისი განლაგება 2-2');

  // u3 (team1) moves to team2 — target team is full, so a swap keeps 2-2.
  room.setReady('u3', true);
  assert(room.moveToTeam('u3', 'u3', 2).success, 'გუნდი: მოთამაშემ თავად შეიცვალა გუნდი');
  assert(by('u3').team === 2, 'გუნდი: u3 გადავიდა გუნდ 2-ში');
  assert(room.hasValidTeams(), 'გუნდი: შემადგენლობა კვლავ 2-2 (სამი ვერ იქნება ერთში)');
  assert(!by('u3').isReady, 'გუნდი: გუნდის შეცვლის შემდეგ ready გაუქმდა');

  // A non-host cannot move someone else.
  assert(room.moveToTeam('u2', 'u4', 1).code === 'PLAYER_NOT_IN_LOBBY', 'გუნდი: სხვისი გადაყვანა მხოლოდ ჰოსტს');
  // Host can move anyone.
  assert(room.moveToTeam('u1', 'u4', 1).success, 'გუნდი: ჰოსტმა გადაიყვანა სხვა მოთამაშე');

  // A structurally invalid composition blocks the start.
  const bad = BuraRoom.createNew('h1', 'H1', 'BURA-BAD', true, { playerCount: 4 });
  ['h2', 'h3', 'h4'].forEach((u) => { bad.addPlayer(u, u); bad.setReady(u, true); });
  bad.state.players.forEach((p) => (p.team = 1)); // force 4-in-1
  assert(bad.startGame('h1').code === 'INVALID_TEAM_COMPOSITION', 'გუნდი: არასწორ შემადგენლობაზე თამაში ვერ იწყება');
}

console.log('=== BURA ROOM UNIT TESTS ===');
playFullGame(2);
playFullGame(4);
testBuraDeclare();
testRejections();
testTurnTimeoutAutoPlay();
testHeartbeatKeepsPresent();
testMolodkaDeclare();
testRaiseAlternation();
testRaiseLockedAfterPlay();
testRaiseResetsPerRound();
testTeamAssignment();
console.log(`\n=== SUMMARY: ${pass} Passed, ${fail} Failed ===`);
process.exit(fail > 0 ? 1 : 0);
