/**
 * Pure matchmaking decision helpers, factored out of GameClient so the tricky
 * "which open room do I join / should I abandon mine?" logic is unit-testable
 * without Firestore. These functions never touch the network.
 */

export interface MatchmakingAdvert {
  id: string;          // room code (matchmaking doc id)
  mode?: number;
  count?: number;
  createdAt?: number;
}

export interface RoomLike {
  phase: string;
  hostUid?: string;
  players?: { id: string }[];
  settings: { playerCount: number };
}

/** Open adverts for `mode`, oldest first (createdAt, then code as a stable tie-break). */
export function sortOpenCandidates(adverts: MatchmakingAdvert[], mode: number): MatchmakingAdvert[] {
  return adverts
    .filter((a) => (a.count || 0) < mode)
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0) || String(a.id).localeCompare(String(b.id)));
}

/** Can `myUid` actually join this room right now? */
export function isRoomJoinable(room: RoomLike | null | undefined, myUid: string): boolean {
  if (!room) return false;
  const players = room.players || [];
  const capacity = room.settings?.playerCount ?? 0;
  return (
    room.phase === 'LOBBY' &&
    players.length > 0 &&
    players.length < capacity &&
    room.hostUid !== myUid &&
    !players.some((p) => p.id === myUid)
  );
}

/**
 * Is advert `c` "senior" to my own room? The senior (older) room wins a
 * simultaneous-search race; ties are broken by room code so exactly one of two
 * equally-aged rooms abandons and the pair converges to a single room.
 */
export function isSeniorTo(c: MatchmakingAdvert, myCode: string, myCreatedAt: number): boolean {
  const ca = c.createdAt || 0;
  if (c.id === myCode) return false;
  return ca < myCreatedAt || (ca === myCreatedAt && String(c.id) < myCode);
}

/** The oldest open advert (other than mine) that I am senior-bound to merge into. */
export function pickSeniorAdvert(
  adverts: MatchmakingAdvert[],
  mode: number,
  myCode: string,
  myCreatedAt: number
): MatchmakingAdvert | undefined {
  return sortOpenCandidates(
    adverts.filter((a) => isSeniorTo(a, myCode, myCreatedAt)),
    mode
  )[0];
}
