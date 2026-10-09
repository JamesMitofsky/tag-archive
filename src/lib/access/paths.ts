/**
 * Paths the client needs from the access gate. Kept apart from ./gate so the
 * browser bundle never pulls in the gate, and with it the keeper door phrase
 * (./keeperDoor.server).
 */

/** Where a locked page view is sent. */
export const LOCKED_PATH = '/locked';
