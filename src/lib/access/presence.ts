/**
 * Presence: proving to the server that the site is on the visitor's screen, so
 * the access pass (./pass) keeps sliding for as long as it is, and runs out
 * PASS_TTL_MS after it stops being.
 *
 * Why the clock cannot run here: a backgrounded mobile tab is suspended (iOS)
 * or throttled (Android), so no timer in it can be trusted to fire "20 minutes
 * later". What every mobile browser does reliably is tell the page when it goes
 * hidden and visible again (the Page Visibility API: screen lock, app switch,
 * tab switch and closing all count as hidden), and flush a `sendBeacon` sent at
 * that moment. So the page beats while visible, beats once more as it hides,
 * beats again the instant it is back, and the server keeps the time.
 *
 * `startPresence` is the pure scheduler, with its document, window and clock
 * injectable so presence.spec.ts can drive it; Presence.svelte wires it to the
 * network and mounts it once in the root layout.
 */

import { PRESENCE_INTERVAL_MS, PRESENCE_PATH } from './paths';

/** Just enough of an EventTarget for the scheduler. */
type Listening = {
	addEventListener(type: string, listener: () => void): void;
	removeEventListener(type: string, listener: () => void): void;
};
type DocumentLike = Listening & { visibilityState: string };
type WindowLike = Listening & {
	setInterval(handler: () => void, ms: number): number;
	clearInterval(id: number): void;
};

export type PresenceOptions = {
	/** Send a beat; its result is the caller's business (see Presence.svelte). */
	touch: () => void;
	/** Send the last beat before the page is hidden or unloaded (a beacon). */
	leave: () => void;
	intervalMs?: number;
	doc?: DocumentLike;
	win?: WindowLike;
	now?: () => number;
};

/**
 * `hidden` and `pagehide` (or `pageshow` and `visibilitychange`) arrive together
 * for the one event; a second beat within this window says nothing new.
 */
const DEDUPE_MS = 1_000;

/** Start beating. Returns the function that stops it and removes every listener. */
export function startPresence({
	touch,
	leave,
	intervalMs = PRESENCE_INTERVAL_MS,
	doc = document,
	win = window,
	now = Date.now
}: PresenceOptions): () => void {
	let timer: number | null = null;
	let lastTouch = -Infinity;
	let lastLeave = -Infinity;

	const visible = () => doc.visibilityState === 'visible';

	const stopBeating = () => {
		if (timer === null) return;
		win.clearInterval(timer);
		timer = null;
	};

	const touchOnce = () => {
		const at = now();
		if (at - lastTouch < DEDUPE_MS) return;
		lastTouch = at;
		touch();
	};

	/** Visible (again): beat now, then every interval for as long as it stays so. */
	const beat = () => {
		stopBeating();
		touchOnce();
		timer = win.setInterval(touch, intervalMs);
	};

	/** Hidden, unloading or about to be frozen: one last word, then silence. */
	const leaveOnce = () => {
		stopBeating();
		const at = now();
		if (at - lastLeave < DEDUPE_MS) return;
		lastLeave = at;
		leave();
	};

	const onVisibilityChange = () => (visible() ? beat() : leaveOnce());
	// A page restored from the back/forward cache is visible again without
	// Safari always saying so through visibilitychange.
	const onPageShow = () => {
		if (visible()) beat();
	};
	// Back online after a dropout: do not wait out the interval to catch up.
	const onOnline = () => {
		if (visible()) touchOnce();
	};

	doc.addEventListener('visibilitychange', onVisibilityChange);
	// `freeze` (Page Lifecycle, Chrome): a hidden tab about to be put to sleep.
	doc.addEventListener('freeze', leaveOnce);
	win.addEventListener('pageshow', onPageShow);
	win.addEventListener('pagehide', leaveOnce);
	win.addEventListener('online', onOnline);

	if (visible()) beat();

	return () => {
		stopBeating();
		doc.removeEventListener('visibilitychange', onVisibilityChange);
		doc.removeEventListener('freeze', leaveOnce);
		win.removeEventListener('pageshow', onPageShow);
		win.removeEventListener('pagehide', leaveOnce);
		win.removeEventListener('online', onOnline);
	};
}

/**
 * One beat over the network. `keepalive` lets it finish after the page that
 * sent it is gone. Browser only.
 */
export function sendBeat(): Promise<Response> {
	return fetch(PRESENCE_PATH, {
		method: 'POST',
		credentials: 'same-origin',
		keepalive: true,
		cache: 'no-store'
	});
}

/**
 * The parting beat. `sendBeacon` is what browsers promise to deliver after the
 * page is hidden, iOS Safari included; the keepalive fetch is the fallback
 * where it is missing or refuses (its in-flight budget is shared and small).
 */
export function sendLeave(): void {
	if (typeof navigator.sendBeacon === 'function' && navigator.sendBeacon(PRESENCE_PATH)) return;
	sendBeat().catch(() => {});
}
