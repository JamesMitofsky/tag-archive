/**
 * Holds work back until the press that is under way has produced its click.
 *
 * Pressing a control moves focus as `mousedown`'s default action, so the field
 * left behind fires `focusout` mid-press, before `mouseup`. A form that reveals
 * that field's error on blur grows by a line right then, and whatever sat below
 * it slides down. `mouseup` lands where the pointer still is, on whatever is
 * there now, and the browser sends `click` to the nearest element holding both
 * ends of the press: usually the form. So the control that was pressed never
 * hears it, and needs a second press. Touch taps go the same way: their
 * `mousedown`, `mouseup` and `click` follow the finger lifting, and the
 * `mouseup` is hit-tested afresh after `mousedown` has moved focus.
 *
 * Mouse events, not pointer events, mark the press, because `mousedown` is the
 * event that moves focus for touch as well: a tap's `pointerdown` and
 * `pointerup` have both fired before its `mousedown`.
 */

let pressing = false;
let held: (() => void)[] = [];
let listening = false;

function release() {
	pressing = false;
	const run = held;
	held = [];
	for (const fn of run) fn();
}

function listen() {
	if (listening || typeof window === 'undefined') return;
	listening = true;
	const opts = { capture: true, passive: true };
	window.addEventListener(
		'mousedown',
		() => {
			// A press whose end went unseen lets go of what it held first.
			release();
			pressing = true;
		},
		opts
	);
	// `click` is dispatched after `mouseup` in the same task, so a timeout set
	// here runs once it has landed, or once it is clear none is coming.
	const afterward = () => setTimeout(release);
	window.addEventListener('mouseup', afterward, opts);
	// Neither a native drag nor a window losing focus mid-press ends in
	// `mouseup`, and a key pressed after a stray press ends it as well.
	window.addEventListener('dragend', afterward, opts);
	window.addEventListener('keydown', release, opts);
	window.addEventListener('blur', release);
}

/**
 * Start watching for presses. Call it before the first press it should catch,
 * as when a form is set up: a press already under way goes unnoticed.
 */
export function watchPresses(): void {
	listen();
}

/** Run `fn` now, or once the press under way has produced its click. */
export function afterPress(fn: () => void): void {
	listen();
	if (pressing) held.push(fn);
	else fn();
}
