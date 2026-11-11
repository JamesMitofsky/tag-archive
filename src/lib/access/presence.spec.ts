import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startPresence } from './presence';

/** A fake document + window whose events the test fires by hand. */
function stage(visibilityState: 'visible' | 'hidden' = 'visible') {
	const listeners = new Map<string, Set<() => void>>();
	const target = {
		addEventListener: (type: string, fn: () => void) => {
			if (!listeners.has(type)) listeners.set(type, new Set());
			listeners.get(type)!.add(fn);
		},
		removeEventListener: (type: string, fn: () => void) => void listeners.get(type)?.delete(fn)
	};
	const doc = { ...target, visibilityState: visibilityState as string };
	const win = {
		...target,
		setInterval: (fn: () => void, ms: number) => setInterval(fn, ms) as unknown as number,
		clearInterval: (id: number) => clearInterval(id)
	};
	const fire = (type: string) => listeners.get(type)?.forEach((fn) => fn());
	const listening = () => [...listeners.values()].reduce((n, set) => n + set.size, 0);
	return {
		doc,
		win,
		fire,
		listening,
		hide: () => (doc.visibilityState = 'hidden'),
		show: () => (doc.visibilityState = 'visible')
	};
}

const INTERVAL = 4 * 60 * 1000;

describe('startPresence', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	function start(s: ReturnType<typeof stage>) {
		const touch = vi.fn();
		const leave = vi.fn();
		const stop = startPresence({ touch, leave, intervalMs: INTERVAL, doc: s.doc, win: s.win });
		return { touch, leave, stop };
	}

	it('beats at once while visible, then every interval', () => {
		const s = stage();
		const { touch, leave } = start(s);
		expect(touch).toHaveBeenCalledTimes(1);
		vi.advanceTimersByTime(INTERVAL * 2);
		expect(touch).toHaveBeenCalledTimes(3);
		expect(leave).not.toHaveBeenCalled();
	});

	it('stays silent while hidden from the start', () => {
		const s = stage('hidden');
		const { touch } = start(s);
		vi.advanceTimersByTime(INTERVAL * 2);
		expect(touch).not.toHaveBeenCalled();
	});

	it('says goodbye once as the page hides, and stops beating', () => {
		const s = stage();
		const { touch, leave } = start(s);
		s.hide();
		s.fire('visibilitychange');
		s.fire('pagehide'); // arrives alongside, says nothing new
		expect(leave).toHaveBeenCalledTimes(1);
		vi.advanceTimersByTime(INTERVAL * 3);
		expect(touch).toHaveBeenCalledTimes(1);
	});

	it('beats the instant the page is back, and resumes the interval', () => {
		const s = stage();
		const { touch } = start(s);
		s.hide();
		s.fire('visibilitychange');
		vi.advanceTimersByTime(25 * 60 * 1000);
		s.show();
		s.fire('visibilitychange');
		s.fire('pageshow'); // a bfcache restore fires both; one beat is enough
		expect(touch).toHaveBeenCalledTimes(2);
		vi.advanceTimersByTime(INTERVAL);
		expect(touch).toHaveBeenCalledTimes(3);
	});

	it('treats a bfcache restore as coming back, even without visibilitychange', () => {
		const s = stage();
		const { touch } = start(s);
		s.hide();
		s.fire('pagehide');
		vi.advanceTimersByTime(DEDUPE_GAP);
		s.show();
		s.fire('pageshow');
		expect(touch).toHaveBeenCalledTimes(2);
	});

	it('catches up as soon as the connection is back', () => {
		const s = stage();
		const { touch } = start(s);
		vi.advanceTimersByTime(DEDUPE_GAP);
		s.fire('online');
		expect(touch).toHaveBeenCalledTimes(2);
		s.hide();
		s.fire('visibilitychange');
		s.fire('online'); // hidden: nothing to prove
		expect(touch).toHaveBeenCalledTimes(2);
	});

	it('freezing a hidden tab counts as leaving', () => {
		const s = stage();
		const { leave } = start(s);
		s.hide();
		s.fire('freeze');
		expect(leave).toHaveBeenCalledTimes(1);
	});

	it('stop() ends the beats and removes every listener', () => {
		const s = stage();
		const { touch, stop } = start(s);
		expect(s.listening()).toBeGreaterThan(0);
		stop();
		expect(s.listening()).toBe(0);
		vi.advanceTimersByTime(INTERVAL * 2);
		expect(touch).toHaveBeenCalledTimes(1);
	});
});

/** Longer than the scheduler's de-duplication window, shorter than an interval. */
const DEDUPE_GAP = 2_000;
