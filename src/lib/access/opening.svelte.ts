/**
 * The moment the Archive opens after a good tap. TapToast says "Archive
 * opened" in the middle of the screen, and the card cloud holds its entrance
 * back so the two don't talk over each other: the toast leaves just before the
 * cards fly in.
 *
 * Both sides key off one timestamp rather than their own timers, because the
 * cloud can only start once its dataset has loaded, which takes as long as the
 * network does. The toast flags the moment as pending; the first cloud to
 * reveal claims it and fixes `cardsAt`, which the toast times its exit against.
 */

/** How much longer than usual the cards wait before flying in. */
export const OPENING_HOLD_MS = 700;

export const opening = $state<{ pending: boolean; cardsAt: number | null }>({
	pending: false,
	cardsAt: null
});

/**
 * Claim a pending opening for the cloud about to reveal, returning how long its
 * entrance should hold (0 when there is no opening to wait for). One claim per
 * tap, so a later search reveals as promptly as ever.
 */
export function claimOpening(): number {
	if (!opening.pending) return 0;
	opening.pending = false;
	opening.cardsAt = performance.now() + OPENING_HOLD_MS;
	return OPENING_HOLD_MS;
}
