/**
 * Unit tests for the pure matchmaking decision helpers.
 * Run: tsx server/tests/matchmaking.test.ts
 */
import {
  sortOpenCandidates,
  isRoomJoinable,
  isSeniorTo,
  pickSeniorAdvert,
} from '../../src/net/matchmaking';

let pass = 0, fail = 0;
const assert = (c: boolean, m: string) => {
  c ? (pass++, console.log('[PASS] ' + m)) : (fail++, console.log('[FAIL] ' + m));
};

const room = (over: any = {}) => ({
  phase: 'LOBBY',
  hostUid: 'host',
  players: [{ id: 'host' }],
  settings: { playerCount: 2 },
  ...over,
});

console.log('=== MATCHMAKING HELPER TESTS ===');

// sortOpenCandidates: drops full rooms, orders oldest-first, stable on ties.
{
  const adverts = [
    { id: 'C', count: 0, createdAt: 300 },
    { id: 'B', count: 2, createdAt: 100 }, // full (mode 2) -> dropped
    { id: 'A', count: 1, createdAt: 100 },
    { id: 'D', count: 1, createdAt: 100 },
  ];
  const out = sortOpenCandidates(adverts, 2).map((a) => a.id);
  assert(!out.includes('B'), 'sort: სავსე ოთახი ამოვარდა');
  assert(out[0] === 'A' && out[1] === 'D' && out[2] === 'C', 'sort: oldest-first + კოდით tie-break (A,D,C)');
}

// isRoomJoinable: only an open, non-full lobby I don't already own/occupy.
{
  assert(isRoomJoinable(room(), 'me'), 'joinable: ღია ლობი, სხვა ჰოსტი — კი');
  assert(!isRoomJoinable(room({ phase: 'TURN_IN_PROGRESS' }), 'me'), 'joinable: დაწყებული თამაში — არა');
  assert(!isRoomJoinable(room({ players: [{ id: 'host' }, { id: 'x' }] }), 'me'), 'joinable: სავსე — არა');
  assert(!isRoomJoinable(room({ players: [] }), 'me'), 'joinable: ცარიელი (მკვდარი) ოთახი — არა');
  assert(!isRoomJoinable(room({ hostUid: 'me' }), 'me'), 'joinable: ჩემი ოთახი — არა');
  assert(!isRoomJoinable(room({ players: [{ id: 'host' }, { id: 'me' }], settings: { playerCount: 4 } }), 'me'),
    'joinable: უკვე ამ ოთახში ვარ — არა');
  assert(!isRoomJoinable(null, 'me'), 'joinable: არარსებული ოთახი — არა');
}

// isSeniorTo / pickSeniorAdvert: deterministic race resolution.
{
  assert(isSeniorTo({ id: 'A', createdAt: 100 }, 'B', 200), 'senior: უფრო ძველი ოთახი სენიორია');
  assert(!isSeniorTo({ id: 'Z', createdAt: 300 }, 'B', 200), 'senior: უფრო ახალი ოთახი არ არის სენიორი');
  assert(!isSeniorTo({ id: 'MINE', createdAt: 100 }, 'MINE', 100), 'senior: საკუთარ თავზე — არა');
  // Equal age: lexicographically-smaller code wins, so exactly one side abandons.
  assert(isSeniorTo({ id: 'AAA', createdAt: 100 }, 'BBB', 100), 'senior: ტოლ ასაკზე პატარა კოდი იგებს');
  assert(!isSeniorTo({ id: 'BBB', createdAt: 100 }, 'AAA', 100), 'senior: ტოლ ასაკზე დიდი კოდი აგებს');

  const board = [
    { id: 'MINE', count: 1, createdAt: 200 },
    { id: 'OLD', count: 1, createdAt: 100 },
    { id: 'NEW', count: 1, createdAt: 500 },
    { id: 'FULL', count: 2, createdAt: 50 },
  ];
  const pick = pickSeniorAdvert(board, 2, 'MINE', 200);
  assert(pick?.id === 'OLD', 'pick: სენიორი ღია ოთახი = OLD (სავსე FULL გამოირიცხა)');
  assert(pickSeniorAdvert([{ id: 'MINE', count: 1, createdAt: 200 }], 2, 'MINE', 200) === undefined,
    'pick: მხოლოდ ჩემი ოთახია — არავინ');
}

console.log(`\n=== SUMMARY: ${pass} Passed, ${fail} Failed ===`);
process.exit(fail > 0 ? 1 : 0);
