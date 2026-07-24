import {
  calculateCardPoints,
  canBeatAllCards,
  cardBeats,
  createDeck,
  isBuraHand,
  isSameSuitPlay,
  RANK_POINTS,
  RANK_STRENGTH,
} from '../../src/game/engine';
import { Card, Suit } from '../../src/types/game';

function runTests() {
  console.log('=== RUNNING BURA ENGINE UNIT TESTS ===');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
      failed++;
    }
  }

  // Test 1: Deck creation and points total
  const deck = createDeck();
  assert(deck.length === 36, 'Deck has exactly 36 cards');
  const totalPoints = calculateCardPoints(deck);
  assert(totalPoints === 120, 'Total points in deck equals 120');

  // Test 2: Card Points mapping
  assert(RANK_POINTS['A'] === 11, 'Ace is 11 points');
  assert(RANK_POINTS['10'] === 10, '10 is 10 points');
  assert(RANK_POINTS['K'] === 4, 'King is 4 points');
  assert(RANK_POINTS['Q'] === 3, 'Queen is 3 points');
  assert(RANK_POINTS['J'] === 2, 'Jack is 2 points');
  assert(RANK_POINTS['6'] === 0 && RANK_POINTS['9'] === 0, '6 and 9 are 0 points');

  // Test 3: Card Rank Strength
  assert(RANK_STRENGTH['A'] > RANK_STRENGTH['10'], 'Ace beats 10');
  assert(RANK_STRENGTH['10'] > RANK_STRENGTH['K'], '10 beats King');
  assert(RANK_STRENGTH['K'] > RANK_STRENGTH['Q'], 'King beats Queen');
  assert(RANK_STRENGTH['Q'] > RANK_STRENGTH['J'], 'Queen beats Jack');
  assert(RANK_STRENGTH['J'] > RANK_STRENGTH['9'], 'Jack beats 9');

  // Test 4: Trump beating rules
  const trump: Suit = 'hearts';
  const c1: Card = { id: 'h6', suit: 'hearts', rank: '6' }; // Trump 6
  const c2: Card = { id: 'dA', suit: 'diamonds', rank: 'A' }; // Non-trump Ace
  assert(cardBeats(c1, c2, trump), 'Trump 6 beats non-trump Ace');
  assert(!cardBeats(c2, c1, trump), 'Non-trump Ace cannot beat Trump 6');

  const c3: Card = { id: 'h10', suit: 'hearts', rank: '10' }; // Trump 10
  assert(cardBeats(c3, c1, trump), 'Higher trump 10 beats lower trump 6');

  const c4: Card = { id: 'sK', suit: 'spades', rank: 'K' }; // Spade King
  const c5: Card = { id: 'c10', suit: 'clubs', rank: '10' }; // Club 10
  assert(!cardBeats(c4, c5, trump), 'Spade King cannot beat Club 10 (different non-trump suits)');

  // Test 5: Multi-card beat matching (Permutations)
  // Lead plays 2 Hearts: [Hearts 7, Hearts 9]
  const lead1: Card[] = [
    { id: 'h7', suit: 'hearts', rank: '7' },
    { id: 'h9', suit: 'hearts', rank: '9' },
  ];
  // Player plays [Hearts A, Hearts 10]
  const play1: Card[] = [
    { id: 'hA', suit: 'hearts', rank: 'A' },
    { id: 'h10', suit: 'hearts', rank: '10' },
  ];
  assert(canBeatAllCards(play1, lead1, trump), 'Play1 [hA, h10] beats Lead1 [h7, h9]');

  // Player plays [Hearts 8, Hearts A]
  // Hearts 8 beats Hearts 7, Hearts A beats Hearts 9 via permutation
  const play2: Card[] = [
    { id: 'h8', suit: 'hearts', rank: '8' },
    { id: 'hA', suit: 'hearts', rank: 'A' },
  ];
  assert(canBeatAllCards(play2, lead1, trump), 'Play2 [h8, hA] beats Lead1 [h7, h9] via permutation');

  // Player plays [Hearts 6, Hearts A] -> Hearts 6 cannot beat either h7 or h9
  const play3: Card[] = [
    { id: 'h6', suit: 'hearts', rank: '6' },
    { id: 'hA', suit: 'hearts', rank: 'A' },
  ];
  assert(!canBeatAllCards(play3, lead1, trump), 'Play3 [h6, hA] fails to beat Lead1 [h7, h9]');

  // Test 6: Bura detection
  const buraHand: Card[] = [
    { id: 'h6', suit: 'hearts', rank: '6' },
    { id: 'h7', suit: 'hearts', rank: '7' },
    { id: 'h8', suit: 'hearts', rank: '8' },
    { id: 'hJ', suit: 'hearts', rank: 'J' },
    { id: 'hA', suit: 'hearts', rank: 'A' },
  ];
  const nonBuraHand: Card[] = [
    { id: 'h6', suit: 'hearts', rank: '6' },
    { id: 'h7', suit: 'hearts', rank: '7' },
    { id: 's8', suit: 'spades', rank: '8' },
    { id: 'hJ', suit: 'hearts', rank: 'J' },
    { id: 'hA', suit: 'hearts', rank: 'A' },
  ];
  assert(isBuraHand(buraHand, 'hearts'), 'Bura hand identified correctly');
  assert(!isBuraHand(nonBuraHand, 'hearts'), 'Non-bura hand identified correctly');

  // Test 7: Single-suit play validation (Maliutka/lead)
  assert(isSameSuitPlay(buraHand), 'Hand of all hearts is same suit');
  assert(!isSameSuitPlay(nonBuraHand), 'Hand with spade and hearts is not same suit');

  console.log(`\n=== TEST SUMMARY: ${passed} Passed, ${failed} Failed ===`);
  if (failed > 0) process.exit(1);
}

runTests();
